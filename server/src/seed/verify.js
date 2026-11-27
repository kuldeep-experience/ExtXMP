import mongoose from 'mongoose';
import { pathToFileURL } from 'node:url';
import '../models/AIConversation.js';
import '../models/AIMessage.js';
import '../models/Conversation.js';
import '../models/ExperienceEntry.js';
import '../models/Message.js';
import '../models/Professional.js';
import '../models/RecentComparison.js';
import '../models/RecentlyViewedProfessional.js';
import '../models/RecommendationSearch.js';
import '../models/Review.js';
import '../models/ReviewInsight.js';
import '../models/SavedFolder.js';
import '../models/SavedProfessional.js';
import '../models/SavedSearch.js';
import '../models/SearchHistory.js';
import '../models/ServiceRecord.js';
import '../models/Visitor.js';
import { demoVisitors } from './visitors.js';

const M = (name) => mongoose.model(name);
const result = (name, ok, detail = '') => ({ name, ok: !!ok, detail });

// Every reference stored in the database, as [model, field, referenced model]. Each must point at an existing document.
const REFS = [
  ['Review', 'professional', 'Professional'],
  ['SavedFolder', 'visitor', 'Visitor'], ['SavedProfessional', 'visitor', 'Visitor'], ['SavedProfessional', 'professional', 'Professional'], ['SavedProfessional', 'folder', 'SavedFolder'],
  ['SavedSearch', 'visitor', 'Visitor'],
  ['ExperienceEntry', 'visitor', 'Visitor'], ['ExperienceEntry', 'professional', 'Professional'],
  ['ServiceRecord', 'visitor', 'Visitor'], ['ServiceRecord', 'professional', 'Professional'], ['ServiceRecord', 'experience', 'ExperienceEntry'],
  ['Conversation', 'visitor', 'Visitor'], ['Conversation', 'professional', 'Professional'],
  ['Message', 'conversation', 'Conversation'], ['Message', 'visitor', 'Visitor'], ['Message', 'professional', 'Professional'],
  ['AIConversation', 'visitor', 'Visitor'], ['AIMessage', 'conversation', 'AIConversation'], ['AIMessage', 'visitor', 'Visitor'], ['AIMessage', 'search', 'RecommendationSearch'],
  ['RecommendationSearch', 'visitor', 'Visitor'], ['RecommendationSearch', 'conversation', 'AIConversation'], ['RecommendationSearch', 'recommendations.professional', 'Professional'],
  ['ReviewInsight', 'professional', 'Professional'], ['ReviewInsight', 'sourceReviewIds', 'Review'],
  ['RecentlyViewedProfessional', 'visitor', 'Visitor'], ['RecentlyViewedProfessional', 'professional', 'Professional'],
  ['SearchHistory', 'visitor', 'Visitor'], ['RecentComparison', 'visitor', 'Visitor'], ['RecentComparison', 'professionals', 'Professional'],
];

const perVisitorMin = [
  ['SavedProfessional', 5, 'saved professionals'], ['SavedFolder', 3, 'folders'], ['SavedSearch', 5, 'saved searches'],
  ['ExperienceEntry', 5, 'experience records'], ['ServiceRecord', 5, 'service records'], ['Conversation', 3, 'conversations'], ['AIConversation', 3, 'AI conversations'],
  ['RecentlyViewedProfessional', 10, 'recently viewed'], ['SearchHistory', 5, 'searches in history'], ['RecentComparison', 3, 'comparisons'],
];

// Checks the seeded database against the requirements. Returns a list of { name, ok, detail }.
export async function verifySeed() {
  const checks = [];
  const add = (name, ok, detail) => checks.push(result(name, ok, detail));

  // ---- volume ----
  const pros = await M('Professional').find().lean();
  const active = pros.filter((p) => p.profileStatus === 'active');
  add('at least 30 professionals', active.length >= 30, `${active.length} active`);
  add('at least 6 categories', new Set(active.map((p) => p.categorySlug)).size >= 6, `${new Set(active.map((p) => p.categorySlug)).size}`);
  const visitors = await M('Visitor').find({ email: { $in: demoVisitors.map((v) => v.email) } }).select('+passwordHash').lean();
  add('at least 5 demo visitors', visitors.length >= 5, `${visitors.length}`);
  add('demo passwords are bcrypt hashes', visitors.length > 0 && visitors.every((v) => /^\$2[aby]\$\d\d\$/.test(v.passwordHash)));

  // ---- reviews and rating statistics ----
  const grouped = await M('Review').aggregate([{ $match: { moderationStatus: 'approved', visibility: 'visible' } }, { $group: { _id: '$professional', n: { $sum: 1 }, avg: { $avg: '$rating' } } }]);
  const stats = new Map(grouped.map((g) => [String(g._id), g]));
  const badCount = active.filter((p) => { const g = stats.get(String(p._id)); return !g || g.n < 15 || g.n > 20; });
  add('every active professional has 15-20 public reviews', badCount.length === 0, badCount.map((p) => p.fullName).join(', '));
  const badStats = pros.filter((p) => { const g = stats.get(String(p._id)); return !g || p.reviewCount !== g.n || p.averageRating !== Math.round(g.avg * 10) / 10; });
  add('review counts and average ratings match the review data', badStats.length === 0, badStats.map((p) => p.fullName).join(', '));
  const ratings = active.map((p) => p.averageRating);
  add('ratings vary between 3.0 and 5.0', Math.min(...ratings) >= 3 && Math.max(...ratings) <= 5 && Math.max(...ratings) - Math.min(...ratings) >= 1, `${Math.min(...ratings)}-${Math.max(...ratings)}`);
  add('verified and unverified professionals both exist', active.some((p) => p.verificationStatus === 'verified') && active.some((p) => p.verificationStatus === 'unverified'));

  // ---- references ----
  for (const [model, field, ref] of REFS) {
    const ids = (await M(model).distinct(field)).filter(Boolean);
    const found = await M(ref).countDocuments({ _id: { $in: ids } });
    add(`${model}.${field} -> ${ref}`, found === ids.length, found === ids.length ? `${ids.length} references` : `${ids.length - found} dangling`);
  }

  // ---- consistency between related records ----
  const own = async (model, field, refModel, refField) => {
    const rows = await M(model).find({ [field]: { $ne: null } }).select(`visitor professional ${field}`).lean();
    const refs = new Map((await M(refModel).find({ _id: { $in: rows.map((r) => r[field]) } }).select('visitor professional').lean()).map((r) => [String(r._id), r]));
    return rows.filter((r) => { const t = refs.get(String(r[field])); return !t || String(t.visitor) !== String(r.visitor) || (refField && String(t.professional) !== String(r.professional)); }).length;
  };
  add('saved professionals sit in their own visitor\'s folders', (await own('SavedProfessional', 'folder', 'SavedFolder')) === 0);
  add('service records link to their own visitor\'s experience with the same professional', (await own('ServiceRecord', 'experience', 'ExperienceEntry', true)) === 0);
  const convs = await M('Conversation').find().lean();
  const msgs = await M('Message').find().lean();
  const byConv = new Map();
  msgs.forEach((m) => (byConv.get(String(m.conversation)) ?? byConv.set(String(m.conversation), []).get(String(m.conversation))).push(m));
  const convsById = new Map(convs.map((c) => [String(c._id), c]));
  add('messages come from the conversation\'s visitor and professional', msgs.every((m) => { const c = convsById.get(String(m.conversation)); return c && String(c.visitor) === String(m.visitor) && String(c.professional) === String(m.professional); }));
  add('conversation counters match their messages', convs.every((c) => { const ms = byConv.get(String(c._id)) ?? []; return c.messageCount === ms.length && c.unreadCount === ms.filter((m) => m.senderType === 'professional' && !m.readAt).length; }));
  add('conversations have 4-6 messages from both sides', convs.every((c) => { const ms = byConv.get(String(c._id)) ?? []; return ms.length >= 4 && ms.some((m) => m.senderType === 'visitor') && ms.some((m) => m.senderType === 'professional'); }));

  // ---- per demo visitor minimums ----
  for (const [model, min, label] of perVisitorMin) {
    const low = [];
    for (const v of visitors) if (await M(model).countDocuments({ visitor: v._id }) < min) low.push(v.email);
    add(`every demo visitor has at least ${min} ${label}`, low.length === 0, low.join(', '));
  }


  // ---- review insights ----
  const insights = await M('ReviewInsight').find().lean();
  add('at least 15 review insights', insights.length >= 15, `${insights.length}`);
  let badSources = 0;
  for (const i of insights) {
    const ok = await M('Review').countDocuments({ _id: { $in: i.sourceReviewIds }, professional: i.professional, moderationStatus: 'approved', visibility: 'visible' });
    if (ok !== i.sourceReviewIds.length || i.reviewsAnalyzed !== ok) badSources++;
  }
  add('insight sources are approved, visible reviews of the same professional', badSources === 0, `${badSources} bad`);

  // ---- no duplicates ----
  for (const [model, keys] of [['SavedProfessional', ['visitor', 'professional']], ['RecentlyViewedProfessional', ['visitor', 'professional']], ['Conversation', ['visitor', 'professional']], ['SearchHistory', ['visitor', 'queryKey']], ['RecentComparison', ['visitor', 'setKey']], ['SavedFolder', ['visitor', 'nameKey']], ['SavedSearch', ['visitor', 'nameKey']]]) {
    const dup = await M(model).aggregate([{ $group: { _id: Object.fromEntries(keys.map((k) => [k, `$${k}`])), n: { $sum: 1 } } }, { $match: { n: { $gt: 1 } } }]);
    add(`no duplicate ${model} (${keys.join(' + ')})`, dup.length === 0, `${dup.length} duplicates`);
  }
  return checks;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { connectDB } = await import('../config/db.js');
  await connectDB();
  const checks = await verifySeed();
  for (const c of checks) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}${c.detail ? `  (${c.detail})` : ''}`);
  const failed = checks.filter((c) => !c.ok).length;
  console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
  await mongoose.disconnect();
  process.exit(failed ? 1 : 0);
}
