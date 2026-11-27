import { z } from 'zod';
import Professional from '../models/Professional.js';

// The one and only professional search implementation. The directory endpoint and saved searches both use it.
export const ACTIVE = { profileStatus: 'active' };
const EARTH_RADIUS_KM = 6378.1;
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const blankToUndefined = (v) => (v === '' ? undefined : v);
const opt = (schema) => z.preprocess(blankToUndefined, schema.optional());

export const listQuery = z.object({
  q: opt(z.string().trim().max(100)),
  category: opt(z.string().trim().max(100)), // slug or exact name
  location: opt(z.string().trim().max(100)),
  specialization: opt(z.string().max(500)), // comma separated, matches any
  services: opt(z.string().max(500)), // comma separated, matches any
  minRating: opt(z.coerce.number().min(0).max(5)),
  minExperience: opt(z.coerce.number().int().min(0).max(80)),
  verified: opt(z.enum(['true', 'false'])),
  // distance filter: all three together
  lat: opt(z.coerce.number().min(-90).max(90)),
  lng: opt(z.coerce.number().min(-180).max(180)),
  maxDistanceKm: opt(z.coerce.number().min(1).max(500)),
  sort: z.preprocess(blankToUndefined, z.enum(['rating', 'reviews', 'experience', 'name']).default('rating')),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(12),
}).refine((p) => [p.lat, p.lng, p.maxDistanceKm].every((v) => v === undefined) || [p.lat, p.lng, p.maxDistanceKm].every((v) => v !== undefined),
  { message: 'lat, lng and maxDistanceKm must be provided together', path: ['maxDistanceKm'] });

export const SORTS = {
  rating: { averageRating: -1, reviewCount: -1, _id: 1 },
  reviews: { reviewCount: -1, averageRating: -1, _id: 1 },
  experience: { yearsOfExperience: -1, averageRating: -1, _id: 1 },
  name: { fullName: 1, _id: 1 },
};

const csv = (s) => (s || '').split(',').map((x) => x.trim()).filter(Boolean);

export function buildFilter(p) {
  const and = [ACTIVE];
  if (p.q) {
    const rx = new RegExp(escapeRegex(p.q), 'i');
    and.push({ $or: [{ fullName: rx }, { title: rx }, { category: rx }, { specializations: rx }] });
  }
  if (p.category) and.push({ $or: [{ categorySlug: p.category }, { category: p.category }] });
  if (p.location) {
    const rx = new RegExp(escapeRegex(p.location), 'i');
    and.push({ $or: [{ city: rx }, { state: rx }, { location: rx }] });
  }
  if (csv(p.specialization).length) and.push({ specializations: { $in: csv(p.specialization) } });
  if (csv(p.services).length) and.push({ services: { $in: csv(p.services) } });
  if (p.minRating != null) and.push({ averageRating: { $gte: p.minRating } });
  if (p.minExperience != null) and.push({ yearsOfExperience: { $gte: p.minExperience } });
  if (p.verified) and.push({ verificationStatus: p.verified === 'true' ? 'verified' : 'unverified' });
  if (p.maxDistanceKm != null) {
    and.push({ coordinates: { $geoWithin: { $centerSphere: [[p.lng, p.lat], p.maxDistanceKm / EARTH_RADIUS_KM] } } });
  }
  return { $and: and };
}

export const pagination = (page, limit, total) => ({ page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) });

// params must already be parsed by listQuery
export async function searchProfessionals(p) {
  const filter = buildFilter(p);
  const [data, total] = await Promise.all([
    Professional.find(filter).sort(SORTS[p.sort]).skip((p.page - 1) * p.limit).limit(p.limit).select('-__v').lean(),
    Professional.countDocuments(filter),
  ]);
  return { data, pagination: pagination(p.page, p.limit, total) };
}

// Values that exist in the directory; saved searches may only reference these.
export async function directoryOptions() {
  const rows = await Professional.find(ACTIVE).select('category categorySlug specializations services').lean();
  const categories = new Map();
  const specializations = new Set();
  const services = new Set();
  for (const r of rows) {
    categories.set(r.categorySlug, r.category);
    r.specializations.forEach((s) => specializations.add(s));
    r.services.forEach((s) => services.add(s));
  }
  return { categories, specializations, services };
}

// Cities in the directory with coordinates.
export async function directoryLocations() {
  return Professional.aggregate([
    { $match: { ...ACTIVE, 'coordinates.coordinates.1': { $exists: true } } },
    { $group: { _id: { city: '$city', state: '$state' }, lat: { $first: { $arrayElemAt: ['$coordinates.coordinates', 1] } }, lng: { $first: { $arrayElemAt: ['$coordinates.coordinates', 0] } }, count: { $sum: 1 } } },
    { $project: { _id: 0, city: '$_id.city', state: '$_id.state', label: { $concat: ['$_id.city', ', ', '$_id.state'] }, lat: 1, lng: 1, count: 1 } },
    { $sort: { label: 1 } },
  ]);
}

// Fields safe to show in lists of professionals (no contact details or descriptions).
export const PUBLIC_PROFESSIONAL_FIELDS = '_id fullName profileImage title category categorySlug location city state specializations yearsOfExperience averageRating reviewCount verificationStatus';
