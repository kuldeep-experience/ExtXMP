import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import ExperienceEntry from '../models/ExperienceEntry.js';
import ServiceRecord from '../models/ServiceRecord.js';
import Conversation from '../models/Conversation.js';
import Professional from '../models/Professional.js';
import { ApiError } from '../middleware/error.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { ACTIVE, PUBLIC_PROFESSIONAL_FIELDS } from '../lib/professionalSearch.js';

// Visitor-only private notes about past experiences. Scoped to req.visitor; foreign ids are 404.
const router = Router();
router.use(requireAuth, requireRole('visitor'));

const oid = z.string().regex(/^[a-f0-9]{24}$/i, 'Invalid id');
const idParam = z.object({ id: oid });
const blank = (v) => (v === '' ? undefined : v);
const date = z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'Enter a valid date').transform((s) => new Date(s))
  .refine((d) => d.getTime() <= Date.now() + 86400000, 'The date cannot be in the future'); // a day of slack for time zones
const fields = {
  serviceUsed: z.string().trim().min(1, 'Required').max(100),
  experienceDate: date,
  rating: z.number().int().min(1).max(5).nullable(),
  wouldRecommend: z.enum(['yes', 'no', 'unsure']).nullable(),
  notes: z.string().trim().max(1000),
};
const createBody = z.strictObject({ professionalId: oid, serviceUsed: fields.serviceUsed, experienceDate: fields.experienceDate, rating: fields.rating.optional(), wouldRecommend: fields.wouldRecommend.optional(), notes: fields.notes.optional() });
const patchBody = z.strictObject({ serviceUsed: fields.serviceUsed.optional(), experienceDate: fields.experienceDate.optional(), rating: fields.rating.optional(), wouldRecommend: fields.wouldRecommend.optional(), notes: fields.notes.optional() })
  .refine((b) => Object.keys(b).length > 0, 'Nothing to update');
const listQuery = z.object({
  q: z.preprocess(blank, z.string().trim().max(100).optional()),
  professionalId: z.preprocess(blank, oid.optional()),
  sort: z.preprocess(blank, z.enum(['recent', 'rating']).default('recent')),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const proProjection = Object.fromEntries(PUBLIC_PROFESSIONAL_FIELDS.split(' ').map((f) => [f, `$pro.${f}`]));
const withPro = [
  { $lookup: { from: 'professionals', localField: 'professional', foreignField: '_id', as: 'pro' } },
  { $unwind: '$pro' },
];
const shape = { $project: { serviceUsed: 1, experienceDate: 1, rating: 1, wouldRecommend: 1, notes: 1, createdAt: 1, updatedAt: 1, professional: proProjection } };
const findOne = async (visitorId, id) => (await ExperienceEntry.aggregate([{ $match: { _id: new mongoose.Types.ObjectId(id), visitor: visitorId } }, ...withPro, shape]))[0];

router.get('/', async (req, res) => {
  const p = listQuery.parse(req.query);
  const match = { visitor: req.visitor._id, ...(p.professionalId && { professional: new mongoose.Types.ObjectId(p.professionalId) }) };
  const search = p.q ? [{ $match: { $or: ['serviceUsed', 'notes', 'pro.fullName'].map((f) => ({ [f]: new RegExp(escapeRegex(p.q), 'i') })) } }] : [];
  const sort = p.sort === 'rating' ? { rating: -1, experienceDate: -1, _id: -1 } : { experienceDate: -1, _id: -1 };
  const [out] = await ExperienceEntry.aggregate([
    { $match: match }, ...withPro, ...search,
    { $facet: { items: [{ $sort: sort }, { $skip: (p.page - 1) * p.limit }, { $limit: p.limit }, shape], total: [{ $count: 'n' }] } },
  ]);
  const total = out.total[0]?.n ?? 0;
  res.json({ success: true, data: out.items, pagination: { page: p.page, limit: p.limit, total, totalPages: Math.max(1, Math.ceil(total / p.limit)) } });
});

router.post('/', async (req, res) => {
  const b = createBody.parse(req.body);
  if (!(await Professional.exists({ _id: b.professionalId, ...ACTIVE }))) throw new ApiError(404, 'Professional not found');
  {
    const doc = await ExperienceEntry.create({
      visitor: req.visitor._id, professional: b.professionalId, serviceUsed: b.serviceUsed,
      experienceDate: b.experienceDate, rating: b.rating ?? null, wouldRecommend: b.wouldRecommend ?? null, notes: b.notes ?? '',
    });
    res.status(201).json({ success: true, data: await findOne(req.visitor._id, doc._id) });
  }
});

// ---------- timeline: experiences, service records and contacts in one chronological list ----------
const TYPES = ['experience', 'service', 'conversation'];
const dateStr = z.string().refine((v) => !Number.isNaN(Date.parse(v)), 'Enter a valid date').transform((v) => new Date(v));
const timelineQuery = z.object({
  types: z.preprocess(blank, z.string().max(100).optional()), // comma separated
  professionalId: z.preprocess(blank, oid.optional()),
  q: z.preprocess(blank, z.string().trim().max(100).optional()),
  from: z.preprocess(blank, dateStr.optional()), to: z.preprocess(blank, dateStr.optional()),
  page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(50).default(20),
});
const lookup = [{ $lookup: { from: 'professionals', localField: 'professional', foreignField: '_id', as: 'pro' } }, { $unwind: '$pro' }];
const proOut = Object.fromEntries(PUBLIC_PROFESSIONAL_FIELDS.split(' ').map((f) => [f, `$pro.${f}`]));

router.get('/timeline', async (req, res) => {
  const p = timelineQuery.parse(req.query);
  const wanted = p.types ? p.types.split(',').map((t) => t.trim()) : TYPES;
  if (wanted.some((t) => !TYPES.includes(t))) throw new ApiError(400, 'Invalid types', { types: [`Use any of: ${TYPES.join(', ')}`] });
  const visitor = req.visitor._id;
  const proFilter = p.professionalId ? { professional: new mongoose.Types.ObjectId(p.professionalId) } : {};
  const dateRange = (field) => (p.from || p.to ? { [field]: { ...(p.from && { $gte: p.from }), ...(p.to && { $lte: p.to }) } } : {});
  const rx = p.q ? new RegExp(escapeRegex(p.q), 'i') : null;
  const search = (fields) => (rx ? [{ $match: { $or: [...fields, 'pro.fullName'].map((f) => ({ [f]: rx })) } }] : []);
  const take = p.page * p.limit; // each source returns enough rows to fill the requested page after merging

  const sources = {
    experience: () => ExperienceEntry.aggregate([{ $match: { visitor, ...proFilter, ...dateRange('experienceDate') } }, ...lookup, ...search(['serviceUsed', 'notes']),
      { $facet: { items: [{ $sort: { experienceDate: -1 } }, { $limit: take }, { $project: { type: { $literal: 'experience' }, date: '$experienceDate', title: '$serviceUsed', summary: '$notes', rating: 1, wouldRecommend: 1, professional: proOut } }], total: [{ $count: 'n' }] } }]),
    service: () => ServiceRecord.aggregate([{ $match: { visitor, ...proFilter, ...dateRange('serviceDate') } }, ...lookup, ...search(['serviceName', 'summary']),
      { $facet: { items: [{ $sort: { serviceDate: -1 } }, { $limit: take }, { $project: { type: { $literal: 'service' }, date: '$serviceDate', title: '$serviceName', summary: 1, status: 1, amountCents: 1, currency: 1, professional: proOut } }], total: [{ $count: 'n' }] } }]),
    conversation: () => Conversation.aggregate([{ $match: { visitor, ...proFilter, ...dateRange('createdAt') } }, ...lookup, ...search(['subject', 'lastMessagePreview']),
      { $facet: { items: [{ $sort: { createdAt: -1 } }, { $limit: take }, { $project: { type: { $literal: 'conversation' }, date: '$createdAt', title: { $cond: [{ $gt: [{ $strLenCP: '$subject' }, 0] }, '$subject', 'Conversation'] }, summary: '$lastMessagePreview', messageCount: 1, professional: proOut } }], total: [{ $count: 'n' }] } }]),
  };
  const results = await Promise.all(wanted.map((t) => sources[t]()));
  const merged = results.flatMap(([r]) => r.items).sort((a, b) => b.date - a.date || String(b._id).localeCompare(String(a._id)));
  const total = results.reduce((n, [r]) => n + (r.total[0]?.n ?? 0), 0);
  res.json({ success: true, data: merged.slice((p.page - 1) * p.limit, p.page * p.limit), pagination: { page: p.page, limit: p.limit, total, totalPages: Math.max(1, Math.ceil(total / p.limit)) } });
});

const owned = async (req) => {
  const { id } = idParam.parse(req.params);
  const e = await ExperienceEntry.findOne({ _id: id, visitor: req.visitor._id });
  if (!e) throw new ApiError(404, 'Experience not found');
  return e;
};

router.get('/:id', async (req, res) => {
  const e = await owned(req);
  res.json({ success: true, data: await findOne(req.visitor._id, e._id) });
});

router.patch('/:id', async (req, res) => {
  const b = patchBody.parse(req.body);
  const e = await owned(req);
  e.set(b);
  await e.save();
  res.json({ success: true, data: await findOne(req.visitor._id, e._id) });
});

router.delete('/:id', async (req, res) => {
  const e = await owned(req);
  await e.deleteOne();
  res.json({ success: true });
});

export default router;
