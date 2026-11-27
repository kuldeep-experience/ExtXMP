import Review, { PUBLIC_REVIEW } from '../../models/Review.js';

// Only reviews that are approved AND visible are ever analyzed or shown. Pending, rejected and hidden reviews are excluded.
export const publicReviewFilter = (professionalId) => ({ professional: professionalId, ...PUBLIC_REVIEW });

export async function loadPublicReviews(professionalId) {
  return Review.find(publicReviewFilter(professionalId)).sort({ reviewDate: -1, _id: 1 }).select('_id rating title text serviceCategory reviewDate').lean();
}

const round1 = (n) => Math.round(n * 10) / 10;

// Prepares review data for analysis (deterministic or model). Reviewer names and every other personal detail are left out.
export function buildDigest(reviews) {
  const rs = reviews.map((r) => ({ id: String(r._id), rating: r.rating, date: new Date(r.reviewDate), title: r.title, text: r.text, service: r.serviceCategory || null }));
  const count = rs.length;
  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  rs.forEach((r) => { distribution[r.rating] += 1; });
  const average = count ? round1(rs.reduce((s, r) => s + r.rating, 0) / count) : 0;
  const byDate = [...rs].sort((a, b) => b.date - a.date || a.id.localeCompare(b.id));
  const recentSize = Math.max(3, Math.ceil(count / 3)); // the latest third, at least three reviews
  const recent = byDate.slice(0, recentSize);
  const earlier = byDate.slice(recentSize);
  return {
    reviews: byDate, count, average, distribution,
    positiveShare: count ? Math.round(((distribution[4] + distribution[5]) / count) * 100) : 0,
    dateRange: count ? { from: byDate.at(-1).date, to: byDate[0].date } : null,
    recent, earlier,
    avgRecent: recent.length ? round1(recent.reduce((s, r) => s + r.rating, 0) / recent.length) : null,
    avgEarlier: earlier.length ? round1(earlier.reduce((s, r) => s + r.rating, 0) / earlier.length) : null,
    byId: new Map(rs.map((r) => [r.id, r])),
  };
}
