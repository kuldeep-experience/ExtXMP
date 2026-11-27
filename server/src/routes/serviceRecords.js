import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import ExperienceEntry from '../models/ExperienceEntry.js';
import Professional from '../models/Professional.js';
import ServiceRecord from '../models/ServiceRecord.js';
import { ApiError } from '../middleware/error.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { ACTIVE, PUBLIC_PROFESSIONAL_FIELDS } from '../lib/professionalSearch.js';

// The visitor's own records of services professionals performed for them. Scoped to req.visitor; foreign ids are 404.
const router = Router();
router.use(requireAuth, requireRole('visitor'));

const oid = z.string().regex(/^[a-f0-9]{24}$/i, 'Invalid id');
const idParam = z.object({ id: oid });
const blank = (v) => (v === '' ? undefined : v);
const dateStr = z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'Enter a valid date').transform((s) => new Date(s));
const status = z.enum(['planned', 'in_progress', 'completed']);
const money = z.number().int().min(0).max(100_000_000_00).nullable(); // cents
const fields = { serviceName: z.string().trim().min(1, 'Required').max(100), serviceDate: dateStr, status, amountCents: money, summary: z.string().trim().max(1000) };
const createBody = z.strictObject({
  professionalId: oid, experienceId: oid.nullable().optional(),
  serviceName: fields.serviceName, serviceDate: fields.serviceDate, status: fields.status.optional(), amountCents: fields.amountCents.optional(), summary: fields.summary.optional(),
});
const patchBody = z.strictObject({ serviceName: fields.serviceName.optional(), serviceDate: fields.serviceDate.optional(), status: fields.status.optional(), amountCents: fields.amountCents.optional(), summary: fields.summary.optional() })
  .refine((b) => Object.keys(b).length > 0, 'Nothing to update');
const listQuery = z.object({
  q: z.preprocess(blank, z.string().trim().max(100).optional()),
  professionalId: z.preprocess(blank, oid.optional()),
  status: z.preprocess(blank, status.optional()),
  from: z.preprocess(blank, dateStr.optional()), to: z.preprocess(blank, dateStr.optional()),
  sort: z.preprocess(blank, z.enum(['recent', 'amount']).default('recent')),
  page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(50).default(10),
});
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const proProjection = Object.fromEntries(PUBLIC_PROFESSIONAL_FIELDS.split(' ').map((f) => [f, `$pro.${f}`]));
const withPro = [{ $lookup: { from: 'professionals', localField: 'professional', foreignField: '_id', as: 'pro' } }, { $unwind: '$pro' }];
const shape = { $project: { serviceName: 1, serviceDate: 1, status: 1, amountCents: 1, currency: 1, summary: 1, experience: 1, createdAt: 1, updatedAt: 1, professional: proProjection } };
const findView = async (visitorId, id) => (await ServiceRecord.aggregate([{ $match: { _id: new mongoose.Types.ObjectId(id), visitor: visitorId } }, ...withPro, shape]))[0];

router.get('/', async (req, res) => {
  const p = listQuery.parse(req.query);
  const match = { visitor: req.visitor._id, ...(p.professionalId && { professional: new mongoose.Types.ObjectId(p.professionalId) }), ...(p.status && { status: p.status }) };
  if (p.from || p.to) match.serviceDate = { ...(p.from && { $gte: p.from }), ...(p.to && { $lte: p.to }) };
  const search = p.q ? [{ $match: { $or: ['serviceName', 'summary', 'pro.fullName'].map((f) => ({ [f]: new RegExp(escapeRegex(p.q), 'i') })) } }] : [];
  const sort = p.sort === 'amount' ? { amountCents: -1, serviceDate: -1, _id: -1 } : { serviceDate: -1, _id: -1 };
  const [out] = await ServiceRecord.aggregate([
    { $match: match }, ...withPro, ...search,
    { $facet: { items: [{ $sort: sort }, { $skip: (p.page - 1) * p.limit }, { $limit: p.limit }, shape], total: [{ $count: 'n' }], spent: [{ $group: { _id: null, cents: { $sum: { $ifNull: ['$amountCents', 0] } } } }] } },
  ]);
  const total = out.total[0]?.n ?? 0;
  res.json({ success: true, data: out.items, totalSpentCents: out.spent[0]?.cents ?? 0, pagination: { page: p.page, limit: p.limit, total, totalPages: Math.max(1, Math.ceil(total / p.limit)) } });
});

router.post('/', async (req, res) => {
  const b = createBody.parse(req.body);
  if (!(await Professional.exists({ _id: b.professionalId, ...ACTIVE }))) throw new ApiError(404, 'Professional not found');
  if (b.experienceId) {
    const e = await ExperienceEntry.findOne({ _id: b.experienceId, visitor: req.visitor._id });
    if (!e) throw new ApiError(404, 'Experience not found');
    if (String(e.professional) !== b.professionalId) throw new ApiError(400, 'That experience was with a different professional');
  }
  const doc = await ServiceRecord.create({
    visitor: req.visitor._id, professional: b.professionalId, experience: b.experienceId ?? null,
    serviceName: b.serviceName, serviceDate: b.serviceDate, status: b.status ?? 'completed', amountCents: b.amountCents ?? null, summary: b.summary ?? '',
  });
  res.status(201).json({ success: true, data: await findView(req.visitor._id, doc._id) });
});

const owned = async (req) => {
  const { id } = idParam.parse(req.params);
  const r = await ServiceRecord.findOne({ _id: id, visitor: req.visitor._id });
  if (!r) throw new ApiError(404, 'Service record not found');
  return r;
};
router.get('/:id', async (req, res) => { const r = await owned(req); res.json({ success: true, data: await findView(req.visitor._id, r._id) }); });
router.patch('/:id', async (req, res) => {
  const b = patchBody.parse(req.body);
  const r = await owned(req);
  r.set(b);
  await r.save();
  res.json({ success: true, data: await findView(req.visitor._id, r._id) });
});
router.delete('/:id', async (req, res) => { const r = await owned(req); await r.deleteOne(); res.json({ success: true }); });

export default router;
