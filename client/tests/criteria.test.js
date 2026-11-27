import { criteriaChips, directoryUrl, effectiveDistance, paramsToCriteria } from '../src/features/searches/criteria.js';

const P = (s) => new URLSearchParams(s);

test('URL parameters become saved-search criteria', () => {
  const c = paramsToCriteria(P('category=legal-professionals&location=TX&minRating=4.5&specialization=Estate%20Planning,Family%20Law&services=Contract%20Review&q=ann&minExperience=10&verified=true&sort=reviews'));
  expect(c).toMatchObject({ category: 'legal-professionals', location: 'TX', minRating: 4.5, specializations: ['Estate Planning', 'Family Law'], serviceRequirements: ['Contract Review'], latitude: null, maxDistanceKm: null });
  expect(c.additionalFilters).toEqual({ keyword: 'ann', minExperience: 10, verifiedOnly: true, sort: 'reviews' });
});

test('a distance search keeps its coordinates and uses the label as the location', () => {
  const c = paramsToCriteria(P('lat=40.7&lng=-74&maxDistanceKm=25&near=New%20York,%20NY'));
  expect(c).toMatchObject({ latitude: 40.7, longitude: -74, maxDistanceKm: 25, location: 'New York, NY' });
  // incomplete geo parameters are ignored rather than half-saved
  expect(paramsToCriteria(P('lat=40.7&lng=-74')).latitude).toBeNull();
});

test('a run result opens the directory with the same filters, a label and the saved search id', () => {
  const url = directoryUrl({ _id: 'abc', location: 'Austin, TX' }, { category: 'financial-advisors', lat: 30.2, lng: -97.7, maxDistanceKm: 10, sort: 'rating' });
  const p = new URL(url, 'http://x').searchParams;
  expect(url.startsWith('/professionals?')).toBe(true);
  expect(Object.fromEntries(p)).toMatchObject({ category: 'financial-advisors', lat: '30.2', lng: '-97.7', maxDistanceKm: '10', near: 'Austin, TX', savedSearch: 'abc' });
  expect(directoryUrl({ _id: 'x', location: 'Boston' }, { location: 'Boston' })).not.toContain('near=');
});

test('the stricter of radius and maximum distance wins', () => {
  expect(effectiveDistance({ radiusKm: 10, maxDistanceKm: 25 })).toBe(10);
  expect(effectiveDistance({ maxDistanceKm: 25 })).toBe(25);
  expect(effectiveDistance({})).toBeNull();
});

test('criteria summary lists what the search will do', () => {
  const chips = criteriaChips({ categoryName: 'Legal Professionals', latitude: 1, longitude: 2, maxDistanceKm: 25, location: 'Newark, NJ', minRating: 4, specializations: ['Family Law'], serviceRequirements: ['Contract Review'], additionalFilters: { verifiedOnly: true, minExperience: 5, sort: 'experience' } });
  expect(chips).toEqual(['Legal Professionals', 'Within 25 km of Newark, NJ', 'Rated 4+', 'Family Law', 'Service: Contract Review', '5+ yrs experience', 'Verified only', 'Sort: Most experienced']);
});
