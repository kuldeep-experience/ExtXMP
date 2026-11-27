import ServiceRecord from '../models/ServiceRecord.js';
import { createRandom } from './random.js';

const SEED = 5152;
let int, pick;
const DAY = 86400000;
const summaries = [
  'Completed the work as quoted and sent a written summary.', 'Initial review done; follow-up scheduled.', 'Documents prepared and filed.', 'Walkthrough finished with a list of recommendations.',
  'Quote accepted; work starts next month.', 'Annual check-up completed with no changes needed.', 'Resolved the issue in one visit.',
];
const cents = () => int(150, 4500) * 100;

// Per visitor: a completed record (with a cost) for each of their first two experiences, plus an in-progress, a planned and two older records.
export async function seedServiceRecords({ visitors, professionals, experiences }, now = Date.now()) {
  ({ int, pick } = createRandom(SEED)); // restart the sequence so every run produces the same data
  await ServiceRecord.deleteMany({});
  const active = professionals.filter((p) => p.profileStatus === 'active');
  const docs = [];
  for (const v of visitors) {
    const mineExp = experiences.filter((e) => String(e.visitor) === String(v._id));
    for (const e of mineExp.slice(0, 2)) {
      docs.push({ visitor: v._id, professional: e.professional, experience: e._id, serviceName: e.serviceUsed, serviceDate: e.experienceDate, status: 'completed', amountCents: cents(), summary: pick(summaries, 1)[0] });
    }
    const others = mineExp.slice(2);
    [['in_progress', -int(1, 20)], ['planned', int(10, 60)], ['completed', -int(60, 300)], ['completed', -int(300, 700)]].forEach(([status, days], i) => {
      const e = others[i];
      const pro = e ? { _id: e.professional, service: e.serviceUsed } : { _id: pick(active, 1)[0]._id, service: 'Consultation' };
      docs.push({ visitor: v._id, professional: pro._id, experience: status === 'completed' && e ? e._id : null, serviceName: pro.service, serviceDate: new Date(now + days * DAY), status, amountCents: status === 'planned' ? null : cents(), summary: pick(summaries, 1)[0] });
    });
  }
  return ServiceRecord.insertMany(docs);
}
