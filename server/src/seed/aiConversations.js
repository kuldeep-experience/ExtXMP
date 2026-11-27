import AIConversation from '../models/AIConversation.js';
import AIMessage from '../models/AIMessage.js';
import RecommendationSearch from '../models/RecommendationSearch.js';
import { demoProvider } from '../lib/ai/provider.js';
import { runRecommendation } from '../lib/ai/recommend.js';

const DAY = 86400000;

// Each script is one conversation: an opening request and optional refinements.
const scripts = [
  ['I need a real estate agent experienced in helping first-time home buyers.', 'Only show professionals with at least 10 years of experience.'],
  ['Find a financial advisor in Indore.', 'What about a financial advisor in Charlotte?'],
  ['I need a mortgage professional with at least 5 years of experience.', 'Rated 4.5 or higher please.'],
  ['Find highly rated insurance professionals in Ohio.'],
  ['I need someone specializing in commercial property.'],
  ['I need a lawyer for estate planning in New York.', 'Verified only.'],
  ['Looking for a plumber or electrician in Texas.'],
  ['Who can help me plan for retirement? I want at least 15 years of experience.'],
];

// 3 conversations per demo visitor. They are produced by the real recommendation pipeline in demo mode,
// so every professional id, score and explanation comes from the seeded directory.
export async function seedAIConversations({ visitors }, now = Date.now()) {
  await Promise.all([AIConversation.deleteMany({}), AIMessage.deleteMany({}), RecommendationSearch.deleteMany({})]);
  let conversations = 0;
  for (const [i, visitor] of visitors.entries()) {
    for (let k = 0; k < 3; k++) {
      const script = scripts[(i * 3 + k) % scripts.length];
      const started = now - (2 + i * 4 + k * 9) * DAY;
      const conversation = await AIConversation.create({ visitor: visitor._id, createdAt: new Date(started), lastMessageAt: new Date(started) });
      for (const [turn, message] of script.entries()) {
        await runRecommendation({ visitor, conversation, message, provider: demoProvider, at: new Date(started + turn * 4 * 60000) });
        await conversation.constructor.findById(conversation._id).then((c) => { conversation.messageCount = c.messageCount; });
      }
      conversations++;
    }
  }
  return { conversations };
}
