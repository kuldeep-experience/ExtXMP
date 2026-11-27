import RecentlyViewedProfessional from '../models/RecentlyViewedProfessional.js';
import { DAY } from '../lib/history.js';
import { createRandom } from './random.js';

const SEED = 1313;
let int, pick;

// 10-14 recently viewed professionals per visitor, with view counts and dates inside the default 90 day retention.
export async function seedRecentlyViewed({ visitors, professionals }, now = Date.now()) {
  ({ int, pick } = createRandom(SEED)); // restart the sequence so every run produces the same data
  await RecentlyViewedProfessional.deleteMany({});
  const active = professionals.filter((p) => p.profileStatus === 'active');
  const docs = visitors.flatMap((v) => pick(active, int(10, 14)).map((p) => {
    const viewCount = int(1, 6);
    const last = now - int(0, 60) * DAY - int(0, 23) * 3600000;
    return { visitor: v._id, professional: p._id, viewCount, lastViewedAt: new Date(last), firstViewedAt: new Date(viewCount > 1 ? last - int(1, 20) * DAY : last) };
  }));
  return RecentlyViewedProfessional.insertMany(docs);
}
