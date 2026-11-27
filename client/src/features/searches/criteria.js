// Conversion between the directory page's URL parameters and saved-search criteria,
// plus a readable summary of a saved search. The URL parameters are exactly the directory API's parameters.
const csv = (s) => (s || '').split(',').map((x) => x.trim()).filter(Boolean);

export function paramsToCriteria(params) {
  const num = (k) => (params.get(k) ? Number(params.get(k)) : null);
  const [lat, lng, dist] = [num('lat'), num('lng'), num('maxDistanceKm')];
  const geo = lat != null && lng != null && dist != null;
  return {
    category: params.get('category') || null,
    location: geo ? params.get('near') || '' : params.get('location') || '',
    latitude: geo ? lat : null,
    longitude: geo ? lng : null,
    radiusKm: null,
    maxDistanceKm: geo ? dist : null,
    minRating: num('minRating'),
    specializations: csv(params.get('specialization')),
    serviceRequirements: csv(params.get('services')),
    additionalFilters: { keyword: params.get('q') || '', minExperience: num('minExperience'), verifiedOnly: params.get('verified') === 'true', sort: params.get('sort') || 'rating' },
  };
}

// Directory URL for a run result: the query returned by the API, plus labels used only by the UI.
export function directoryUrl(search, query) {
  const p = new URLSearchParams(Object.entries(query).map(([k, v]) => [k, String(v)]));
  if (query.maxDistanceKm != null) p.set('near', search.location || 'selected location');
  p.set('savedSearch', search._id);
  return `/professionals?${p}`;
}

export const effectiveDistance = (s) => {
  const d = [s.radiusKm, s.maxDistanceKm].filter((v) => typeof v === 'number');
  return d.length ? Math.min(...d) : null;
};

const SORT_LABELS = { reviews: 'Most reviewed', experience: 'Most experienced', name: 'Name (A–Z)' };

export function criteriaChips(s) {
  const chips = [];
  const dist = effectiveDistance(s);
  const f = s.additionalFilters || {};
  if (s.categoryName || s.category) chips.push(s.categoryName || s.category);
  if (dist != null && s.latitude != null) chips.push(`Within ${dist} km of ${s.location || 'selected location'}`);
  else if (s.location) chips.push(s.location);
  if (typeof s.minRating === 'number') chips.push(`Rated ${s.minRating}+`);
  s.specializations?.forEach((x) => chips.push(x));
  s.serviceRequirements?.forEach((x) => chips.push(`Service: ${x}`));
  if (f.keyword) chips.push(`“${f.keyword}”`);
  if (typeof f.minExperience === 'number') chips.push(`${f.minExperience}+ yrs experience`);
  if (f.verifiedOnly) chips.push('Verified only');
  if (SORT_LABELS[f.sort]) chips.push(`Sort: ${SORT_LABELS[f.sort]}`);
  return chips;
}
