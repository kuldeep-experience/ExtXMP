import Conversation from '../models/Conversation.js';
import Message from '../models/Message.js';
import { createRandom } from './random.js';

const SEED = 5153;
let int, pick;
const DAY = 86400000;

// 3 contact threads per visitor: each is a professional the visitor contacted.
// Message counts and previews are filled in by seedMessages().
export async function seedConversations({ visitors, professionals }, now = Date.now()) {
  ({ int, pick } = createRandom(SEED)); // restart the sequence so every run produces the same data
  await Promise.all([Conversation.deleteMany({}), Message.deleteMany({})]);
  const active = professionals.filter((p) => p.profileStatus === 'active');
  const docs = [];
  for (const v of visitors) {
    for (const pro of pick(active, 3)) {
      const created = new Date(now - int(3, 40) * DAY);
      docs.push({ visitor: v._id, professional: pro._id, subject: pick(pro.services, 1)[0], createdAt: created, updatedAt: created, lastMessageAt: created });
    }
  }
  return Conversation.insertMany(docs);
}
