// Deterministic review analyzer: the "demo insight generator". It only reads the text of real reviews, finds what
// reviewers talk about with a keyword lexicon, and reports counts plus the reviews that back each statement.

export const THEMES = [
  { id: 'communication', label: 'Communication', praise: 'Responsive, clear communication', concern: 'Communication or responsiveness could be better', rx: /communicat|responsive|respond|messages?\b|\bcalls?\b|same day|informed|\breach(?:ed)?\b|follow-?ups?|check-?ins?|response times?|reminders?|arrival times?|updates?\b|replied/i },
  { id: 'timeliness', label: 'Timeliness & scheduling', praise: 'On time and on schedule', concern: 'Delays or scheduling difficulties', rx: /on time|on schedule|timeline|schedul|longer than|took longer|past the original|delay|within the first week|prompt|quick|same day|running late|\bdays\b/i },
  { id: 'pricing', label: 'Pricing & fees', praise: 'Fair, transparent pricing', concern: 'Pricing or billing clarity', rx: /\bprice|pricing|priced|\bfees?\b|\bcosts?\b|billing|premium|\brates?\b|saved|savings|estimate|quote|payment|affordable|competitive|money/i },
  { id: 'knowledge', label: 'Knowledge & expertise', praise: 'Knowledgeable and experienced', concern: 'Gaps in knowledge or expertise', rx: /knowledg|expert|experienced|diagnos|specializ|thorough|attention to detail|advice|guidance|knows the neighborhoods|found options/i },
  { id: 'clarity', label: 'Clear explanations', praise: 'Explains things clearly', concern: 'Explanations were not always clear', rx: /explain|\bclear\b|clearly|plain (?:english|language)|transparent|walked us through|understand|straightforward|no surprises|made it easy/i },
  { id: 'results', label: 'Results & outcomes', praise: 'Delivered good results', concern: 'Results fell short of expectations', rx: /negotiat|\boffers?\b|settlement|outcome|resolved|\bsaved\b|\bsold\b|lowered|\bfixed\b|finished the job|coverage gaps|got us|results?\b/i },
  { id: 'professionalism', label: 'Professionalism & care', praise: 'Professional, courteous and careful', concern: 'Professionalism could be better', rx: /\bprofessional\b(?!\s+experiences?)|courteous|respectful|patient|patience|careful|spotless|polite|trustworth|honest|reliab|organi[sz]ation|attentive/i },
  { id: 'process', label: 'Process & paperwork', praise: 'A smooth process', concern: 'The process felt slow, long or stressful', rx: /paperwork|onboarding|documents?|\bwaves\b|\bprocess\b|appraisal|stressful/i },
  { id: 'support', label: 'Support & follow-through', praise: 'Supportive from start to finish', concern: 'Wanted more help or follow-through', rx: /\bhelp(?:ed|ful)?\b|support|by our side|followed up|guided|handled|staging|marketing|assist/i },
];

// Phrases that signal a complaint or an unmet expectation. Deliberately narrow: "a difficult claim" or "a stressful topic" are not complaints.
export const CONCERN_CUE = /\b(?:slow(?:ed|er|ly)?|longer than|took longer|took (?:a couple|several)|past the original|delay\w*|less clear|unclear|harder to|hard to|difficult to (?:reach|schedule|get)|wish\b|could be better|expected more|more stressful|lengthy|waves|would have liked|room to improve|running late|arrived late)\b/i;
const POSITIVE_CUE = /solid|good|great|fair|competitive|helpful|knowledgeable|professional|strong|quality|\bwell\b|trustworth|honest|clear|responsive|reliable|decent|recommend/i;

export const TRAITS = [
  ['Knowledgeable', /knowledgeable|knows the|expertise|\bexpert\b/i],
  ['Professional', /\bprofessional\b(?!\s+experiences?)/i],
  ['Responsive', /responsive|responded|replied|same day/i],
  ['Honest and transparent', /honest|transparent|no surprises/i],
  ['Patient', /patient|patience|never made us feel rushed/i],
  ['Thorough and detail-oriented', /thorough|careful|attention to detail/i],
  ['Courteous and respectful', /courteous|respectful|polite/i],
  ['Trustworthy', /trustworth/i],
  ['Reliable', /reliab/i],
  ['Organized', /organi[sz]ation|organi[sz]ed/i],
];

// Clauses are exact slices of the original text, so every quote can be found in the review verbatim.
export function splitClauses(text) {
  return String(text).split(/(?:,?\s+(?:though|but|although|however|while)\s+|[.;!?]+\s*)/i).map((c) => c.trim()).filter((c) => c.length >= 3);
}

export function commonality(count, total) {
  if (count >= 3 && count / total >= 0.2) return 'common';
  if (count >= 2) return 'occasional';
  return 'isolated'; // a single review: shown as an isolated comment, never as a theme
}

// What one review says: positive and concern mentions per theme (each review counts once per theme and polarity), and trait words.
export function analyzeReview(r) {
  const mentions = []; // { theme, polarity, quote }
  const traits = new Set();
  const sources = [['title', r.title], ['text', r.text]];
  for (const [field, content] of sources) {
    for (const clause of splitClauses(content)) {
      const concern = CONCERN_CUE.test(clause);
      const positive = !concern && (r.rating >= 4 || POSITIVE_CUE.test(clause));
      if (!concern && !positive) continue;
      for (const t of THEMES) if (t.rx.test(clause)) mentions.push({ theme: t.id, polarity: concern ? 'concern' : 'positive', quote: { reviewId: r.id, text: clause, field } });
      if (positive) for (const [label, rx] of TRAITS) if (rx.test(clause)) traits.add(label);
    }
  }
  return { mentions, traits };
}

const monthYear = (d) => d.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
const pick = (list, byId) => [...list].sort((a, b) => byId.get(b.reviewId).date - byId.get(a.reviewId).date || a.reviewId.localeCompare(b.reviewId)) // newest review first
  .find((q) => q.text.length >= 15 && q.text.length <= 180) ?? list[0];

export function analyzeReviews(digest) {
  const { count, byId } = digest;
  const themeHits = new Map(THEMES.map((t) => [t.id, { positive: new Map(), concern: new Map() }]));
  const traitHits = new Map();
  const serviceHits = new Map();

  for (const r of digest.reviews) {
    const { mentions, traits } = analyzeReview(r);
    for (const m of mentions) {
      const bucket = themeHits.get(m.theme)[m.polarity];
      if (!bucket.has(r.id)) bucket.set(r.id, []);
      bucket.get(r.id).push(m.quote);
    }
    for (const t of traits) { if (!traitHits.has(t)) traitHits.set(t, []); traitHits.get(t).push(r.id); }
    if (r.service) { if (!serviceHits.has(r.service)) serviceHits.set(r.service, []); serviceHits.get(r.service).push(r.id); }
  }

  const themeOf = new Map(); // item -> theme, so the summary can use the short theme names
  const themeItem = (t, polarity, label) => {
    const hits = themeHits.get(t.id)[polarity];
    const ids = [...hits.keys()];
    const quote = pick([...hits.values()].map((qs) => qs[0]), byId);
    const it = { label, detail: null, count: ids.length, commonality: commonality(ids.length, count), sourceReviewIds: ids, quote: quote ? { reviewId: quote.reviewId, text: quote.text } : null };
    themeOf.set(it, t);
    return it;
  };
  const ranked = (polarity, labelOf) => THEMES.filter((t) => themeHits.get(t.id)[polarity].size > 0).map((t) => themeItem(t, polarity, labelOf(t)))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  const positiveFeedback = ranked('positive', (t) => t.praise).slice(0, 6);
  const concerns = ranked('concern', (t) => t.concern).slice(0, 6);
  const strengths = [...traitHits].map(([label, ids]) => ({ label, detail: null, count: ids.length, commonality: commonality(ids.length, count), sourceReviewIds: ids, quote: null }))
    .filter((s) => s.count >= 2).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)).slice(0, 6);
  const services = [...serviceHits].map(([label, ids]) => ({ label, detail: null, count: ids.length, commonality: commonality(ids.length, count), sourceReviewIds: ids, quote: null }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)).slice(0, 6);

  const experienceThemes = THEMES.map((t) => {
    const pos = [...themeHits.get(t.id).positive.keys()], con = [...themeHits.get(t.id).concern.keys()];
    const ids = [...new Set([...pos, ...con])];
    const sentiment = !con.length ? 'positive' : con.length >= pos.length ? 'mostly negative' : 'mixed';
    return { label: t.label, detail: null, count: ids.length, positiveCount: pos.length, concernCount: con.length, sentiment, commonality: commonality(ids.length, count), sourceReviewIds: ids, quote: null };
  }).filter((t) => t.count > 0).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)).slice(0, 7);

  return { summary: buildSummary(digest, positiveFeedback, concerns, themeOf), positiveFeedback, strengths, concerns, recentTrends: buildTrends(digest, themeHits), services, experienceThemes };
}

function buildSummary(d, positive, concerns, themeOf) {
  const range = `${monthYear(d.dateRange.from)} to ${monthYear(d.dateRange.to)}`;
  let text = `Based on ${d.count} approved reviews from ${range}, the average rating is ${d.average.toFixed(1)} out of 5, and ${d.positiveShare}% of reviewers gave 4 or 5 stars.`;
  const common = positive.filter((p) => p.commonality !== 'isolated').slice(0, 3);
  if (common.length) text += ` Reviewers most often praise ${common.map((p) => themeOf.get(p).label.toLowerCase()).join(', ')}.`;
  const topConcern = concerns.find((c) => c.commonality !== 'isolated');
  if (topConcern) text += ` The concern raised most often relates to ${themeOf.get(topConcern).label.toLowerCase()} (${topConcern.count} of ${d.count} reviews).`;
  else if (concerns.length) text += ' A few reviewers raised concerns, but each was a single comment.';
  else text += ' No concerns were raised in these reviews.';
  return { text, averageRating: d.average, reviewCount: d.count, distribution: d.distribution, positiveShare: d.positiveShare, dateRange: { from: d.dateRange.from, to: d.dateRange.to } };
}

export function ratingTrend(d) {
  if (d.earlier.length < 3) return { label: 'Not enough reviews to compare recent and earlier feedback', detail: null, direction: 'info', sourceReviewIds: d.recent.map((r) => r.id) };
  const diff = Math.round((d.avgRecent - d.avgEarlier) * 10) / 10;
  const direction = diff >= 0.3 ? 'up' : diff <= -0.3 ? 'down' : 'steady';
  const since = monthYear(d.recent.at(-1).date);
  return {
    label: direction === 'up' ? 'Recent ratings are higher than earlier ones' : direction === 'down' ? 'Recent ratings are lower than earlier ones' : 'Ratings have been steady',
    detail: `The latest ${d.recent.length} reviews (since ${since}) average ${d.avgRecent.toFixed(1)}, compared with ${d.avgEarlier.toFixed(1)} for the ${d.earlier.length} before them.`,
    direction, sourceReviewIds: d.recent.map((r) => r.id),
  };
}

function buildTrends(d, themeHits) {
  const trends = [ratingTrend(d)];
  if (trends[0].direction === 'info') return trends;
  const recentIds = new Set(d.recent.map((r) => r.id));
  for (const t of THEMES) for (const polarity of ['positive', 'concern']) {
    const ids = [...themeHits.get(t.id)[polarity].keys()];
    const inRecent = ids.filter((id) => recentIds.has(id));
    const shareRecent = inRecent.length / d.recent.length, shareEarlier = (ids.length - inRecent.length) / d.earlier.length;
    if (inRecent.length >= 2 && shareRecent - shareEarlier >= 0.25) {
      trends.push({
        label: polarity === 'positive' ? `${t.label} is praised more often in recent reviews` : `${t.label} concerns appear more often in recent reviews`,
        detail: 'Small sample: based on the most recent reviews only.', direction: polarity === 'positive' ? 'up' : 'down', sourceReviewIds: inRecent,
      });
    }
  }
  return trends.slice(0, 4);
}
