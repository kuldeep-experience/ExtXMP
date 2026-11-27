import SavedFolder from '../models/SavedFolder.js';
import { createRandom } from './random.js';

const SEED = 77;
let int, pick;
const DAY = 86400000;
const folderPool = [
  ['Home Buying', 'Agents and lenders for our first home purchase.'], ['Retirement Planning', 'Advisors to talk to before retiring.'],
  ['To Contact', 'People I plan to reach out to this month.'], ['Shortlist', 'My top choices after comparing reviews.'],
  ['Insurance Review', 'Annual coverage check-ups.'], ['Legal Questions', 'Estate planning and contract help.'],
  ['Home Projects', 'Contractors for repairs and remodeling.'], ['Favorites', ''],
];

// 3-4 folders per visitor.
export async function seedSavedFolders({ visitors }, now = Date.now()) {
  ({ int, pick } = createRandom(SEED)); // restart the sequence so every run produces the same data
  await SavedFolder.deleteMany({});
  return SavedFolder.insertMany(visitors.flatMap((v) => pick(folderPool, int(3, 4)).map(([name, description]) => ({
    visitor: v._id, name, nameKey: name.toLowerCase(), description, createdAt: new Date(now - int(60, 150) * DAY), updatedAt: new Date(now - int(1, 59) * DAY),
  }))));
}
