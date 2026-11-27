import SavedProfessional from '../models/SavedProfessional.js';
import { createRandom } from './random.js';

const SEED = 78;
let int, pick, shuffle;
const DAY = 86400000;
const notes = [
  'Recommended by a coworker. Ask about weekend availability.', 'Great reviews on communication. Call before the end of the month.',
  'Specializes in exactly what we need. Compare fees with the other advisor.', 'Free initial consultation, worth booking.',
  'Ask for references from the last two clients.', 'Office is close to home. Bring tax documents to the first meeting.',
  'Slightly lower rating but very experienced, keep as a backup.', 'Check licensing details before signing anything.',
  'Mentioned flexible payment options on the phone.', 'Follow up in spring when we have a clearer budget.',
  'Strong on first-time buyers. Ask about down payment programs.', 'Only call during business hours, no weekends.',
];

// 5-8 saved professionals per visitor, some in folders, some with private notes, with different saved dates.
export async function seedSavedProfessionals({ visitors, professionals, folders }, now = Date.now()) {
  ({ int, pick, shuffle } = createRandom(SEED)); // restart the sequence so every run produces the same data
  await SavedProfessional.deleteMany({});
  const active = professionals.filter((p) => p.profileStatus === 'active');
  const docs = [];
  for (const v of visitors) {
    const mine = folders.filter((f) => String(f.visitor) === String(v._id)); // a visitor can only file into their own folders
    const noteOrder = shuffle(notes);
    pick(active, int(5, 8)).forEach((p, i) => {
      const placed = int(0, mine.length); // index == length means "unfiled"
      docs.push({
        visitor: v._id, professional: p._id, folder: placed < mine.length ? mine[placed]._id : null,
        note: i % 4 === 3 ? '' : noteOrder[i % noteOrder.length], createdAt: new Date(now - int(1, 120) * DAY - int(0, 23) * 3600000),
      });
    });
  }
  return SavedProfessional.insertMany(docs);
}
