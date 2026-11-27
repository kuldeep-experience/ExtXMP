import SearchHistory from '../models/SearchHistory.js';
import { DAY } from '../lib/history.js';
import { listQuery, searchProfessionals } from '../lib/professionalSearch.js';
import { createRandom } from './random.js';

const SEED = 1314;
let int, pick, shuffle;
const key = (query, filters) => JSON.stringify([query.toLowerCase(), Object.entries(filters).sort(([a], [b]) => a.localeCompare(b))]);

// Each template builds a real directory search from a real professional.
const templates = [
  (p) => ({ query: '', filters: { category: p.categorySlug, location: p.city, minRating: String(Math.floor(p.averageRating * 2) / 2) } }),
  (p) => ({ query: p.fullName.split(' ')[1], filters: {} }),
  (p) => ({ query: '', filters: { specialization: p.specializations[0], sort: 'reviews' } }),
  (p) => ({ query: '', filters: { services: p.services[0], location: p.state } }),
  (p) => ({ query: '', filters: { category: p.categorySlug, minExperience: String(Math.max(5, Math.floor(p.yearsOfExperience / 5) * 5)), sort: 'experience' } }),
  (p) => ({ query: '', filters: { lat: String(p.coordinates.coordinates[1]), lng: String(p.coordinates.coordinates[0]), maxDistanceKm: String([10, 25, 50][int(0, 2)]), near: `${p.city}, ${p.state}` } }),
  (p) => ({ query: p.title.split(' ')[0], filters: { verified: 'true' } }),
];

// 6 distinct searches per visitor. The stored result count is the real count from the directory search.
export async function seedSearchHistory({ visitors, professionals }, now = Date.now()) {
  ({ int, pick, shuffle } = createRandom(SEED)); // restart the sequence so every run produces the same data
  await SearchHistory.deleteMany({});
  const active = professionals.filter((p) => p.profileStatus === 'active');
  const docs = [];
  for (const v of visitors) {
    const seen = new Set();
    for (const make of shuffle(templates)) {
      if (seen.size >= 6) break;
      const { query, filters } = make(pick(active, 1)[0]);
      const k = key(query, filters);
      if (seen.has(k)) continue;
      const { near, ...params } = filters;
      const resultsCount = (await searchProfessionals(listQuery.parse({ ...params, ...(query && { q: query }), page: 1, limit: 1 }))).pagination.total;
      seen.add(k);
      docs.push({ visitor: v._id, query, filters, queryKey: k, resultsCount, searchedAt: new Date(now - int(0, 60) * DAY - int(0, 23) * 3600000) });
    }
  }
  return SearchHistory.insertMany(docs);
}
