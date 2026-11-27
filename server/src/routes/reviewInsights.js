import { Router } from 'express';
import { z } from 'zod';
import Professional from '../models/Professional.js';
import ReviewInsight from '../models/ReviewInsight.js';
import Review from '../models/Review.js';
import SavedProfessional from '../models/SavedProfessional.js';
import { ApiError } from '../middleware/error.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { aiLimiter } from '../middleware/rateLimit.js';
import { ACTIVE } from '../lib/professionalSearch.js';
import { getProvider } from '../lib/ai/provider.js';
import { publicReviewFilter } from '../lib/reviews/aggregate.js';
import { freshness, isGenerating, policy, publicView, runGeneration, startBackground } from '../lib/reviews/service.js';

const router = Router();
const providerFor = (req) => req.app.get('aiProvider') ?? getProvider(); // shared with the assistant; tests can plug in a fake model
const idParam = z.object({ professionalId: z.string().regex(/^[a-f0-9]{24}$/i, 'Invalid id') });
const sourcesQuery = z.object({
  ids: z.string().max(1000).optional(), // comma separated review ids
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

const publicIds = async (professionalId) => (await Review.find(publicReviewFilter(professionalId)).select('_id').lean()).map((r) => String(r._id));
const findPro = async (id) => {
  const p = await Professional.findOne({ _id: id, ...ACTIVE }).select('_id').lean();
  if (!p) throw new ApiError(404, 'Professional not found');
  return p;
};
const modeInfo = (p) => ({ mode: p.isDemo ? 'demo' : 'live', label: p.label });
const body = (status, extra = {}) => ({ success: true, status, minReviews: policy.minReviews, ...extra });

// Decides what to return for one professional and starts background work when the cache is missing or out of date.
async function resolve(professionalId, provider) {
  const ids = await publicIds(professionalId);
  if (ids.length < policy.minReviews) return body('insufficient', { data: null, reviewsAvailable: ids.length });

  let doc = await ReviewInsight.findOne({ professional: professionalId });
  const running = isGenerating(professionalId);

  if (!doc || doc.generationStatus !== 'ready') {
    const cooling = doc?.generationStatus === 'failed' && doc.lastAttemptAt && Date.now() - doc.lastAttemptAt.getTime() < policy.cooldownMs;
    if (cooling) return body('failed', { data: null, error: doc.error });
    if (!running) startBackground(professionalId, provider); // first generation runs in the background; the client polls
    return body('generating', { data: null });
  }

  let f = freshness(doc, ids);
  if (f.removedSources > 0) {
    // Insight text came partly from reviews that are no longer public: replace it before showing anything.
    try { doc = await runGeneration(professionalId, provider); } catch { return body('failed', { data: null, error: 'Insights are being updated.' }); }
    f = freshness(doc, ids);
  } else if (f.needsRegeneration && f.canRegenerate && !running) {
    runGeneration(professionalId, provider); // refresh in the background; readers keep seeing the cached version
  }
  return body('ready', { data: publicView(doc, ids), freshness: f, regenerating: isGenerating(professionalId), ...modeInfoFor(doc) });
}
const modeInfoFor = (doc) => ({ aiGenerated: true, mode: doc.mode, label: doc.provider, model: doc.model, note: doc.note });

// ---------- public: insights are shown on public professional pages ----------
router.get('/professional/:professionalId', async (req, res) => {
  const { professionalId } = idParam.parse(req.params);
  await findPro(professionalId);
  res.json(await resolve(professionalId, providerFor(req)));
});

// Original reviews behind the insights. Only reviews that are approved and visible can ever be returned.
router.get('/professional/:professionalId/sources', async (req, res) => {
  const { professionalId } = idParam.parse(req.params);
  const q = sourcesQuery.parse(req.query);
  await findPro(professionalId);
  const filter = publicReviewFilter(professionalId);
  if (q.ids !== undefined) {
    const ids = q.ids.split(',').map((s) => s.trim()).filter(Boolean);
    if (ids.length > 50 || ids.some((i) => !/^[a-f0-9]{24}$/i.test(i))) throw new ApiError(400, 'Invalid review ids');
    filter._id = { $in: ids };
  } else {
    const doc = await ReviewInsight.findOne({ professional: professionalId }).select('sourceReviewIds').lean();
    filter._id = { $in: doc?.sourceReviewIds ?? [] };
  }
  const [data, total] = await Promise.all([
    Review.find(filter).sort({ reviewDate: -1, _id: 1 }).skip((q.page - 1) * q.limit).limit(q.limit).select('_id rating title text serviceCategory reviewDate reviewerName').lean(),
    Review.countDocuments(filter),
  ]);
  res.json({ success: true, data, pagination: { page: q.page, limit: q.limit, total, totalPages: Math.max(1, Math.ceil(total / q.limit)) } });
});

// ---------- visitors ----------
const visitorOnly = [requireAuth, requireRole('visitor')];

// Insights for the professionals the visitor has saved (dashboard).
router.get('/mine', ...visitorOnly, async (req, res) => {
  const provider = providerFor(req);
  const saved = await SavedProfessional.find({ visitor: req.visitor._id }).sort({ createdAt: -1 }).limit(50).select('professional').lean();
  const pros = await Professional.find({ _id: { $in: saved.map((s) => s.professional) }, ...ACTIVE }).select('_id fullName profileImage title category location averageRating reviewCount verificationStatus').lean();
  const order = new Map(saved.map((s, i) => [String(s.professional), i]));
  pros.sort((a, b) => order.get(String(a._id)) - order.get(String(b._id)));

  const reviews = await Review.find({ professional: { $in: pros.map((p) => p._id) }, moderationStatus: 'approved', visibility: 'visible' }).select('_id professional').lean();
  const idsBy = new Map();
  reviews.forEach((r) => { const k = String(r.professional); (idsBy.get(k) ?? idsBy.set(k, []).get(k)).push(String(r._id)); });
  const docs = new Map((await ReviewInsight.find({ professional: { $in: pros.map((p) => p._id) } })).map((d) => [String(d.professional), d]));

  const data = pros.map((p) => {
    const ids = idsBy.get(String(p._id)) ?? [];
    const doc = docs.get(String(p._id));
    if (ids.length < policy.minReviews) return { professional: p, status: 'insufficient', reviewsAvailable: ids.length, insight: null };
    const stale = doc && doc.generationStatus === 'ready' && freshness(doc, ids).removedSources > 0;
    if (!doc || doc.generationStatus !== 'ready' || stale) {
      if (!isGenerating(p._id) && doc?.generationStatus !== 'failed') (stale ? runGeneration(p._id, provider) : startBackground(p._id, provider));
      return { professional: p, status: doc?.generationStatus === 'failed' ? 'failed' : 'generating', insight: null };
    }
    const v = publicView(doc, ids);
    return {
      professional: p, status: 'ready',
      insight: { summaryText: v.summary.text, reviewsAnalyzed: v.reviewsAnalyzed, generatedAt: v.generatedAt, mode: v.mode, label: v.provider,
        topStrengths: v.strengths.slice(0, 3).map((s) => s.label), topConcern: v.concerns.find((c) => c.commonality !== 'isolated')?.label ?? null },
    };
  });
  res.json({ success: true, data });
});

// Regenerate on request, but only when enough new reviews exist (or a source review was removed) and the cooldown has passed.
router.post('/professional/:professionalId/generate', ...visitorOnly, aiLimiter, async (req, res) => {
  const { professionalId } = idParam.parse(req.params);
  await findPro(professionalId);
  const provider = providerFor(req);
  const ids = await publicIds(professionalId);
  if (ids.length < policy.minReviews) throw new ApiError(400, `At least ${policy.minReviews} reviews are needed to generate insights (this professional has ${ids.length}).`);

  const doc = await ReviewInsight.findOne({ professional: professionalId });
  if (doc?.generationStatus === 'ready') {
    const f = freshness(doc, ids);
    if (!f.needsRegeneration) return res.json({ ...body('ready', { data: publicView(doc, ids), freshness: f, ...modeInfoFor(doc) }), generated: false, reason: 'up_to_date', message: `Insights are up to date. They refresh after ${f.minNewReviews} new reviews.` });
    if (!f.canRegenerate) return res.json({ ...body('ready', { data: publicView(doc, ids), freshness: f, ...modeInfoFor(doc) }), generated: false, reason: 'cooldown', message: `Insights were updated recently. Try again in ${f.cooldownRemainingSeconds} seconds.` });
  }
  const fresh = await runGeneration(professionalId, provider);
  res.status(201).json({ ...body('ready', { data: publicView(fresh, ids), freshness: freshness(fresh, ids), ...modeInfoFor(fresh) }), generated: true, reason: 'generated', message: 'Insights updated.' });
});

export default router;
