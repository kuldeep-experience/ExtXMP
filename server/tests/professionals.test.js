import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/evp_pro_test';
process.env.JWT_SECRET = 'test-secret-test-secret';
const { default: app } = await import('../src/app.js');
const { connectDB } = await import('../src/config/db.js');
const { seed } = await import('../src/seed/index.js');
const { default: mongoose } = await import('mongoose');
const { default: Professional } = await import('../src/models/Professional.js');
const { default: Review } = await import('../src/models/Review.js');

const get = (url) => request(app).get(url);
let stats;

before(async () => { await connectDB();
  await Promise.all(Object.values(mongoose.models).map((m) => m.init())); stats = await seed(); });
after(async () => { await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });

test('seed creates enough data with valid references', async () => {
  const active = await Professional.countDocuments({ profileStatus: 'active' });
  assert.ok(active >= 30);
  assert.equal((await Professional.distinct('categorySlug')).length, 6);
  assert.ok(await Professional.countDocuments({ verificationStatus: 'unverified' }) > 0);
  const ids = new Set((await Professional.find().select('_id').lean()).map((p) => String(p._id)));
  const orphan = (await Review.find().select('professional').lean()).filter((r) => !ids.has(String(r.professional)));
  assert.equal(orphan.length, 0);
  assert.equal(await Review.countDocuments(), stats.reviews);
});

test('every active professional has 15-20 public reviews and a matching average', async () => {
  const pros = await Professional.find({ profileStatus: 'active' }).lean();
  for (const p of pros) {
    const rs = await Review.find({ professional: p._id, moderationStatus: 'approved', visibility: 'visible' }).lean();
    assert.ok(rs.length >= 15 && rs.length <= 20, `${p.fullName}: ${rs.length}`);
    assert.equal(p.reviewCount, rs.length);
    const avg = Math.round((rs.reduce((s, r) => s + r.rating, 0) / rs.length) * 10) / 10;
    assert.equal(p.averageRating, avg);
    assert.ok(p.averageRating >= 3 && p.averageRating <= 5);
  }
});

test('list: default shape and pagination', async () => {
  const res = await get('/api/professionals?limit=10');
  assert.equal(res.status, 200);
  assert.equal(res.body.data.length, 10);
  assert.equal(res.body.pagination.page, 1);
  assert.ok(res.body.pagination.total >= 30);
  const p2 = await get('/api/professionals?limit=10&page=2');
  const ids1 = res.body.data.map((d) => d._id);
  assert.ok(p2.body.data.every((d) => !ids1.includes(d._id)));
  const last = await get(`/api/professionals?limit=10&page=${res.body.pagination.totalPages}`);
  assert.ok(last.body.data.length >= 1);
});

test('list never exposes inactive or pending profiles', async () => {
  const all = await get('/api/professionals?limit=50');
  assert.ok(all.body.data.every((p) => p.profileStatus === 'active'));
  const hidden = await Professional.findOne({ profileStatus: { $ne: 'active' } });
  assert.equal((await get(`/api/professionals/${hidden._id}`)).status, 404);
});

test('search by name, title and specialization', async () => {
  const byName = await get('/api/professionals?q=mitchell');
  assert.equal(byName.body.data.length, 1);
  assert.equal(byName.body.data[0].fullName, 'Sarah Mitchell');
  const bySpec = await get('/api/professionals?q=plumbing&limit=50');
  assert.ok(bySpec.body.data.length > 0 && bySpec.body.data.every((p) => p.specializations.includes('Plumbing')));
  assert.equal((await get('/api/professionals?q=zzzznomatch')).body.pagination.total, 0);
});

test('search treats regex characters literally', async () => {
  const res = await get('/api/professionals?q=' + encodeURIComponent('.*'));
  assert.equal(res.status, 200);
  assert.equal(res.body.pagination.total, 0);
});

test('filter by category slug and name', async () => {
  const bySlug = await get('/api/professionals?category=legal-professionals&limit=50');
  assert.ok(bySlug.body.data.length >= 6 && bySlug.body.data.every((p) => p.categorySlug === 'legal-professionals'));
  const byName = await get('/api/professionals?category=' + encodeURIComponent('Legal Professionals') + '&limit=50');
  assert.equal(byName.body.pagination.total, bySlug.body.pagination.total);
});

test('filter by location (city and state)', async () => {
  const city = await get('/api/professionals?location=austin');
  assert.ok(city.body.data.length >= 1 && city.body.data.every((p) => p.city === 'Austin'));
  const state = await get('/api/professionals?location=TX&limit=50');
  assert.ok(state.body.data.length >= 3 && state.body.data.every((p) => p.state === 'TX'));
});

test('filter by rating, experience, verification and specialization', async () => {
  const rating = await get('/api/professionals?minRating=4.5&limit=50');
  assert.ok(rating.body.data.length > 0 && rating.body.data.every((p) => p.averageRating >= 4.5));
  const exp = await get('/api/professionals?minExperience=20&limit=50');
  assert.ok(exp.body.data.length > 0 && exp.body.data.every((p) => p.yearsOfExperience >= 20));
  const ver = await get('/api/professionals?verified=true&limit=50');
  assert.ok(ver.body.data.every((p) => p.verificationStatus === 'verified'));
  const spec = await get('/api/professionals?specialization=' + encodeURIComponent('Retirement Planning,Plumbing') + '&limit=50');
  assert.ok(spec.body.data.length > 0 && spec.body.data.every((p) => p.specializations.some((s) => ['Retirement Planning', 'Plumbing'].includes(s))));
});

test('filters combine with AND', async () => {
  const res = await get('/api/professionals?category=financial-advisors&minRating=4&minExperience=10&limit=50');
  assert.ok(res.body.data.every((p) => p.categorySlug === 'financial-advisors' && p.averageRating >= 4 && p.yearsOfExperience >= 10));
});

test('sorting by rating, reviews, experience and name', async () => {
  const sorted = async (sort, key, dir) => {
    const { body } = await get(`/api/professionals?sort=${sort}&limit=50`);
    const v = body.data.map((p) => p[key]);
    const expect = [...v].sort((a, b) => (dir === 'desc' ? (a < b ? 1 : a > b ? -1 : 0) : (a < b ? -1 : a > b ? 1 : 0)));
    assert.deepEqual(v, expect, sort);
  };
  await sorted('rating', 'averageRating', 'desc');
  await sorted('reviews', 'reviewCount', 'desc');
  await sorted('experience', 'yearsOfExperience', 'desc');
  await sorted('name', 'fullName', 'asc');
});

test('invalid query parameters return 400', async () => {
  assert.equal((await get('/api/professionals?sort=bogus')).status, 400);
  assert.equal((await get('/api/professionals?page=0')).status, 400);
  assert.equal((await get('/api/professionals?limit=500')).status, 400);
  assert.equal((await get('/api/professionals?minRating=9')).status, 400);
});

test('categories endpoint', async () => {
  const res = await get('/api/professionals/categories');
  assert.equal(res.status, 200);
  assert.equal(res.body.data.length, 6);
  for (const c of res.body.data) {
    assert.ok(c.slug && c.name && c.count >= 6 && c.specializations.length >= 3);
  }
  assert.equal(res.body.data.reduce((s, c) => s + c.count, 0), (await get('/api/professionals?limit=1')).body.pagination.total);
});

test('detail endpoint', async () => {
  const { body } = await get('/api/professionals?q=mitchell');
  const res = await get(`/api/professionals/${body.data[0]._id}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.data.fullName, 'Sarah Mitchell');
  assert.ok(res.body.data.services.length && res.body.data.qualifications.length);
  assert.equal(res.body.data.password, undefined);
  assert.equal((await get('/api/professionals/not-an-id')).status, 400);
  assert.equal((await get(`/api/professionals/${new mongoose.Types.ObjectId()}`)).status, 404);
});

test('reviews endpoint: only public reviews, summary, sorting, pagination', async () => {
  const pro = await Professional.findOne({ profileStatus: 'active' }).lean();
  const res = await get(`/api/professionals/${pro._id}/reviews?limit=5`);
  assert.equal(res.status, 200);
  assert.equal(res.body.data.length, 5);
  assert.equal(res.body.pagination.total, pro.reviewCount);
  assert.equal(res.body.summary.count, pro.reviewCount);
  assert.equal(res.body.summary.average, pro.averageRating);
  assert.equal(Object.values(res.body.summary.distribution).reduce((a, b) => a + b, 0), pro.reviewCount);
  assert.ok(res.body.data.every((r) => String(r.professional) === String(pro._id) && r.moderationStatus === undefined));

  const hiddenIds = (await Review.find({ professional: pro._id, $or: [{ moderationStatus: { $ne: 'approved' } }, { visibility: 'hidden' }] }).lean()).map((r) => String(r._id));
  const all = await get(`/api/professionals/${pro._id}/reviews?limit=50`);
  assert.ok(all.body.data.every((r) => !hiddenIds.includes(String(r._id))));

  const dates = all.body.data.map((r) => +new Date(r.reviewDate));
  assert.deepEqual(dates, [...dates].sort((a, b) => b - a));
  const high = (await get(`/api/professionals/${pro._id}/reviews?sort=highest&limit=50`)).body.data.map((r) => r.rating);
  assert.deepEqual(high, [...high].sort((a, b) => b - a));
  const fives = await get(`/api/professionals/${pro._id}/reviews?rating=5&limit=50`);
  assert.ok(fives.body.data.every((r) => r.rating === 5));
  assert.equal((await get(`/api/professionals/${pro._id}/reviews?sort=x`)).status, 400);
});
