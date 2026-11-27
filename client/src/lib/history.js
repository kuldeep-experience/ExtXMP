import { api } from './api.js';

// Fire-and-forget: history is a convenience and must never get in the way. The server decides whether anything is stored
// (it checks the visitor's privacy settings), so these are safe to call even when tracking is off.
const quiet = (p) => p.catch(() => null);
export const trackView = (professionalId) => quiet(api.post('/recently-viewed', { professionalId }));
export const trackSearch = (query, filters) => quiet(api.post('/search-history', { query, filters }));
export const trackComparison = (professionalIds) => quiet(api.post('/recent-comparisons', { professionalIds }));
export const trackingOn = (user) => !!user && user.privacySettings?.trackHistory !== false;

// The directory parameters a stored search may contain (must match the server's whitelist).
export const FILTER_KEYS = ['category', 'location', 'specialization', 'services', 'minRating', 'minExperience', 'verified', 'lat', 'lng', 'maxDistanceKm', 'sort', 'near'];

export const searchUrl = (s) => `/professionals?${new URLSearchParams({ ...(s.query && { q: s.query }), ...s.filters })}`;

const title = (slug) => slug.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
const SORTS = { reviews: 'Most reviewed', experience: 'Most experienced', name: 'Name (A–Z)' };
export function searchChips(s) {
  const f = s.filters || {};
  const chips = [];
  if (s.query) chips.push(`“${s.query}”`);
  if (f.category) chips.push(title(f.category));
  if (f.maxDistanceKm) chips.push(`Within ${f.maxDistanceKm} km of ${f.near || 'selected location'}`);
  else if (f.location) chips.push(f.location);
  if (f.minRating) chips.push(`Rated ${f.minRating}+`);
  if (f.minExperience) chips.push(`${f.minExperience}+ yrs`);
  if (f.specialization) f.specialization.split(',').forEach((x) => chips.push(x));
  if (f.services) f.services.split(',').forEach((x) => chips.push(`Service: ${x}`));
  if (f.verified === 'true') chips.push('Verified only');
  if (SORTS[f.sort]) chips.push(`Sort: ${SORTS[f.sort]}`);
  return chips;
}
