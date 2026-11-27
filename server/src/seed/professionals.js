import Professional from '../models/Professional.js';
import { categories, cityCoords, people } from './catalog.js';
import { createRandom } from './random.js';

const SEED = 20260101;
let int, pick, rng;
const an = (w) => (/^[aeiou]/i.test(w) ? 'an' : 'a');
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '');
const phone = (i) => `(${[212, 305, 415, 512, 602, 713][i % 6]}) 555-01${String(10 + i).padStart(2, '0')}`; // 555-01xx numbers are reserved for fiction

// 38 fictional professionals across 6 categories (36 active, 1 inactive, 1 pending).
// Ratings and review counts are filled in by seedReviews() from the real review data.
export async function seedProfessionals() {
  ({ int, pick, rng } = createRandom(SEED)); // restart the sequence so every run produces the same data
  await Professional.deleteMany({});
  const docs = people.map((p, i) => {
    const cat = categories[p.cat];
    const [first, ...rest] = p.name.split(' ');
    const last = rest.join(' ');
    const years = int(2, 30);
    const specs = pick(cat.specializations, int(3, 4));
    const title = cat.titles[i % cat.titles.length];
    return {
      fullName: p.name, profileImage: null, title, category: cat.name, categorySlug: cat.slug, specializations: specs,
      description: `With ${years} years of experience, ${p.name} serves clients in ${p.city}, ${p.state} as ${an(title)} ${title}. Focus areas include ${specs.slice(0, -1).join(', ')} and ${specs.at(-1)}. ${cat.closers[i % 2]}`,
      yearsOfExperience: years, location: `${p.city}, ${p.state}`, city: p.city, state: p.state, country: 'United States',
      coordinates: { type: 'Point', coordinates: [...cityCoords[`${p.city}|${p.state}`]].reverse() }, // [lng, lat]
      contactEmail: `${slug(first)}.${slug(last)}@example.com`, phone: phone(i), website: `https://www.${slug(first)}${slug(last)}.example`,
      services: pick(cat.services, int(4, 5)), qualifications: pick(cat.qualifications, int(2, 3)).map((q) => q.replaceAll('{state}', p.state)),
      verificationStatus: rng() < 0.25 ? 'unverified' : 'verified', profileStatus: p.status, averageRating: 0, reviewCount: 0,
    };
  });
  return Professional.insertMany(docs);
}
