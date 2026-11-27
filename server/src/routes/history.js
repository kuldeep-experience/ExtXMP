import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import Professional from '../models/Professional.js';
import RecentlyViewedProfessional from '../models/RecentlyViewedProfessional.js';
import SearchHistory from '../models/SearchHistory.js';
import RecentComparison from '../models/RecentComparison.js';
import { ApiError } from '../middleware/error.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { ACTIVE, PUBLIC_PROFESSIONAL_FIELDS, listQuery, searchProfessionals } from '../lib/professionalSearch.js';
import { historyPolicy, purgeForVisitor, settingsOf, trim } from '../lib/history.js';

// Every route is visitor-only and scoped to req.visitor. Records that belong to someone else are reported as 404.
export const recentlyViewedRouter = Router();
export const searchHistoryRouter = Router();
export const comparisonsRouter = Router();
for (const r of [recentlyViewedRouter, searchHistoryRouter, comparisonsRouter]) r.use(requireAuth, requireRole('visitor'));

const oid = z.string().regex(/^[a-f0-9]{24}$/i, 'Invalid id');
const idParam = z.object({ id: oid });
const pageQuery = z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(50).default(20) });
const pagination = (page, limit, total) => ({ page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) });
const notTracked = (res, reason = 'disabled') => res.json({ success: true, tracked: false, reason });
const isDuplicate = (e) => e?.code === 11000;
const asFilter = (visitor) => ({ visitor: visitor._id });

// ============ recently viewed professionals ============
const viewBody = z.strictObject({ professionalId: oid });

recentlyViewedRouter.get('/', async (req, res) => {
  const p = pageQuery.parse(req.query);
  await purgeForVisitor(req.visitor); // retention is enforced whenever history is read
  const [out] = await RecentlyViewedProfessional.aggregate([
    { $match: asFilter(req.visitor) },
    { $lookup: { from: 'professionals', localField: 'professional', foreignField: '_id', as: 'pro' } },
    { $unwind: '$pro' },
    { $match: { 'pro.profileStatus': 'active' } },
    { $facet: {
      items: [{ $sort: { lastViewedAt: -1, _id: -1 } }, { $skip: (p.page - 1) * p.limit }, { $limit: p.limit },
        { $project: { firstViewedAt: 1, lastViewedAt: 1, viewCount: 1, professional: Object.fromEntries(PUBLIC_PROFESSIONAL_FIELDS.split(' ').map((f) => [f, `$pro.${f}`])) } }],
      total: [{ $count: 'n' }],
    } },
  ]);
  res.json({ success: true, data: out.items, pagination: pagination(p.page, p.limit, out.total[0]?.n ?? 0), settings: settingsOf(req.visitor) });
});

recentlyViewedRouter.post('/', async (req, res) => {
  const { professionalId } = viewBody.parse(req.body);
  if (!settingsOf(req.visitor).trackHistory) return notTracked(res);
  if (!(await Professional.exists({ _id: professionalId, ...ACTIVE }))) throw new ApiError(404, 'Professional not found');

  const key = { visitor: req.visitor._id, professional: professionalId };
  for (let attempt = 0; attempt < 2; attempt++) {
    const now = new Date();
    const existing = await RecentlyViewedProfessional.findOne(key);
    if (!existing) {
      try {
        const doc = await RecentlyViewedProfessional.create({ ...key, firstViewedAt: now, lastViewedAt: now, viewCount: 1 });
        await trim(RecentlyViewedProfessional, req.visitor._id, 'lastViewedAt', historyPolicy.maxViewed);
        return res.status(201).json({ success: true, tracked: true, counted: true, data: doc });
      } catch (e) { if (isDuplicate(e)) continue; throw e; } // a simultaneous request created it first: update that one
    }
    // Repeat visits inside the window refresh the timestamp but are not counted as new views.
    const counted = now - existing.lastViewedAt >= historyPolicy.dedupMs;
    const doc = await RecentlyViewedProfessional.findOneAndUpdate({ _id: existing._id }, { $set: { lastViewedAt: now }, ...(counted && { $inc: { viewCount: 1 } }) }, { returnDocument: 'after' });
    return res.json({ success: true, tracked: true, counted, data: doc });
  }
  throw new ApiError(409, 'Could not record the view, please try again');
});

// Must be registered before "/:id"
recentlyViewedRouter.delete('/clear', async (req, res) => {
  const { deletedCount } = await RecentlyViewedProfessional.deleteMany(asFilter(req.visitor));
  res.json({ success: true, deleted: deletedCount });
});
recentlyViewedRouter.delete('/:id', async (req, res) => {
  const { id } = idParam.parse(req.params);
  const { deletedCount } = await RecentlyViewedProfessional.deleteOne({ _id: id, ...asFilter(req.visitor) });
  if (!deletedCount) throw new ApiError(404, 'Record not found');
  res.json({ success: true });
});

// ============ search history ============
// The only keys a stored search may contain: the directory's own search parameters (plus "near", a label for a distance search).
const FILTER_KEYS = ['category', 'location', 'specialization', 'services', 'minRating', 'minExperience', 'verified', 'lat', 'lng', 'maxDistanceKm', 'sort', 'near'];
const searchBody = z.strictObject({
  query: z.string().trim().max(100).optional(),
  filters: z.record(z.string(), z.union([z.string().max(500), z.number(), z.boolean()])).optional(),
});

function normalizeSearch(body) {
  const filters = {};
  for (const [k, v] of Object.entries(body.filters ?? {})) {
    if (!FILTER_KEYS.includes(k)) throw new ApiError(400, 'Invalid search filters', { filters: [`Unknown filter: ${k}`] });
    if (v !== '' && v !== false) filters[k] = String(v);
  }
  const query = body.query ?? '';
  if (!query && !Object.keys(filters).some((k) => !['sort', 'near'].includes(k))) throw new ApiError(400, 'Nothing to record: add a search term or a filter');
  const { near, ...params } = filters;
  const parsed = listQuery.safeParse({ ...params, ...(query && { q: query }), page: 1, limit: 1 }); // the same validation the directory applies
  if (!parsed.success) throw new ApiError(400, 'Invalid search filters', parsed.error.flatten().fieldErrors);
  if (near && near.length > 100) throw new ApiError(400, 'Invalid search filters');
  const queryKey = JSON.stringify([query.toLowerCase(), Object.entries(filters).sort(([a], [b]) => a.localeCompare(b))]);
  return { query, filters, queryKey, parsed: parsed.data };
}

searchHistoryRouter.get('/', async (req, res) => {
  const p = pageQuery.parse(req.query);
  await purgeForVisitor(req.visitor);
  const [data, total] = await Promise.all([
    SearchHistory.find(asFilter(req.visitor)).sort({ searchedAt: -1, _id: -1 }).skip((p.page - 1) * p.limit).limit(p.limit).select('-__v -queryKey -visitor').lean(),
    SearchHistory.countDocuments(asFilter(req.visitor)),
  ]);
  res.json({ success: true, data, pagination: pagination(p.page, p.limit, total), settings: settingsOf(req.visitor) });
});

searchHistoryRouter.post('/', async (req, res) => {
  const body = searchBody.parse(req.body);
  if (!settingsOf(req.visitor).trackHistory) return notTracked(res);
  const { query, filters, queryKey, parsed } = normalizeSearch(body);
  // The result count is computed here with the directory search, never taken from the client.
  const resultsCount = (await searchProfessionals(parsed)).pagination.total;
  const now = new Date();
  const existing = await SearchHistory.findOneAndUpdate({ ...asFilter(req.visitor), queryKey }, { $set: { searchedAt: now, resultsCount } }, { returnDocument: 'after' });
  if (existing) return res.json({ success: true, tracked: true, data: existing });
  try {
    const doc = await SearchHistory.create({ ...asFilter(req.visitor), query, filters, queryKey, resultsCount, searchedAt: now });
    await trim(SearchHistory, req.visitor._id, 'searchedAt', historyPolicy.maxSearches);
    res.status(201).json({ success: true, tracked: true, data: doc });
  } catch (e) {
    if (!isDuplicate(e)) throw e;
    res.json({ success: true, tracked: true, data: await SearchHistory.findOneAndUpdate({ ...asFilter(req.visitor), queryKey }, { $set: { searchedAt: now, resultsCount } }, { returnDocument: 'after' }) });
  }
});

searchHistoryRouter.delete('/clear', async (req, res) => {
  const { deletedCount } = await SearchHistory.deleteMany(asFilter(req.visitor));
  res.json({ success: true, deleted: deletedCount });
});
searchHistoryRouter.delete('/:id', async (req, res) => {
  const { id } = idParam.parse(req.params);
  const { deletedCount } = await SearchHistory.deleteOne({ _id: id, ...asFilter(req.visitor) });
  if (!deletedCount) throw new ApiError(404, 'Record not found');
  res.json({ success: true });
});

// ============ recent comparisons ============
const compareBody = z.strictObject({ professionalIds: z.array(oid).min(2, 'Compare at least 2 professionals').max(4, 'Compare at most 4 professionals') });

comparisonsRouter.get('/', async (req, res) => {
  const p = pageQuery.parse(req.query);
  await purgeForVisitor(req.visitor);
  const [docs, total] = await Promise.all([
    RecentComparison.find(asFilter(req.visitor)).sort({ comparedAt: -1, _id: -1 }).skip((p.page - 1) * p.limit).limit(p.limit).lean(),
    RecentComparison.countDocuments(asFilter(req.visitor)),
  ]);
  const pros = await Professional.find({ _id: { $in: docs.flatMap((d) => d.professionals) }, ...ACTIVE }).select(PUBLIC_PROFESSIONAL_FIELDS).lean();
  const byId = new Map(pros.map((x) => [String(x._id), x]));
  const data = docs.map((d) => {
    const professionals = d.professionals.map((i) => byId.get(String(i))).filter(Boolean);
    return { _id: d._id, comparedAt: d.comparedAt, professionals, unavailable: d.professionals.length - professionals.length };
  });
  res.json({ success: true, data, pagination: pagination(p.page, p.limit, total), settings: settingsOf(req.visitor) });
});

comparisonsRouter.post('/', async (req, res) => {
  const { professionalIds } = compareBody.parse(req.body);
  if (new Set(professionalIds).size !== professionalIds.length) throw new ApiError(400, 'Each professional can only be compared once');
  if (!settingsOf(req.visitor).trackHistory) return notTracked(res);
  if (await Professional.countDocuments({ _id: { $in: professionalIds }, ...ACTIVE }) !== professionalIds.length) throw new ApiError(404, 'One or more professionals were not found');
  const ids = professionalIds.map((i) => new mongoose.Types.ObjectId(i));
  const setKey = [...professionalIds].sort().join(',');
  const now = new Date();
  const update = { $set: { comparedAt: now, professionals: ids } }; // the same set compared again refreshes the one entry
  let doc = await RecentComparison.findOneAndUpdate({ ...asFilter(req.visitor), setKey }, update, { returnDocument: 'after' });
  let created = false;
  if (!doc) {
    try { doc = await RecentComparison.create({ ...asFilter(req.visitor), professionals: ids, setKey, comparedAt: now }); created = true; await trim(RecentComparison, req.visitor._id, 'comparedAt', historyPolicy.maxComparisons); }
    catch (e) { if (!isDuplicate(e)) throw e; doc = await RecentComparison.findOneAndUpdate({ ...asFilter(req.visitor), setKey }, update, { returnDocument: 'after' }); }
  }
  res.status(created ? 201 : 200).json({ success: true, tracked: true, data: doc });
});

comparisonsRouter.delete('/clear', async (req, res) => {
  const { deletedCount } = await RecentComparison.deleteMany(asFilter(req.visitor));
  res.json({ success: true, deleted: deletedCount });
});
comparisonsRouter.delete('/:id', async (req, res) => {
  const { id } = idParam.parse(req.params);
  const { deletedCount } = await RecentComparison.deleteOne({ _id: id, ...asFilter(req.visitor) });
  if (!deletedCount) throw new ApiError(404, 'Record not found');
  res.json({ success: true });
});
