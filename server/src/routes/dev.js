import { Router } from 'express';
import DevEmail from '../models/DevEmail.js';
import { z } from 'zod';
import Conversation from '../models/Conversation.js';
import Message from '../models/Message.js';
import Visitor from '../models/Visitor.js';
import Professional from '../models/Professional.js';
import { ApiError } from '../middleware/error.js';
import { sendMail } from '../lib/mailer.js';

// DEVELOPMENT ONLY. Mounted only when EMAIL_MODE=dev (never in production) and only answers loopback clients.
const router = Router();
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

router.use((req, _res, next) => (LOOPBACK.has(req.ip) ? next() : next(new ApiError(403, 'Development mailbox is local only'))));

router.get('/emails', async (req, res) => {
  const to = String(req.query.to || '').trim().toLowerCase();
  if (!to) throw new ApiError(400, 'Query parameter "to" is required');
  const data = await DevEmail.find({ to }).sort({ createdAt: -1 }).limit(20).select('-__v').lean();
  res.json({ success: true, devOnly: true, data });
});

// Stands in for the professional's own inbox, which this POC does not have: adds a professional reply to a contact thread,
// marks it unread and "emails" the visitor (dev mailbox). Clearly a simulation: never used by the visitor app itself.
const replyBody = z.strictObject({ conversationId: z.string().regex(/^[a-f0-9]{24}$/i), body: z.string().trim().min(1).max(2000) });
router.post('/simulate-reply', async (req, res) => {
  const b = replyBody.parse(req.body);
  const c = await Conversation.findById(b.conversationId);
  if (!c) throw new ApiError(404, 'Conversation not found');
  const [visitor, pro] = await Promise.all([Visitor.findById(c.visitor).select('email firstName').lean(), Professional.findById(c.professional).select('fullName').lean()]);
  const m = await Message.create({ conversation: c._id, visitor: c.visitor, professional: c.professional, senderType: 'professional', body: b.body });
  c.messageCount += 1; c.unreadCount += 1; c.lastMessageAt = m.createdAt; c.lastMessagePreview = b.body.slice(0, 120);
  await c.save();
  await sendMail({ to: visitor.email, subject: `${pro.fullName} replied to your message on Experience.com`, text: `${pro.fullName} wrote:\n\n${b.body}\n\nOpen My Contacts to continue the conversation.`, link: '' });
  res.status(201).json({ success: true, devOnly: true, data: m });
});

export default router;
