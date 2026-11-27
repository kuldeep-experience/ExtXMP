import Conversation from '../models/Conversation.js';
import Message from '../models/Message.js';
import { createRandom } from './random.js';

const SEED = 5154;
let int;
const HOUR = 3600000;
const prep = {
  'real-estate-agents': 'your target budget and a rough list of must-haves',
  'financial-advisors': 'your latest account statements and your main goals',
  'mortgage-professionals': 'recent pay stubs and permission to check your credit',
  'insurance-professionals': 'your current policy declarations page',
  'legal-professionals': 'any contracts or correspondence related to the matter',
  'home-service-professionals': 'a few photos of the work area',
};

// Sample dialogue between a visitor and the professional of the thread. The professional's lines are fictional demo content:
// the POC has no professional inbox, so real replies cannot be produced (a dev-only endpoint can simulate one).
const script = (service, slug) => [
  ['visitor', `Hi! I'd like some help with ${service}. What should I prepare before we meet?`],
  ['professional', `Thanks for reaching out. For ${service}, please bring ${prep[slug]}. We can start with a short call to confirm what you need.`],
  ['visitor', 'That works for me. Is there anything that usually takes longer than people expect?'],
  ['professional', 'Gathering documents is the slowest part, so send what you have ahead of time and we will fill in the rest together.'],
  ['visitor', 'Great, thank you. I will send them over this week.'],
  ['professional', 'Perfect. I will confirm the next steps by message.'],
];

// 4-6 messages per thread, oldest first, all in the past. The last message from the professional is left unread in some threads.
export async function seedMessages({ conversations, professionals }, now = Date.now()) {
  ({ int } = createRandom(SEED)); // restart the sequence so every run produces the same data
  const slugOf = new Map(professionals.map((p) => [String(p._id), p.categorySlug]));
  const messages = [];
  const updates = [];
  conversations.forEach((c, i) => {
    const lines = script(c.subject || 'my project', slugOf.get(String(c.professional))).slice(0, int(4, 6));
    let at = +c.createdAt;
    const made = lines.map(([who, body]) => {
      at = Math.min(at + int(1, 20) * HOUR, now - 5 * 60000);
      return { conversation: c._id, visitor: c.visitor, professional: c.professional, senderType: who, body, createdAt: new Date(at), updatedAt: new Date(at), readAt: null };
    });
    const unreadLast = i % 2 === 0 && made.at(-1).senderType === 'professional';
    made.forEach((m, j) => { if (m.senderType === 'professional' && !(unreadLast && j === made.length - 1)) m.readAt = new Date(+m.createdAt + HOUR); });
    messages.push(...made);
    updates.push({ updateOne: { filter: { _id: c._id }, update: { $set: { messageCount: made.length, unreadCount: unreadLast ? 1 : 0, lastMessageAt: made.at(-1).createdAt, lastMessagePreview: made.at(-1).body.slice(0, 120) } } } });
  });
  await Message.insertMany(messages);
  await Conversation.bulkWrite(updates);
  return messages;
}
