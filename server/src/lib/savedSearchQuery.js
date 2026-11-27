// Converts a saved search into query parameters for the existing directory search (lib/professionalSearch.js).
// This is the single mapping between the two: saved search field -> directory parameter.
export function effectiveDistanceKm(s) {
  const d = [s.radiusKm, s.maxDistanceKm].filter((v) => typeof v === 'number');
  return d.length ? Math.min(...d) : null; // when both are set the stricter one wins
}

export function toDirectoryQuery(s) {
  const q = {};
  const distance = effectiveDistanceKm(s);
  const hasPoint = typeof s.latitude === 'number' && typeof s.longitude === 'number';
  if (s.category) q.category = s.category;
  if (hasPoint && distance != null) {
    // A distance search replaces the text location (the text is only a label for the point).
    Object.assign(q, { lat: s.latitude, lng: s.longitude, maxDistanceKm: distance });
  } else if (s.location) {
    q.location = s.location;
  }
  if (typeof s.minRating === 'number') q.minRating = s.minRating;
  if (s.specializations?.length) q.specialization = s.specializations.join(',');
  if (s.serviceRequirements?.length) q.services = s.serviceRequirements.join(',');
  const f = s.additionalFilters || {};
  if (f.keyword) q.q = f.keyword;
  if (typeof f.minExperience === 'number') q.minExperience = f.minExperience;
  if (f.verifiedOnly) q.verified = 'true';
  if (f.sort) q.sort = f.sort;
  return q;
}
