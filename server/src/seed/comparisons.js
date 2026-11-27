import RecentComparison from '../models/RecentComparison.js';
import { DAY } from '../lib/history.js';
import { createRandom } from './random.js';

const SEED = 1315;
let int, pick, shuffle;

// 3-4 comparisons of 2-4 professionals from one category, per visitor.
export async function seedComparisons({ visitors, professionals }, now = Date.now()) {
  ({ int, pick, shuffle } = createRandom(SEED)); // restart the sequence so every run produces the same data
  await RecentComparison.deleteMany({});
  const byCategory = new Map();
  professionals.filter((p) => p.profileStatus === 'active').forEach((p) => (byCategory.get(p.categorySlug) ?? byCategory.set(p.categorySlug, []).get(p.categorySlug)).push(p));
  const docs = [];
  for (const v of visitors) {
    const sets = new Set();
    for (const slug of shuffle([...byCategory.keys()]).slice(0, int(3, 4))) {
      const group = pick(byCategory.get(slug), int(2, 4));
      const setKey = group.map((p) => String(p._id)).sort().join(',');
      if (sets.has(setKey)) continue;
      sets.add(setKey);
      docs.push({ visitor: v._id, professionals: group.map((p) => p._id), setKey, comparedAt: new Date(now - int(0, 60) * DAY - int(0, 23) * 3600000) });
    }
  }
  return RecentComparison.insertMany(docs);
}
