import Professional from '../models/Professional.js';
import Review, { PUBLIC_REVIEW } from '../models/Review.js';
import { categories, firstNames, positiveClosers, mixedClosers, positiveTitles, mixedTitles } from './catalog.js';
import { createRandom } from './random.js';

const SEED = 20260202;
let rng, int, shuffle;
const DAY = 86400000;
const bySlug = Object.fromEntries(categories.map((c) => [c.slug, c]));

function reviewsFor(pro, now) {
  const cat = bySlug[pro.categorySlug];
  const publicCount = int(15, 20);
  const extra = int(0, 2); // pending, rejected or hidden reviews that the public API never returns
  const target = 3.2 + rng() * 1.7; // gives each professional an average between about 3.2 and 4.9
  const pos = shuffle(cat.positive.flatMap((b) => positiveClosers.map((c) => `${b} ${c}`)));
  const mixed = shuffle(cat.mixed.flatMap((b) => mixedClosers.map((c) => `${b} ${c}`)));
  const posTitles = shuffle(positiveTitles), mixTitles = shuffle(mixedTitles);
  const out = [];
  for (let i = 0; i < publicCount + extra; i++) {
    const rating = Math.max(3, Math.min(5, Math.round(target + (rng() + rng() - 1) * 1.2)));
    const good = rating >= 4;
    const isPublic = i < publicCount;
    const flavour = isPublic ? 'public' : ['pending', 'rejected', 'hidden'][int(0, 2)];
    out.push({
      professional: pro._id,
      reviewerName: `${firstNames[int(0, firstNames.length - 1)]} ${String.fromCharCode(65 + int(0, 25))}.`,
      rating,
      title: (good ? posTitles : mixTitles)[i % (good ? posTitles : mixTitles).length],
      text: (good ? pos : mixed)[i % (good ? pos : mixed).length],
      serviceCategory: pro.services[int(0, pro.services.length - 1)],
      reviewDate: new Date(now - int(5, 1000) * DAY),
      moderationStatus: flavour === 'pending' ? 'pending' : flavour === 'rejected' ? 'rejected' : 'approved',
      visibility: flavour === 'hidden' ? 'hidden' : 'visible',
    });
  }
  return out;
}

// 15-20 public reviews per professional (plus a few non-public ones). Each professional's average rating and review count
// are then computed from the stored public reviews, so they always match.
export async function seedReviews({ professionals }, now = Date.now()) {
  ({ rng, int, shuffle } = createRandom(SEED)); // restart the sequence so every run produces the same data
  await Review.deleteMany({});
  const reviews = await Review.insertMany(professionals.flatMap((p) => reviewsFor(p, now)));
  const stats = await Review.aggregate([{ $match: PUBLIC_REVIEW }, { $group: { _id: '$professional', n: { $sum: 1 }, avg: { $avg: '$rating' } } }]);
  await Professional.bulkWrite(stats.map((s) => ({ updateOne: { filter: { _id: s._id }, update: { $set: { reviewCount: s.n, averageRating: Math.round(s.avg * 10) / 10 } } } })));
  return reviews;
}
