import ExperienceEntry from '../models/ExperienceEntry.js';
import { createRandom } from './random.js';

const SEED = 5151;
let int, pick, shuffle;
const DAY = 86400000;
const notesPool = [
  'Clear explanations and no pressure. Would book again.', 'Helpful, though the paperwork took longer than expected.', 'Great communication throughout the process.',
  'Knowledgeable and patient. Saved us money.', 'Fine overall, but follow-up was slow.', 'Went above and beyond on a tight deadline.',
  'Fair pricing and honest advice.', 'Not the right fit for our situation, but polite and professional.',
];

// Per visitor: 2 experiences with professionals they contacted, plus 4 with other professionals.
export async function seedExperienceHistory({ visitors, professionals, conversations }, now = Date.now()) {
  ({ int, pick, shuffle } = createRandom(SEED)); // restart the sequence so every run produces the same data
  await ExperienceEntry.deleteMany({});
  const active = professionals.filter((p) => p.profileStatus === 'active');
  const entries = [];
  for (const v of visitors) {
    const mine = conversations.filter((c) => String(c.visitor) === String(v._id));
    const used = new Set(mine.map((c) => String(c.professional)));
    const notes = shuffle(notesPool);
    mine.slice(0, 2).forEach((c, i) => {
      entries.push({ visitor: v._id, professional: c.professional, serviceUsed: c.subject, experienceDate: new Date(now - int(1, 25) * DAY), rating: int(3, 5), wouldRecommend: ['yes', 'yes', 'unsure'][int(0, 2)], notes: notes[i] });
    });
    pick(active.filter((p) => !used.has(String(p._id))), 4).forEach((pro, k) => {
      entries.push({ visitor: v._id, professional: pro._id, serviceUsed: pick(pro.services, 1)[0], experienceDate: new Date(now - int(30, 600) * DAY), rating: [3, 4, 5, null][int(0, 3)], wouldRecommend: ['yes', 'no', 'unsure'][int(0, 2)], notes: notes[2 + k] });
    });
  }
  return ExperienceEntry.insertMany(entries);
}
