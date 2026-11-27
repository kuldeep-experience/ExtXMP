import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import Professional from '../models/Professional.js';
import Review, { PUBLIC_REVIEW } from '../models/Review.js';
import { ApiError } from '../middleware/error.js';
import { ACTIVE, directoryLocations, listQuery, pagination, searchProfessionals } from '../lib/professionalSearch.js';

const router = Router();
const blankToUndefined = (v) => (v === '' ? undefined : v);
const opt = (schema) => z.preprocess(blankToUndefined, schema.optional());
const page = z.coerce.number().int().min(1).default(1);

const reviewsQuery = z.object({
  sort: z.preprocess(blankToUndefined, z.enum(['recent', 'highest', 'lowest']).default('recent')),
  rating: opt(z.coerce.number().int().min(1).max(5)),
  page,
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

const REVIEW_SORTS = {
  recent: { reviewDate: -1, _id: 1 },
  highest: { rating: -1, reviewDate: -1, _id: 1 },
  lowest: { rating: 1, reviewDate: -1, _id: 1 },
};

router.get('/', async (req, res) => {
  const result = await searchProfessionals(listQuery.parse(req.query));
  res.json({ success: true, ...result });
});

// Must be registered before "/:id"
router.get('/categories', async (_req, res) => {
  const rows = await Professional.aggregate([
    { $match: ACTIVE },
    { $unwind: '$specializations' },
    { $group: { _id: { slug: '$categorySlug', name: '$category' }, specs: { $addToSet: '$specializations' }, ids: { $addToSet: '$_id' } } },
    { $project: { _id: 0, slug: '$_id.slug', name: '$_id.name', count: { $size: '$ids' }, specializations: '$specs' } },
    { $sort: { name: 1 } },
  ]);
  const svc = await Professional.aggregate([
    { $match: ACTIVE }, { $unwind: '$services' }, { $group: { _id: '$categorySlug', services: { $addToSet: '$services' } } },
  ]);
  const bySlug = new Map(svc.map((x) => [x._id, x.services.sort()]));
  rows.forEach((r) => { r.specializations.sort(); r.services = bySlug.get(r.slug) ?? []; });
  res.json({ success: true, data: rows });
});

// Cities in the directory with coordinates, used by the distance filter in the UI.
router.get('/locations', async (_req, res) => {
  const rows = await directoryLocations();
  res.json({ success: true, data: rows });
});

async function findActive(id) {
  if (!mongoose.isValidObjectId(id)) throw new ApiError(400, 'Invalid professional id');
  const pro = await Professional.findOne({ _id: id, ...ACTIVE }).select('-__v').lean();
  if (!pro) throw new ApiError(404, 'Professional not found');
  return pro;
}

// Side-by-side data for 2-4 professionals, in the requested order. Must be registered before "/:id".
router.get('/compare', async (req, res) => {
  const { ids } = z.object({ ids: z.string().max(200) }).parse(req.query);
  const list = [...new Set(ids.split(',').map((s) => s.trim()).filter(Boolean))];
  if (list.length < 2 || list.length > 4 || list.some((i) => !mongoose.isValidObjectId(i))) throw new ApiError(400, 'Choose between 2 and 4 professionals to compare');
  const found = await Professional.find({ _id: { $in: list }, ...ACTIVE }).select('-__v').lean();
  const byId = new Map(found.map((p) => [String(p._id), p]));
  const data = list.map((i) => byId.get(i)).filter(Boolean);
  if (data.length < 2) throw new ApiError(404, 'These professionals are not available to compare');
  res.json({ success: true, data, unavailable: list.length - data.length });
});

router.get('/:id', async (req, res) => {
  res.json({ success: true, data: await findActive(req.params.id) });
});

router.get('/:id/reviews', async (req, res) => {
  const pro = await findActive(req.params.id);
  const p = reviewsQuery.parse(req.query);
  const base = { professional: pro._id, ...PUBLIC_REVIEW };
  const filter = p.rating ? { ...base, rating: p.rating } : base;

  const [data, total, dist] = await Promise.all([
    Review.find(filter).sort(REVIEW_SORTS[p.sort]).skip((p.page - 1) * p.limit).limit(p.limit).select('-__v -moderationStatus -visibility').lean(),
    Review.countDocuments(filter),
    Review.aggregate([{ $match: base }, { $group: { _id: '$rating', n: { $sum: 1 } } }]),
  ]);
  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let count = 0, sum = 0;
  dist.forEach(({ _id, n }) => { distribution[_id] = n; count += n; sum += _id * n; });
  const summary = { average: count ? Math.round((sum / count) * 10) / 10 : 0, count, distribution };

  res.json({ success: true, data, pagination: pagination(p.page, p.limit, total), summary });
});

export default router;
