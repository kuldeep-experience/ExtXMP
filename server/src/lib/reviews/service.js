import { z } from 'zod';
import { env } from '../../config/env.js';
import Professional from '../../models/Professional.js';
import ReviewInsight from '../../models/ReviewInsight.js';
import { ACTIVE } from '../professionalSearch.js';
import { ApiError } from '../../middleware/error.js';
import { buildDigest, loadPublicReviews } from './aggregate.js';
import { analyzeReviews } from './analyze.js';
import { requestLlmInsights, sanitizeLlmInsights } from './llm.js';

// Mutable so tests can change the policy; defaults come from the environment.
export const policy = {
  minReviews: 5, // below this there is nothing meaningful to summarize
  minNewReviews: env.REVIEW_INSIGHTS_MIN_NEW_REVIEWS, // regenerate after this many new public reviews
  cooldownMs: env.REVIEW_INSIGHTS_COOLDOWN_SECONDS * 1000, // and never more often than this
};

const item = z.object({
  label: z.string().min(1).max(100), detail: z.string().max(300).nullable(), count: z.number().int().min(1),
  commonality: z.enum(['common', 'occasional', 'isolated']), sourceReviewIds: z.array(z.string()).min(1).max(40),
  quote: z.object({ reviewId: z.string(), text: z.string().max(300), field: z.string().optional() }).nullable(),
}).passthrough();
const contentSchema = z.object({
  summary: z.object({ text: z.string().min(1).max(900) }).passthrough(),
  positiveFeedback: z.array(item), strengths: z.array(item), concerns: z.array(item), services: z.array(item), experienceThemes: z.array(item),
  recentTrends: z.array(z.object({ label: z.string(), detail: z.string().nullable(), direction: z.enum(['up', 'down', 'steady', 'info']), sourceReviewIds: z.array(z.string()).max(40) })),
});

// Builds the insight content from the reviews. A configured model is used when available; otherwise (or if it fails) the demo analyzer.
export async function buildContent(digest, professional, provider) {
  const demo = analyzeReviews(digest);
  if (provider.isDemo) return { content: demo, mode: 'demo', providerLabel: 'Demo analyzer', model: null, note: null };
  try {
    const { content } = sanitizeLlmInsights(await requestLlmInsights({ provider, digest, professional }), digest, demo);
    return { content, mode: 'live', providerLabel: provider.label, model: provider.model ?? null, note: null };
  } catch (err) {
    console.warn(`[insights] ${provider.name} failed, using the demo analyzer: ${err.message}`);
    return { content: demo, mode: 'demo', providerLabel: 'Demo analyzer', model: null, note: 'The AI provider was unavailable, so the demo analyzer was used.' };
  }
}

const inFlight = new Map(); // professionalId -> Promise: one generation per professional at a time

async function generate(professionalId, provider, now) {
  const professional = await Professional.findOne({ _id: professionalId, ...ACTIVE }).select('title category').lean();
  if (!professional) throw new ApiError(404, 'Professional not found');
  const reviews = await loadPublicReviews(professionalId);
  if (reviews.length < policy.minReviews) throw new ApiError(400, `At least ${policy.minReviews} reviews are needed to generate insights`);
  const digest = buildDigest(reviews);
  const { content, mode, providerLabel, model, note } = await buildContent(digest, professional, provider);

  const clean = JSON.parse(JSON.stringify(content));
  const parsed = contentSchema.parse(clean); // shape check before anything is stored
  // Every cited review must be one of the reviews that were analyzed
  const items = [parsed.positiveFeedback, parsed.strengths, parsed.concerns, parsed.services, parsed.experienceThemes, parsed.recentTrends].flat();
  const cited = items.flatMap((i) => [...i.sourceReviewIds, ...(i.quote ? [i.quote.reviewId] : [])]);
  if (cited.some((id) => !digest.byId.has(id))) throw new Error('insight cites a review that was not analyzed');

  return ReviewInsight.findOneAndUpdate({ professional: professionalId }, {
    $set: {
      ...clean, reviewsAnalyzed: digest.count, sourceReviewIds: digest.reviews.map((r) => r.id), generatedAt: now, lastAttemptAt: now,
      generationStatus: 'ready', mode, provider: providerLabel, model, note, error: null,
    },
  }, { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true });
}

// Runs a generation once at a time per professional, recording failures. Callers may await it or let it run in the background.
// `placeholder` marks a first-time generation so readers see "generating" meanwhile. The in-flight marker is set synchronously,
// so simultaneous requests share one generation (and one provider call).
export function runGeneration(professionalId, provider, now = new Date(), { placeholder = false } = {}) {
  const key = String(professionalId);
  if (inFlight.has(key)) return inFlight.get(key);
  const p = (async () => {
    try {
      if (placeholder) await ReviewInsight.updateOne({ professional: professionalId, generationStatus: { $ne: 'ready' } }, { $set: { generationStatus: 'generating', lastAttemptAt: now } }, { upsert: true }).catch(() => {});
      return await generate(professionalId, provider, now);
    } catch (err) {
      if (!(err instanceof ApiError)) {
        console.error('[insights] generation failed:', err.message);
        await ReviewInsight.updateOne({ professional: professionalId }, { $set: { generationStatus: 'failed', lastAttemptAt: now, error: 'Insights could not be generated right now.' } }, { upsert: true });
      }
      throw err;
    } finally { inFlight.delete(key); }
  })();
  inFlight.set(key, p);
  p.catch(() => {}); // callers that do not await must not crash the process
  return p;
}
export const isGenerating = (professionalId) => inFlight.has(String(professionalId));

export const startBackground = (professionalId, provider) => runGeneration(professionalId, provider, new Date(), { placeholder: true });

export function freshness(insight, currentIds, now = Date.now()) {
  const current = new Set(currentIds);
  const source = new Set((insight.sourceReviewIds || []).map(String));
  const newReviews = [...current].filter((id) => !source.has(id)).length;
  const removedSources = [...source].filter((id) => !current.has(id)).length;
  const last = insight.generatedAt ? new Date(insight.generatedAt).getTime() : 0;
  const cooldownRemainingMs = Math.max(0, last + policy.cooldownMs - now);
  return {
    newReviews, removedSources, minNewReviews: policy.minNewReviews,
    needsRegeneration: removedSources > 0 || newReviews >= policy.minNewReviews,
    cooldownRemainingSeconds: Math.ceil(cooldownRemainingMs / 1000),
    canRegenerate: removedSources > 0 || cooldownRemainingMs === 0, // content from a removed review must be replaced immediately
  };
}

// Removes references to reviews that are no longer public (and their quotes) from what is sent to clients.
export function publicView(doc, publicIds) {
  const ok = new Set(publicIds);
  const o = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  const keep = (items) => items.map((i) => ({ ...i, sourceReviewIds: (i.sourceReviewIds || []).filter((id) => ok.has(String(id))), quote: i.quote && ok.has(String(i.quote.reviewId)) ? i.quote : null }));
  return {
    _id: o._id, professional: o.professional, summary: o.summary,
    positiveFeedback: keep(o.positiveFeedback), strengths: keep(o.strengths), concerns: keep(o.concerns),
    recentTrends: keep(o.recentTrends), services: keep(o.services), experienceThemes: keep(o.experienceThemes),
    reviewsAnalyzed: o.reviewsAnalyzed, sourceReviewIds: (o.sourceReviewIds || []).map(String).filter((id) => ok.has(id)),
    generatedAt: o.generatedAt, updatedAt: o.updatedAt, generationStatus: o.generationStatus,
    mode: o.mode, provider: o.provider, model: o.model, note: o.note,
  };
}
