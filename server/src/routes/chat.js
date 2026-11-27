import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import Conversation from '../models/Conversation.js';
import Message from '../models/Message.js';
import Professional from '../models/Professional.js';
import { ApiError } from '../middleware/error.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { ACTIVE, PUBLIC_PROFESSIONAL_FIELDS } from '../lib/professionalSearch.js';
import { sendMail } from '../lib/mailer.js';

// Contacts: a visitor contacts a professional and the two can chat. Visitor-only; a thread is visible only to the visitor who owns it.
// On Experience.com the professional gets the message by email and answers from their own inbox, then the visitor is emailed.
// This POC has no professional-side app: the professional is notified through the dev mailbox only, and replies exist only as seeded
// sample data or via the dev-only simulate-reply endpoint.
const router = Router();
router.use(requireAuth, requireRole('visitor'));

const MAX_THREADS = 100;
const MAX_MESSAGES = 500;
const oid = z.string().regex(/^[a-f0-9]{24}$/i, 'Invalid id');
const idParam = z.object({ id: oid });
const body = z.string().trim().min(1, 'Type a message').max(2000, 'Messages can be up to 2000 characters');
const startBody = z.strictObject({ professionalId: oid, message: body, subject: z.string().trim().max(100).optional() });
const sendBody = z.strictObject({ body });
const blank = (v) => (v === '' ? undefined : v);
const listQuery = z.object({ q: z.preprocess(blank, z.string().trim().max(100).optional()), page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(50).default(20) });
const msgQuery = z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(50) });
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const pagination = (page, limit, total) => ({ page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) });

const proProjection = Object.fromEntries(PUBLIC_PROFESSIONAL_FIELDS.split(' ').map((f) => [f, `$pro.${f}`]));
const withPro = [{ $lookup: { from: 'professionals', localField: 'professional', foreignField: '_id', as: 'pro' } }, { $unwind: '$pro' }];
const shape = { $project: { subject: 1, messageCount: 1, unreadCount: 1, lastMessageAt: 1, lastMessagePreview: 1, createdAt: 1, professional: proProjection } };
const findView = async (visitorId, id) => (await Conversation.aggregate([{ $match: { _id: new mongoose.Types.ObjectId(id), visitor: visitorId } }, ...withPro, shape]))[0];
const owned = async (req) => {
  const { id } = idParam.parse(req.params);
  const c = await Conversation.findOne({ _id: id, visitor: req.visitor._id });
  if (!c) throw new ApiError(404, 'Conversation not found');
  return c;
};

async function addVisitorMessage(conversation, visitor, text) {
  const visitorId = visitor._id;
  if (conversation.messageCount >= MAX_MESSAGES) throw new ApiError(400, 'This conversation is full');
  const m = await Message.create({ conversation: conversation._id, visitor: visitorId, professional: conversation.professional, senderType: 'visitor', body: text });
  conversation.messageCount += 1;
  conversation.lastMessageAt = m.createdAt;
  conversation.lastMessagePreview = text.slice(0, 120);
  await conversation.save();
  // Tell the professional by email (dev mailbox in this POC). A mail problem must not lose the message.
  const pro = await Professional.findById(conversation.professional).select('fullName contactEmail').lean();
  if (pro?.contactEmail) {
    await sendMail({ to: pro.contactEmail.toLowerCase(), subject: `New message from ${visitor.firstName} ${visitor.lastName} on Experience.com`, text: `${visitor.firstName} ${visitor.lastName} wrote:\n\n${text}\n\nReply from your Experience.com inbox.`, link: '' })
      .catch((err) => console.warn(`[mail] could not notify professional: ${err.message}`));
  }
  return m;
}

router.get('/', async (req, res) => {
  const p = listQuery.parse(req.query);
  const search = p.q ? [{ $match: { $or: [{ 'pro.fullName': new RegExp(escapeRegex(p.q), 'i') }, { subject: new RegExp(escapeRegex(p.q), 'i') }, { lastMessagePreview: new RegExp(escapeRegex(p.q), 'i') }] } }] : [];
  const [out] = await Conversation.aggregate([
    { $match: { visitor: req.visitor._id } }, ...withPro, ...search,
    { $facet: { items: [{ $sort: { lastMessageAt: -1, _id: -1 } }, { $skip: (p.page - 1) * p.limit }, { $limit: p.limit }, shape], total: [{ $count: 'n' }] } },
  ]);
  res.json({ success: true, data: out.items, pagination: pagination(p.page, p.limit, out.total[0]?.n ?? 0) });
});

// Total unread messages, for the navigation badge. Must be registered before "/:id".
router.get('/unread-count', async (req, res) => {
  const [row] = await Conversation.aggregate([{ $match: { visitor: req.visitor._id } }, { $group: { _id: null, n: { $sum: '$unreadCount' } } }]);
  res.json({ success: true, count: row?.n ?? 0 });
});

// Start a chat with a professional, or add to the existing one.
router.post('/', async (req, res) => {
  const b = startBody.parse(req.body);
  if (!(await Professional.exists({ _id: b.professionalId, ...ACTIVE }))) throw new ApiError(404, 'Professional not found');
  let conversation = await Conversation.findOne({ visitor: req.visitor._id, professional: b.professionalId });
  let created = false;
  if (!conversation) {
    if (await Conversation.countDocuments({ visitor: req.visitor._id }) >= MAX_THREADS) throw new ApiError(400, `You can contact up to ${MAX_THREADS} professionals`);
    try {
      conversation = await Conversation.create({ visitor: req.visitor._id, professional: b.professionalId, subject: b.subject ?? '' });
      created = true;
    } catch (e) {
      if (e.code !== 11000) throw e;
      conversation = await Conversation.findOne({ visitor: req.visitor._id, professional: b.professionalId }); // created by a simultaneous request
    }
  }
  const message = await addVisitorMessage(conversation, req.visitor, b.message);
  res.status(created ? 201 : 200).json({ success: true, data: await findView(req.visitor._id, conversation._id), message });
});

router.get('/:id', async (req, res) => {
  const c = await owned(req);
  res.json({ success: true, data: await findView(req.visitor._id, c._id) });
});

router.get('/:id/messages', async (req, res) => {
  const p = msgQuery.parse(req.query);
  const c = await owned(req);
  const [data, total] = await Promise.all([
    Message.find({ conversation: c._id }).sort({ createdAt: 1, _id: 1 }).skip((p.page - 1) * p.limit).limit(p.limit).select('senderType body readAt createdAt').lean(),
    Message.countDocuments({ conversation: c._id }),
  ]);
  res.json({ success: true, data, pagination: pagination(p.page, p.limit, total) });
});

router.post('/:id/messages', async (req, res) => {
  const { body: text } = sendBody.parse(req.body);
  const c = await owned(req);
  const m = await addVisitorMessage(c, req.visitor, text);
  res.status(201).json({ success: true, data: { _id: m._id, senderType: 'visitor', body: m.body, readAt: null, createdAt: m.createdAt } });
});

router.post('/:id/read', async (req, res) => {
  const c = await owned(req);
  const { modifiedCount } = await Message.updateMany({ conversation: c._id, senderType: 'professional', readAt: null }, { $set: { readAt: new Date() } });
  c.unreadCount = 0;
  await c.save();
  res.json({ success: true, marked: modifiedCount });
});

router.delete('/:id', async (req, res) => {
  const c = await owned(req);
  await Message.deleteMany({ conversation: c._id });
  await c.deleteOne();
  res.json({ success: true });
});

export default router;
