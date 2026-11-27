import { env } from '../config/env.js';
import Visitor from '../models/Visitor.js';
import RecentlyViewedProfessional from '../models/RecentlyViewedProfessional.js';
import SearchHistory from '../models/SearchHistory.js';
import RecentComparison from '../models/RecentComparison.js';

export const DAY = 86400000;
export const RETENTION_OPTIONS = [30, 90, 180, 365];
// Mutable so tests can change the window; the default comes from the environment.
export const historyPolicy = { dedupMs: env.RECENTLY_VIEWED_DEDUP_MINUTES * 60000, maxViewed: 100, maxSearches: 50, maxComparisons: 20 };

export const settingsOf = (visitor) => ({
  trackHistory: visitor.privacySettings?.trackHistory ?? true,
  retentionDays: visitor.privacySettings?.historyRetentionDays ?? 90,
});

const collections = [[RecentlyViewedProfessional, 'lastViewedAt'], [SearchHistory, 'searchedAt'], [RecentComparison, 'comparedAt']];

// Deletes this visitor's history older than their chosen retention period.
export async function purgeForVisitor(visitor) {
  const cutoff = new Date(Date.now() - settingsOf(visitor).retentionDays * DAY);
  await Promise.all(collections.map(([Model, field]) => Model.deleteMany({ visitor: visitor._id, [field]: { $lt: cutoff } })));
}

// Periodic sweep for everyone (reads only purge the reading visitor). Visitors are grouped by retention period.
// ponytail: one $in per retention bucket; switch to batches if the visitor count grows into the hundreds of thousands.
export async function purgeAll() {
  for (const days of RETENTION_OPTIONS) {
    const filter = days === 90 ? { $or: [{ 'privacySettings.historyRetentionDays': 90 }, { 'privacySettings.historyRetentionDays': { $exists: false } }] } : { 'privacySettings.historyRetentionDays': days };
    const ids = await Visitor.find(filter).distinct('_id');
    if (!ids.length) continue;
    const cutoff = new Date(Date.now() - days * DAY);
    await Promise.all(collections.map(([Model, field]) => Model.deleteMany({ visitor: { $in: ids }, [field]: { $lt: cutoff } })));
  }
}

// Keeps only the newest `max` entries for a visitor.
export async function trim(Model, visitorId, field, max) {
  const extra = await Model.find({ visitor: visitorId }).sort({ [field]: -1, _id: -1 }).skip(max).select('_id').lean();
  if (extra.length) await Model.deleteMany({ _id: { $in: extra.map((e) => e._id) } });
}
