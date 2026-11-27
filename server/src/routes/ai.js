import { Router } from 'express';
import { z } from 'zod';
import AIConversation from '../models/AIConversation.js';
import AIMessage from '../models/AIMessage.js';
import RecommendationSearch from '../models/RecommendationSearch.js';
import { ApiError } from '../middleware/error.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { aiLimiter } from '../middleware/rateLimit.js';
import { getProvider } from '../lib/ai/provider.js';
import { hydrateSearches, runRecommendation } from '../lib/ai/recommend.js';

// Visitor-only. Conversations belong to the visitor who created them; anyone else gets 404.
const router = Router();
router.use(requireAuth, requireRole('visitor'));

const MAX_MESSAGES = 100;
const oid = z.object({ id: z.string().regex(/^[a-f0-9]{24}$/i, 'Invalid id') });
const providerFor = (req) => req.app.get('aiProvider') ?? getProvider(); // the override exists so tests can plug in a fake model
const modeInfo = (p) => ({ mode: p.isDemo ? 'demo' : 'live', label: p.label, model: p.model ?? null });

const createBody = z.strictObject({ title: z.string().trim().min(1).max(80).optional() });
const askBody = z.strictObject({
  message: z.string().trim().min(1, 'Type a message').max(1000, 'Please keep messages under 1000 characters'),
  conversationId: z.string().regex(/^[a-f0-9]{24}$/i).optional(),
  location: z.strictObject({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }).optional(),
  limit: z.number().int().min(1).max(10).optional(),
});
const listQuery = z.object({ q: z.preprocess((v) => (v === '' ? undefined : v), z.string().trim().max(100).optional()), page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(50).default(20) });
const renameBody = z.strictObject({ title: z.string().trim().min(1).max(80) });
const escapeRegex = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const owned = async (req) => {
  const { id } = oid.parse(req.params);
  const c = await AIConversation.findOne({ _id: id, visitor: req.visitor._id });
  if (!c) throw new ApiError(404, 'Conversation not found');
  return c;
};

async function viewMessages(conversationId, visitorId) {
  const messages = await AIMessage.find({ conversation: conversationId, visitor: visitorId }).sort({ createdAt: 1, _id: 1 }).limit(MAX_MESSAGES + 2).select('-__v').lean();
  const searches = await RecommendationSearch.find({ _id: { $in: messages.map((m) => m.search).filter(Boolean) } });
  const hydrated = await hydrateSearches(searches);
  return messages.map((m) => ({ _id: m._id, role: m.role, content: m.content, createdAt: m.createdAt, ...(m.search && { search: hydrated.get(String(m.search)) }) }));
}

router.get('/status', (req, res) => res.json({ success: true, data: modeInfo(providerFor(req)) }));

router.post('/conversations', async (req, res) => {
  const b = createBody.parse(req.body);
  const c = await AIConversation.create({ visitor: req.visitor._id, ...(b.title && { title: b.title }) });
  res.status(201).json({ success: true, data: c });
});

router.get('/conversations', async (req, res) => {
  const p = listQuery.parse(req.query);
  const filter = { visitor: req.visitor._id, ...(p.q && { title: new RegExp(escapeRegex(p.q), 'i') }) };
  const [data, total] = await Promise.all([
    AIConversation.find(filter).sort({ lastMessageAt: -1, _id: -1 }).skip((p.page - 1) * p.limit).limit(p.limit).select('-__v').lean(),
    AIConversation.countDocuments(filter),
  ]);
  res.json({ success: true, data, pagination: { page: p.page, limit: p.limit, total, totalPages: Math.max(1, Math.ceil(total / p.limit)) } });
});

router.get('/conversations/:id', async (req, res) => {
  const c = await owned(req);
  const last = await RecommendationSearch.findOne({ conversation: c._id }).sort({ createdAt: -1, _id: -1 }).select('criteria mode outcome createdAt').lean();
  res.json({ success: true, data: { ...c.toObject({ versionKey: false }), lastCriteria: last?.criteria ?? null, lastOutcome: last?.outcome ?? null } });
});

router.patch('/conversations/:id', async (req, res) => {
  const { title } = renameBody.parse(req.body);
  const c = await owned(req);
  c.title = title;
  await c.save();
  res.json({ success: true, data: c });
});

// Deleting a conversation also deletes its messages and the recommendation records behind them.
router.delete('/conversations/:id', async (req, res) => {
  const c = await owned(req);
  await Promise.all([AIMessage.deleteMany({ conversation: c._id }), RecommendationSearch.deleteMany({ conversation: c._id })]);
  await c.deleteOne();
  res.json({ success: true });
});

router.get('/conversations/:id/messages', async (req, res) => {
  const c = await owned(req);
  res.json({ success: true, data: await viewMessages(c._id, req.visitor._id) });
});

router.post('/recommendations', aiLimiter, async (req, res) => {
  const b = askBody.parse(req.body);
  let conversation;
  if (b.conversationId) {
    conversation = await AIConversation.findOne({ _id: b.conversationId, visitor: req.visitor._id });
    if (!conversation) throw new ApiError(404, 'Conversation not found');
    if (conversation.messageCount >= MAX_MESSAGES) throw new ApiError(400, 'This conversation is full. Start a new conversation to keep going.');
  } else {
    conversation = await AIConversation.create({ visitor: req.visitor._id });
  }
  const provider = providerFor(req);
  const { userMessage, assistantMessage, search } = await runRecommendation({
    visitor: req.visitor, conversation, message: b.message, coords: b.location ?? null, limit: b.limit ?? 5, provider,
  });
  const hydrated = (await hydrateSearches([search])).get(String(search._id));
  const fresh = await AIConversation.findById(conversation._id).select('-__v').lean();
  res.status(201).json({
    success: true,
    data: {
      conversation: fresh, ...modeInfo(provider),
      userMessage: { _id: userMessage._id, role: 'user', content: userMessage.content, createdAt: userMessage.createdAt },
      assistantMessage: { _id: assistantMessage._id, role: 'assistant', content: assistantMessage.content, createdAt: assistantMessage.createdAt, search: hydrated },
    },
  });
});

export default router;
