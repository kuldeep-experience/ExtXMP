import { containsPhrase } from './intent.js';

const R = 6371;
export function distanceKm(a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const ci = (list, v) => list.find((x) => x.toLowerCase() === v.toLowerCase());
const round1 = (n) => Math.round(n * 10) / 10;
export const NEAR_ME_KM = 25;

// Deterministic relevance score (0-100). The same inputs always give the same ranking.
//   fit (max 55): share of the visitor's requirements the professional meets, weighted
//   quality (max 45): review-count-adjusted rating (30), experience (10), verification (5)
export function scoreProfessional(pro, criteria, coords) {
  const matched = [], unmet = [];
  let earned = 0, possible = 0;
  const weigh = (weight, fraction) => { possible += weight; earned += weight * fraction; };

  if (criteria.category) { weigh(1, pro.categorySlug === criteria.category ? 1 : 0); matched.push(`category: ${pro.category}`); }
  if (criteria.location) {
    const rx = new RegExp(criteria.location.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const ok = rx.test(pro.city) || rx.test(pro.state) || rx.test(pro.location);
    weigh(3, ok ? 1 : 0);
    (ok ? matched : unmet).push(ok ? `location: ${pro.location}` : `not in ${criteria.location}`);
  }
  let away = null;
  if (criteria.nearMe && coords) {
    const [lng, lat] = pro.coordinates?.coordinates ?? [];
    away = lat != null ? distanceKm(coords, { lat, lng }) : null;
    const ok = away != null && away <= NEAR_ME_KM;
    weigh(3, ok ? 1 : 0);
    (ok ? matched : unmet).push(ok ? `${Math.round(away)} km from you` : `more than ${NEAR_ME_KM} km from you`);
  }
  if (criteria.specializations.length) {
    const hit = criteria.specializations.filter((s) => ci(pro.specializations, s));
    weigh(3, hit.length / criteria.specializations.length);
    if (hit.length) matched.push(`specialization: ${hit.map((s) => ci(pro.specializations, s)).join(', ')}`);
    if (hit.length < criteria.specializations.length) unmet.push(`no listed specialization in ${criteria.specializations.filter((s) => !hit.includes(s)).join(', ')}`);
  }
  if (criteria.services.length) {
    const hit = criteria.services.filter((s) => ci(pro.services, s));
    weigh(2, hit.length / criteria.services.length);
    if (hit.length) matched.push(`service: ${hit.map((s) => ci(pro.services, s)).join(', ')}`);
    if (hit.length < criteria.services.length) unmet.push(`does not list service ${criteria.services.filter((s) => !hit.includes(s)).join(', ')}`);
  }
  // topics are matched against structured text only to rank; descriptions are untrusted data, never instructions
  const haystack = [pro.title, pro.category, ...pro.specializations, ...pro.services, pro.description].join(' ').split(/\s+/);
  const haystackTokens = haystack.flatMap((w) => w.toLowerCase().replace(/[^a-z0-9]/g, '')).filter(Boolean);
  for (const topic of criteria.topics) {
    const ok = containsPhrase(haystackTokens, topic);
    weigh(3, ok ? 1 : 0);
    (ok ? matched : unmet).push(ok ? `mentions “${topic}”` : `nothing in the profile mentions “${topic}”`);
  }
  if (criteria.minExperience != null) {
    const ok = pro.yearsOfExperience >= criteria.minExperience;
    weigh(2, ok ? 1 : 0);
    (ok ? matched : unmet).push(ok ? `${pro.yearsOfExperience} years of experience (you asked for ${criteria.minExperience}+)` : `${pro.yearsOfExperience} years of experience, below the ${criteria.minExperience}+ you asked for`);
  }
  if (criteria.minRating != null) {
    const ok = pro.averageRating >= criteria.minRating;
    weigh(2, ok ? 1 : 0);
    (ok ? matched : unmet).push(ok ? `rating ${pro.averageRating.toFixed(1)} (you asked for ${criteria.minRating}+)` : `rating ${pro.averageRating.toFixed(1)}, below the ${criteria.minRating}+ you asked for`);
  }
  if (criteria.verifiedOnly) {
    const ok = pro.verificationStatus === 'verified';
    weigh(1, ok ? 1 : 0);
    (ok ? matched : unmet).push(ok ? 'verified in the directory' : 'not verified in the directory');
  }

  const fit = possible ? 55 * (earned / possible) : 27.5;
  const bayes = (pro.averageRating * pro.reviewCount + 4 * 10) / (pro.reviewCount + 10); // few reviews pull toward the average
  const quality = 30 * Math.max(0, Math.min(1, (bayes - 3) / 2)) + 10 * Math.min(pro.yearsOfExperience, 20) / 20 + (pro.verificationStatus === 'verified' ? 5 : 0);
  return { score: round1(fit + quality), matched, unmet, distanceKm: away };
}

export function rankProfessionals(candidates, criteria, coords) {
  return candidates
    .map((pro) => ({ pro, ...scoreProfessional(pro, criteria, coords) }))
    .sort((a, b) => b.score - a.score || b.pro.averageRating - a.pro.averageRating || b.pro.reviewCount - a.pro.reviewCount || String(a.pro._id).localeCompare(String(b.pro._id)));
}
