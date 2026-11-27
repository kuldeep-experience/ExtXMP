import SavedSearch from '../models/SavedSearch.js';
import { categories as catalog } from './catalog.js';
import { createRandom } from './random.js';

const SEED = 4242;
let int, pick, shuffle;
const DAY = 86400000;
const catName = Object.fromEntries(catalog.map((c) => [c.slug, c.name]));
const lower = (s) => s.toLowerCase();

// Each template builds a search from a real professional, so it always uses valid criteria and has at least one match.
const templates = [
  (p) => {
    const options = [3, 3.5, 4, 4.5].filter((x) => x <= p.averageRating); // any threshold this professional meets, so the search always matches
    const r = options[int(0, options.length - 1)];
    return { name: `${r >= 4.5 ? 'Top-rated' : `${r.toFixed(1)}+ rated`} ${lower(catName[p.categorySlug])} in ${p.city}`, category: p.categorySlug, location: p.city, minRating: r };
  },
  (p) => {
    const km = [10, 25, 50][int(0, 2)];
    const s = { name: `${catName[p.categorySlug]} within ${km} km of ${p.city}`, category: p.categorySlug, location: `${p.city}, ${p.state}`, latitude: p.coordinates.coordinates[1], longitude: p.coordinates.coordinates[0] };
    return int(0, 1) ? { ...s, radiusKm: km } : { ...s, maxDistanceKm: km };
  },
  () => ({ name: 'Professionals rated above 4.5', minRating: 4.5, additionalFilters: { sort: 'rating' } }),
  (p) => {
    const spec = p.specializations[0];
    return { name: spec === 'First-Time Buyers' ? 'First-time home buyer specialists' : `${spec} specialists`, specializations: [spec], additionalFilters: { sort: 'reviews' } };
  },
  (p) => {
    const svc = p.services[0];
    return { name: `${svc} in ${p.state}`, serviceRequirements: [svc], location: p.state, additionalFilters: { verifiedOnly: p.verificationStatus === 'verified' } };
  },
  (p) => {
    const years = Math.floor(p.yearsOfExperience / 5) * 5;
    return { name: `Experienced ${lower(catName[p.categorySlug])} (${years}+ years)`, category: p.categorySlug, additionalFilters: { minExperience: years, sort: 'experience' } };
  },
];

// 5-6 saved searches per demo visitor, with different categories, locations, ratings, distances and service requirements.
export async function seedSavedSearches({ visitors, professionals }, now = Date.now()) {
  ({ int, pick, shuffle } = createRandom(SEED)); // restart the sequence so every run produces the same data
  await SavedSearch.deleteMany({});
  const active = professionals.filter((p) => p.profileStatus === 'active');
  const experienced = active.filter((p) => p.yearsOfExperience >= 5);
  const docs = [];
  for (const v of visitors) {
    shuffle(templates).slice(0, int(5, 6)).forEach((make, i) => {
      const tpl = make.length === 0 ? make() : make(pick(make === templates[5] ? experienced : active, 1)[0]);
      const created = now - int(40, 120) * DAY;
      docs.push({
        ...tpl, visitor: v._id, nameKey: tpl.name.toLowerCase(),
        createdAt: new Date(created), updatedAt: new Date(created),
        lastUsedAt: i % 3 === 2 ? null : new Date(now - int(1, 39) * DAY), // some searches were never run
      });
    });
  }
  return SavedSearch.insertMany(docs);
}
