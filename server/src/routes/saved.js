import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import Professional from '../models/Professional.js';
import SavedFolder from '../models/SavedFolder.js';
import SavedProfessional from '../models/SavedProfessional.js';
import { ApiError } from '../middleware/error.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

// Every handler scopes its queries by req.visitor._id. Records owned by someone else are reported as 404, never 403,
// so the API does not reveal whether a foreign id exists.
export const savedRouter = Router();
export const foldersRouter = Router();
for (const r of [savedRouter, foldersRouter]) r.use(requireAuth, requireRole('visitor'));

const oid = (v) => new mongoose.Types.ObjectId(v);
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const blank = (v) => (v === '' ? undefined : v);
const opt = (s) => z.preprocess(blank, s.optional());
const objectId = z.string().regex(/^[a-f0-9]{24}$/i, 'Invalid id');
const note = z.string().trim().max(1000, 'Notes can be up to 1000 characters');
const folderName = z.string().trim().min(1, 'Required').max(60);
const folderDesc = z.string().trim().max(200);

const listQuery = z.object({
  q: opt(z.string().trim().max(100)),
  folder: opt(z.union([objectId, z.literal('unfiled')])),
  sort: z.preprocess(blank, z.enum(['recent', 'name', 'rating']).default('recent')),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
const createSaved = z.strictObject({ professionalId: objectId, folderId: objectId.nullable().optional(), note: note.optional() });
const patchSaved = z.strictObject({ folderId: objectId.nullable().optional(), note: note.optional() })
  .refine((b) => b.folderId !== undefined || b.note !== undefined, 'Provide folderId or note');
const createFolder = z.strictObject({ name: folderName, description: folderDesc.optional() });
const patchFolder = z.strictObject({ name: folderName.optional(), description: folderDesc.optional() })
  .refine((b) => b.name !== undefined || b.description !== undefined, 'Provide name or description');

const SORTS = {
  recent: { createdAt: -1, _id: -1 },
  name: { 'pro.fullName': 1, _id: 1 },
  rating: { 'pro.averageRating': -1, 'pro.reviewCount': -1, _id: 1 },
};
const joinActive = [
  { $lookup: { from: 'professionals', localField: 'professional', foreignField: '_id', as: 'pro' } },
  { $unwind: '$pro' },
  { $match: { 'pro.profileStatus': 'active' } },
];
const shape = {
  $project: {
    folder: 1, note: 1, savedAt: '$createdAt', updatedAt: 1,
    professional: {
      _id: '$pro._id', fullName: '$pro.fullName', profileImage: '$pro.profileImage', title: '$pro.title', category: '$pro.category',
      categorySlug: '$pro.categorySlug', specializations: '$pro.specializations', yearsOfExperience: '$pro.yearsOfExperience',
      location: '$pro.location', averageRating: '$pro.averageRating', reviewCount: '$pro.reviewCount', verificationStatus: '$pro.verificationStatus',
    },
  },
};
const pagination = (page, limit, total) => ({ page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) });

const ownedFolder = async (visitorId, id) => {
  if (id && !(await SavedFolder.exists({ _id: id, visitor: visitorId }))) throw new ApiError(404, 'Folder not found');
};
const findOne = async (visitorId, id) => (await SavedProfessional.aggregate([{ $match: { _id: oid(id), visitor: visitorId } }, ...joinActive, shape]))[0];

// ================= saved professionals =================
savedRouter.get('/', async (req, res) => {
  const p = listQuery.parse(req.query);
  const match = { visitor: req.visitor._id };
  if (p.folder === 'unfiled') match.folder = null;
  else if (p.folder) match.folder = oid(p.folder);
  const search = [];
  if (p.q) {
    const rx = new RegExp(escapeRegex(p.q), 'i');
    search.push({ $match: { $or: [{ 'pro.fullName': rx }, { 'pro.title': rx }, { 'pro.category': rx }, { 'pro.specializations': rx }, { note: rx }] } });
  }
  const [out] = await SavedProfessional.aggregate([
    { $match: match }, ...joinActive, ...search,
    { $facet: { items: [{ $sort: SORTS[p.sort] }, { $skip: (p.page - 1) * p.limit }, { $limit: p.limit }, shape], total: [{ $count: 'n' }] } },
  ]);
  const total = out.total[0]?.n ?? 0;
  res.json({ success: true, data: out.items, pagination: pagination(p.page, p.limit, total) });
});

// Map of professionalId -> saved record id, used to show bookmark state on cards.
savedRouter.get('/ids', async (req, res) => {
  const rows = await SavedProfessional.find({ visitor: req.visitor._id }).select('professional').lean();
  res.json({ success: true, data: Object.fromEntries(rows.map((r) => [String(r.professional), String(r._id)])) });
});

savedRouter.post('/', async (req, res) => {
  const b = createSaved.parse(req.body);
  if (!(await Professional.exists({ _id: b.professionalId, profileStatus: 'active' }))) throw new ApiError(404, 'Professional not found');
  await ownedFolder(req.visitor._id, b.folderId);
  let doc;
  try {
    doc = await SavedProfessional.create({ visitor: req.visitor._id, professional: b.professionalId, folder: b.folderId ?? null, note: b.note ?? '' });
  } catch (e) {
    if (e.code === 11000) throw new ApiError(409, 'You have already saved this professional');
    throw e;
  }
  res.status(201).json({ success: true, data: await findOne(req.visitor._id, doc._id) });
});

savedRouter.patch('/:id', async (req, res) => {
  const { id } = z.object({ id: objectId }).parse(req.params);
  const b = patchSaved.parse(req.body);
  if (b.folderId !== undefined) await ownedFolder(req.visitor._id, b.folderId);
  const set = {};
  if (b.folderId !== undefined) set.folder = b.folderId;
  if (b.note !== undefined) set.note = b.note;
  const updated = await SavedProfessional.findOneAndUpdate({ _id: id, visitor: req.visitor._id }, { $set: set }, { returnDocument: 'after' });
  if (!updated) throw new ApiError(404, 'Saved professional not found');
  res.json({ success: true, data: await findOne(req.visitor._id, id) });
});

savedRouter.delete('/:id', async (req, res) => {
  const { id } = z.object({ id: objectId }).parse(req.params);
  const { deletedCount } = await SavedProfessional.deleteOne({ _id: id, visitor: req.visitor._id });
  if (!deletedCount) throw new ApiError(404, 'Saved professional not found');
  res.json({ success: true, message: 'Removed from saved professionals' });
});

// ================= folders =================
const MAX_FOLDERS = 50;
const dupName = (e) => { if (e.code === 11000) throw new ApiError(409, 'You already have a folder with that name', { name: ['Already exists'] }); throw e; };

foldersRouter.get('/', async (req, res) => {
  const [folders, counts] = await Promise.all([
    SavedFolder.find({ visitor: req.visitor._id }).sort({ nameKey: 1 }).select('-__v -nameKey').lean(),
    SavedProfessional.aggregate([{ $match: { visitor: req.visitor._id } }, ...joinActive, { $group: { _id: '$folder', n: { $sum: 1 } } }]),
  ]);
  const byFolder = new Map(counts.map((c) => [String(c._id), c.n]));
  res.json({
    success: true,
    data: folders.map((f) => ({ ...f, count: byFolder.get(String(f._id)) ?? 0 })),
    totals: { all: counts.reduce((s, c) => s + c.n, 0), unfiled: byFolder.get('null') ?? 0 },
  });
});

foldersRouter.post('/', async (req, res) => {
  const b = createFolder.parse(req.body);
  if (await SavedFolder.countDocuments({ visitor: req.visitor._id }) >= MAX_FOLDERS) throw new ApiError(400, `You can create up to ${MAX_FOLDERS} folders`);
  try {
    const f = await SavedFolder.create({ visitor: req.visitor._id, name: b.name, nameKey: b.name.toLowerCase(), description: b.description ?? '' });
    res.status(201).json({ success: true, data: { ...f.toObject({ versionKey: false }), nameKey: undefined, count: 0 } });
  } catch (e) { dupName(e); }
});

foldersRouter.patch('/:id', async (req, res) => {
  const { id } = z.object({ id: objectId }).parse(req.params);
  const b = patchFolder.parse(req.body);
  const set = {};
  if (b.name !== undefined) { set.name = b.name; set.nameKey = b.name.toLowerCase(); }
  if (b.description !== undefined) set.description = b.description;
  try {
    const f = await SavedFolder.findOneAndUpdate({ _id: id, visitor: req.visitor._id }, { $set: set }, { returnDocument: 'after', runValidators: true }).select('-__v -nameKey').lean();
    if (!f) throw new ApiError(404, 'Folder not found');
    res.json({ success: true, data: f });
  } catch (e) { dupName(e); }
});

// Deleting a folder keeps its professionals: they move to "Unfiled".
foldersRouter.delete('/:id', async (req, res) => {
  const { id } = z.object({ id: objectId }).parse(req.params);
  const { deletedCount } = await SavedFolder.deleteOne({ _id: id, visitor: req.visitor._id });
  if (!deletedCount) throw new ApiError(404, 'Folder not found');
  const { modifiedCount } = await SavedProfessional.updateMany({ visitor: req.visitor._id, folder: id }, { $set: { folder: null } });
  res.json({ success: true, message: 'Folder deleted', movedToUnfiled: modifiedCount });
});
