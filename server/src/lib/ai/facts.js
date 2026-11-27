import Professional from '../../models/Professional.js';
import { ACTIVE, directoryLocations } from '../professionalSearch.js';

// Everything the assistant is allowed to refer to: values that exist in the directory right now.
export async function directoryFacts() {
  const [rows, locations] = await Promise.all([Professional.find(ACTIVE).select('category categorySlug specializations services').lean(), directoryLocations()]);
  const categories = new Map();
  const specializations = new Set();
  const services = new Set();
  const categorySpecs = new Map();
  const categoryServices = new Map();
  for (const r of rows) {
    categories.set(r.categorySlug, r.category);
    if (!categorySpecs.has(r.categorySlug)) { categorySpecs.set(r.categorySlug, new Set()); categoryServices.set(r.categorySlug, new Set()); }
    r.specializations.forEach((x) => { specializations.add(x); categorySpecs.get(r.categorySlug).add(x); });
    r.services.forEach((x) => { services.add(x); categoryServices.get(r.categorySlug).add(x); });
  }
  return { categories, specializations, services, categorySpecs, categoryServices, locations };
}
