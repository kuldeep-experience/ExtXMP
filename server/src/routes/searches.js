import { Router } from 'express';
import { z } from 'zod';
import SavedSearch from '../models/SavedSearch.js';
import { ApiError } from '../middleware/error.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { directoryOptions, listQuery, searchProfessionals } from '../lib/professionalSearch.js';
import { effectiveDistanceKm, toDirectoryQuery } from '../lib/savedSearchQuery.js';

// Visitor-only. Every query is scoped to req.visitor; foreign ids are reported as 404.
const router = Router();
router.use(requireAuth, requireRole('visitor'));

const MAX_SEARCHES = 50;
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const blank = (v) => (v === '' ? undefined : v);
const opt = (s) => z.preprocess(blank, s.optional());
const id = z.object({ id: z.string().regex(/^[a-f0-9]{24}$/i, 'Invalid id') });
const text = (max) => z.string().trim().max(max);
const list = z.array(z.string().trim().min(1).max(60)).max(10);
const num = (min, max) => z.number().min(min).max(max).nullable();

const fields = {
  name: text(80).min(1, 'Give the search a name'),
  category: z.string().trim().max(100).nullable(),
  location: text(100),
  latitude: num(-90, 90),
  longitude: num(-180, 180),
  radiusKm: num(1, 500),
  maxDistanceKm: num(1, 500),
  minRating: num(0, 5),
  specializations: list,
  serviceRequirements: list,
  additionalFilters: z.strictObject({
    keyword: text(100).optional(),
    minExperience: z.number().int().min(0).max(80).nullable().optional(),
    verifiedOnly: z.boolean().optional(),
    sort: z.enum(['rating', 'reviews', 'experience', 'name']).optional(),
  }),
};
const createBody = z.strictObject({ ...fields, ...Object.fromEntries(Object.entries(fields).filter(([k]) => k !== 'name').map(([k, v]) => [k, v.optional()])) });
const patchBody = z.strictObject(Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, v.optional()])));

const listQ = z.object({
  q: opt(text(100)),
  sort: z.preprocess(blank, z.enum(['used', 'created']).default('used')),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(12),
});
const runQ = z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(50).default(12) });

const invalid = (details) => new ApiError(400, 'Invalid search criteria', details);

// A search may only use values the directory actually has, and must contain at least one criterion.
async function validateCriteria(s) {
  const opts = await directoryOptions();
  const bad = {};
  if (s.category && !opts.categories.has(s.category)) bad.category = ['Unknown category'];
  const unknownSpec = (s.specializations || []).filter((x) => !opts.specializations.has(x));
  if (unknownSpec.length) bad.specializations = [`Unknown: ${unknownSpec.join(', ')}`];
  const unknownSvc = (s.serviceRequirements || []).filter((x) => !opts.services.has(x));
  if (unknownSvc.length) bad.serviceRequirements = [`Unknown: ${unknownSvc.join(', ')}`];
  const hasLat = typeof s.latitude === 'number', hasLng = typeof s.longitude === 'number';
  if (hasLat !== hasLng) bad.latitude = ['Latitude and longitude must be set together'];
  if (effectiveDistanceKm(s) != null && !(hasLat && hasLng)) bad.maxDistanceKm = ['A distance needs a location with coordinates'];
  if (Object.keys(bad).length) throw invalid(bad);
  const q = toDirectoryQuery(s);
  if (!Object.keys(q).filter((k) => k !== 'sort').length) throw invalid({ _form: ['Add at least one search criterion'] });
}

const view = (doc, categories) => {
  const o = typeof doc.toObject === 'function' ? doc.toObject({ versionKey: false }) : doc;
  delete o.nameKey;
  return { ...o, categoryName: o.category ? categories.get(o.category) ?? null : null, query: toDirectoryQuery(o) };
};
const owned = async (req) => {
  const { id: _id } = id.parse(req.params);
  const doc = await SavedSearch.findOne({ _id, visitor: req.visitor._id });
  if (!doc) throw new ApiError(404, 'Saved search not found');
  return doc;
};
const duplicate = (e) => { if (e.code === 11000) throw new ApiError(409, 'You already have a saved search with that name', { name: ['Already exists'] }); throw e; };

router.get('/', async (req, res) => {
  const p = listQ.parse(req.query);
  const { categories } = await directoryOptions();
  const filter = { visitor: req.visitor._id };
  if (p.q) {
    const rx = new RegExp(escapeRegex(p.q), 'i');
    const slugs = [...categories].filter(([slug, name]) => rx.test(name) || rx.test(slug)).map(([slug]) => slug);
    filter.$or = [{ name: rx }, { location: rx }, { specializations: rx }, { serviceRequirements: rx }, { 'additionalFilters.keyword': rx }, { category: { $in: slugs } }];
  }
  const sort = p.sort === 'created' ? { createdAt: -1, _id: -1 } : { lastUsedAt: -1, createdAt: -1, _id: -1 }; // never-used searches last
  const [docs, total] = await Promise.all([
    SavedSearch.find(filter).sort(sort).skip((p.page - 1) * p.limit).limit(p.limit),
    SavedSearch.countDocuments(filter),
  ]);
  res.json({
    success: true,
    data: docs.map((d) => view(d, categories)),
    pagination: { page: p.page, limit: p.limit, total, totalPages: Math.max(1, Math.ceil(total / p.limit)) },
  });
});

router.post('/', async (req, res) => {
  const b = createBody.parse(req.body);
  if (await SavedSearch.countDocuments({ visitor: req.visitor._id }) >= MAX_SEARCHES) throw new ApiError(400, `You can save up to ${MAX_SEARCHES} searches`);
  await validateCriteria(b);
  try {
    const doc = await SavedSearch.create({ ...b, visitor: req.visitor._id, nameKey: b.name.toLowerCase() });
    res.status(201).json({ success: true, data: view(doc, (await directoryOptions()).categories) });
  } catch (e) { duplicate(e); }
});

router.get('/:id', async (req, res) => {
  res.json({ success: true, data: view(await owned(req), (await directoryOptions()).categories) });
});

router.patch('/:id', async (req, res) => {
  const b = patchBody.parse(req.body);
  if (!Object.keys(b).length) throw new ApiError(400, 'Nothing to update');
  const doc = await owned(req);
  const { additionalFilters, ...rest } = b;
  doc.set(rest);
  if (rest.name) doc.nameKey = rest.name.toLowerCase();
  if (additionalFilters) doc.set('additionalFilters', { ...doc.additionalFilters.toObject(), ...additionalFilters });
  await validateCriteria(doc.toObject()); // validate the merged result, not just the patch
  try {
    await doc.save();
    res.json({ success: true, data: view(doc, (await directoryOptions()).categories) });
  } catch (e) { duplicate(e); }
});

router.delete('/:id', async (req, res) => {
  const doc = await owned(req);
  await doc.deleteOne();
  res.json({ success: true, message: 'Saved search deleted' });
});

// Runs the saved search through the directory search, records the last-used date and returns the restored filters.
router.post('/:id/run', async (req, res) => {
  const { page, limit } = runQ.parse(req.query);
  const doc = await owned(req);
  const query = toDirectoryQuery(doc);
  const results = await searchProfessionals(listQuery.parse({ ...query, page, limit }));
  doc.lastUsedAt = new Date();
  await doc.save();
  res.json({ success: true, data: view(doc, (await directoryOptions()).categories), query, results });
});

export default router;
