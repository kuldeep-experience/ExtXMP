import Professional from '../../models/Professional.js';
import AIConversation from '../../models/AIConversation.js';
import AIMessage from '../../models/AIMessage.js';
import RecommendationSearch from '../../models/RecommendationSearch.js';
import { ACTIVE, listQuery, searchProfessionals } from '../professionalSearch.js';
import { toDirectoryQuery } from '../savedSearchQuery.js';
import { directoryFacts } from './facts.js';
import { emptyCriteria, extractIntent, hasCriteria, mergeCriteria } from './intent.js';
import { NEAR_ME_KM, rankProfessionals } from './ranking.js';
import { explain, modelExplanations } from './explain.js';

const CONTEXT_MESSAGES = 6;
const MAX_CLARIFY = 2; // follow-up questions in a row before the assistant must recommend with what it has
// A model-written question is shown only if it is short plain text: no links or addresses, nothing instruction-like.
const safeQuestion = (q) => (typeof q === 'string' && q.trim() && q.length <= 300 && !/https?:|www\.|@|\.(com|net|org|io)\b|ignore|instruction|system prompt/i.test(q) ? q.trim() : null);
export const PUBLIC_FIELDS = '_id fullName profileImage title category categorySlug location city state specializations yearsOfExperience averageRating reviewCount verificationStatus';

export function summarize(c, facts) {
  const cat = c.category ? facts.categories.get(c.category)?.toLowerCase() : 'professionals';
  const bits = [cat];
  if (c.location) bits.push(`in ${c.location}`);
  if (c.nearMe) bits.push('near you');
  if (c.minExperience != null) bits.push(`with at least ${c.minExperience} years of experience`);
  if (c.minRating != null) bits.push(`rated ${c.minRating}+`);
  if (c.specializations.length) bits.push(`specializing in ${c.specializations.join(', ')}`);
  if (c.services.length) bits.push(`offering ${c.services.join(', ')}`);
  if (c.topics.length) bits.push(`for ${c.topics.map((t) => `“${t}”`).join(', ')}`);
  if (c.verifiedOnly) bits.push('(verified only)');
  return bits.join(' ');
}

function directoryParams(c, coords) {
  const near = c.nearMe && coords;
  const q = toDirectoryQuery({
    category: c.category, location: c.nearMe ? '' : c.location,
    latitude: near ? coords.lat : null, longitude: near ? coords.lng : null, maxDistanceKm: near ? NEAR_ME_KM : null,
    minRating: c.minRating, specializations: c.specializations, serviceRequirements: c.services,
    additionalFilters: { minExperience: c.minExperience, verifiedOnly: c.verifiedOnly, sort: 'rating' },
  });
  return q;
}
const withoutCoords = ({ lat, lng, maxDistanceKm, ...rest }) => (lat != null ? { ...rest, nearMe: true } : rest);

// Retrieval through the existing directory search. If nothing matches, drop the softer requirements one at a time
// (specializations/services, verification, rating, experience) and report exactly what was dropped. Category and location are never dropped.
async function retrieve(criteria, coords) {
  const steps = [
    ['specializations and services', (c) => ({ ...c, topics: [...c.topics, ...c.specializations, ...c.services].slice(0, 5), specializations: [], services: [] })],
    ['verified-only', (c) => ({ ...c, verifiedOnly: false })],
    ['minimum rating', (c) => ({ ...c, minRating: null })],
    ['minimum experience', (c) => ({ ...c, minExperience: null })],
  ];
  const run = async (c) => searchProfessionals(listQuery.parse({ ...directoryParams(c, coords), sort: 'rating', limit: 50, page: 1 }));
  let current = criteria;
  const relaxed = [];
  let result = await run(current);
  for (const [label, apply] of steps) {
    if (result.data.length) break;
    const next = apply(current);
    if (JSON.stringify(next) === JSON.stringify(current)) continue; // nothing to relax
    current = next;
    relaxed.push(label);
    result = await run(current);
  }
  return { result, relaxed, used: current };
}

function buildReply({ outcome, criteria, facts, ranked, total, relaxed, note }) {
  const summary = summarize(criteria, facts);
  let text;
  if (outcome === 'unclear') {
    text = "I couldn't tell what kind of professional you need. Describe the category (for example a real estate agent or financial advisor), where, and anything that matters such as years of experience or a minimum rating.";
  } else if (outcome === 'needs_location') {
    text = 'To search near you I need your location. Use the “Use my location” button, or tell me a city or state instead.';
  } else if (outcome === 'empty') {
    const cities = facts.locations.slice().sort((a, b) => b.count - a.count).slice(0, 8).map((l) => l.label).join(', ');
    text = `No professionals in our directory match: ${summary}.${criteria.location ? ` The directory currently covers cities such as ${cities}.` : ''} Try a different location or fewer requirements.`;
  } else {
    text = `Here ${ranked.length === 1 ? 'is the best match' : `are the top ${ranked.length} matches`} for ${summary}. They are ranked by how well they meet what you asked, then by rating, number of reviews and experience.`;
    if (relaxed.length) text += ` No one met every requirement, so I relaxed: ${relaxed.join(', ')}. Each card shows what is not met.`;
    const missingTopics = criteria.topics.filter((t) => ranked.every((r) => r.unmet.some((u) => u.includes(`“${t}”`))));
    if (missingTopics.length) text += ` No profile mentions ${missingTopics.map((t) => `“${t}”`).join(', ')}, so these are the best overall matches in the category.`;
    if (total > ranked.length) text += ` ${total} professionals matched in total.`;
  }
  return note ? `${text} ${note}` : text;
}

// Runs one assistant turn and stores it. `coords` (device location) is used for filtering only: it is never sent to a model or stored.
export async function runRecommendation({ visitor, conversation, message, coords = null, limit = 5, provider, at = new Date() }) {
  const facts = await directoryFacts();
  const [lastTwo, recent] = await Promise.all([
    RecommendationSearch.find({ conversation: conversation._id }).sort({ createdAt: -1, _id: -1 }).limit(MAX_CLARIFY).lean(),
    AIMessage.find({ conversation: conversation._id }).sort({ createdAt: -1 }).limit(CONTEXT_MESSAGES).lean(),
  ]);
  const last = lastTwo[0];
  let clarifyRounds = 0;
  for (const s of lastTwo) { if (s.outcome !== 'clarify') break; clarifyRounds += 1; }
  const previous = last?.criteria && hasCriteria({ ...emptyCriteria(), ...last.criteria }) ? { ...emptyCriteria(), ...last.criteria } : null;
  const context = recent.reverse().map((m) => ({ role: m.role, content: m.content })); // visitor text only: no ids, names, e-mail or coordinates

  const { intent, mode, note } = await extractIntent({ message, previous, recent: context, facts, provider, clarifyRounds });
  const criteria = mergeCriteria(previous, intent, message);

  let outcome, ranked = [], total = 0, relaxed = [], directoryQuery = {}, used = criteria;
  const question = mode === 'live' && clarifyRounds < MAX_CLARIFY ? safeQuestion(intent.followUp) : null;
  if (question) outcome = 'clarify'; // the assistant asks first; the visitor's answer is merged into these criteria next turn
  else if (!hasCriteria(criteria)) outcome = 'unclear';
  else if (criteria.nearMe && !coords) outcome = 'needs_location';
  else {
    const r = await retrieve(criteria, coords);
    relaxed = r.relaxed; used = r.used; total = r.result.pagination.total;
    directoryQuery = withoutCoords(directoryParams(used, coords));
    // rank against what the visitor asked for (not the relaxed version) so unmet requirements are visible on each card
    ranked = rankProfessionals(r.result.data, { ...criteria, topics: used.topics }, coords).slice(0, limit);
    outcome = ranked.length ? 'results' : 'empty';
  }

  const recommendations = ranked.map((r) => ({ professional: r.pro._id, score: r.score, matched: r.matched, unmet: r.unmet, explanation: explain(r.pro, r), aiExplanation: null }));
  if (!provider.isDemo && mode === 'live' && ranked.length) {
    const wording = await modelExplanations({ provider, criteriaSummary: summarize(criteria, facts), ranked });
    recommendations.forEach((rec) => { rec.aiExplanation = wording[String(rec.professional)] ?? null; });
  }

  const reply = outcome === 'clarify' ? question : buildReply({ outcome, criteria, facts, ranked, total, relaxed, note });
  const userMsg = await AIMessage.create({ conversation: conversation._id, visitor: visitor._id, role: 'user', content: message, createdAt: at });
  const search = await RecommendationSearch.create({
    visitor: visitor._id, conversation: conversation._id, userMessage: message, assistantResponse: reply,
    criteria, directoryQuery, recommendations, totalCandidates: total, relaxed, mode, note, outcome, createdAt: at,
  });
  const assistantMsg = await AIMessage.create({ conversation: conversation._id, visitor: visitor._id, role: 'assistant', content: reply, search: search._id, createdAt: new Date(at.getTime() + 1) });

  const untitled = conversation.messageCount === 0 && conversation.title === 'New conversation'; // an explicit title is kept
  await AIConversation.updateOne({ _id: conversation._id }, {
    $inc: { messageCount: 2 }, $set: { lastMessageAt: assistantMsg.createdAt, ...(untitled && { title: message.slice(0, 80) }) },
  });
  return { userMessage: userMsg, assistantMessage: assistantMsg, search };
}

// Attaches current, public professional data to stored searches. Professionals that are no longer active are left out.
export async function hydrateSearches(searches) {
  const ids = [...new Set(searches.flatMap((s) => s.recommendations.map((r) => String(r.professional))))];
  const pros = await Professional.find({ _id: { $in: ids }, ...ACTIVE }).select(PUBLIC_FIELDS).lean();
  const byId = new Map(pros.map((p) => [String(p._id), p]));
  return new Map(searches.map((s) => {
    const o = typeof s.toObject === 'function' ? s.toObject() : s;
    const recs = o.recommendations.filter((r) => byId.has(String(r.professional))).map((r) => {
      const p = byId.get(String(r.professional));
      const wanted = [...(o.criteria.specializations || []), ...(o.criteria.services || [])].map((x) => x.toLowerCase());
      const relevant = p.specializations.filter((x) => wanted.includes(x.toLowerCase()));
      return { professional: p, score: r.score, matched: r.matched, unmet: r.unmet, explanation: r.explanation, aiExplanation: r.aiExplanation, relevantSpecializations: relevant.length ? relevant : p.specializations.slice(0, 3) };
    });
    return [String(o._id), { _id: o._id, criteria: o.criteria, relaxed: o.relaxed, totalCandidates: o.totalCandidates, mode: o.mode, note: o.note, outcome: o.outcome, recommendations: recs }];
  }));
}
