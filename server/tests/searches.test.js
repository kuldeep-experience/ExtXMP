import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/evp_search_test';
process.env.JWT_SECRET = 'test-secret-test-secret';
process.env.BCRYPT_ROUNDS = '4';
process.env.SENSITIVE_RATE_LIMIT_MAX = '1000';
process.env.LOGIN_RATE_LIMIT_MAX = '1000';
const { default: app } = await import('../src/app.js');
const { connectDB } = await import('../src/config/db.js');
const { seed } = await import('../src/seed/index.js');
const { DEMO_PASSWORD, demoVisitors } = await import('../src/seed/visitors.js');
const { default: mongoose } = await import('mongoose');
const { default: Visitor } = await import('../src/models/Visitor.js');
const { default: SavedSearch } = await import('../src/models/SavedSearch.js');

async function login(email) {
  const agent = request.agent(app);
  const { body } = await agent.get('/api/auth/csrf');
  const h = { 'x-csrf-token': body.csrfToken };
  assert.equal((await agent.post('/api/auth/login').set(h).send({ email, password: DEMO_PASSWORD })).status, 200);
  return { get: (u) => agent.get(u), post: (u, b = {}) => agent.post(u).set(h).send(b), patch: (u, b = {}) => agent.patch(u).set(h).send(b), del: (u) => agent.delete(u).set(h) };
}
const fresh = async (email) => {
  const { default: bcrypt } = await import('bcrypt');
  await Visitor.create({ firstName: 'T', lastName: 'U', email, passwordHash: await bcrypt.hash(DEMO_PASSWORD, 4), emailVerified: true });
  return login(email);
};
const qs = (o) => new URLSearchParams(Object.entries(o).map(([k, v]) => [k, String(v)])).toString();
const directory = async (query, extra = {}) => (await request(app).get(`/api/professionals?${qs({ ...query, limit: 50, ...extra })}`)).body;
const NYC = { latitude: 40.7128, longitude: -74.006 };

before(async () => { await connectDB();
  await Promise.all(Object.values(mongoose.models).map((m) => m.init())); await seed(); });
after(async () => { await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });

// ---------- directory extensions used by saved searches ----------
test('directory: services filter, distance filter and locations list', async () => {
  const withSvc = await directory({ services: 'Free Estimates,Policy Review' });
  assert.ok(withSvc.data.length > 0 && withSvc.data.every((p) => p.services.some((s) => ['Free Estimates', 'Policy Review'].includes(s))));
  const near = await directory({ lat: 40.7128, lng: -74.006, maxDistanceKm: 25 });
  const cities = near.data.map((p) => p.city).sort();
  assert.deepEqual(cities, ['New York', 'Newark']); // Newark is ~14 km from New York
  assert.deepEqual((await directory({ lat: 40.7128, lng: -74.006, maxDistanceKm: 5 })).data.map((p) => p.city), ['New York']);
  assert.ok((await directory({ lat: 40.7128, lng: -74.006, maxDistanceKm: 500, category: 'legal-professionals' })).data.every((p) => p.categorySlug === 'legal-professionals'));
  const bad = await request(app).get('/api/professionals?lat=40&lng=-74'); // incomplete geo filter
  assert.equal(bad.status, 400);
  assert.equal((await request(app).get('/api/professionals?lat=95&lng=0&maxDistanceKm=5')).status, 400);
  const locs = (await request(app).get('/api/professionals/locations')).body.data;
  assert.equal(locs.length, 36);
  assert.ok(locs.every((l) => l.label && l.lat && l.lng));
  const cats = (await request(app).get('/api/professionals/categories')).body.data;
  assert.ok(cats.every((c) => c.services.length >= 5));
});

// ---------- seed ----------
test('seed: 5+ valid searches per demo visitor with varied criteria, each runnable with matches', async () => {
  const visitors = await Visitor.find({ email: { $in: demoVisitors.map((v) => v.email) } }).lean();
  const all = [];
  for (const v of visitors) {
    const rows = await SavedSearch.find({ visitor: v._id }).lean();
    assert.ok(rows.length >= 5, `${v.email}: ${rows.length}`);
    assert.equal(new Set(rows.map((r) => r.nameKey)).size, rows.length);
    all.push(...rows);
  }
  assert.ok(new Set(all.map((s) => s.category).filter(Boolean)).size >= 4);
  assert.ok(new Set(all.map((s) => s.location).filter(Boolean)).size >= 8);
  assert.ok(new Set(all.map((s) => s.minRating).filter((x) => x != null)).size >= 3);
  assert.ok(all.some((s) => s.radiusKm) && all.some((s) => s.maxDistanceKm));
  assert.ok(all.some((s) => s.serviceRequirements.length) && all.some((s) => s.specializations.length));
  assert.ok(all.some((s) => s.lastUsedAt === null) && all.some((s) => s.lastUsedAt));
  // every one is accepted by the real directory API and finds somebody
  const { toDirectoryQuery } = await import('../src/lib/savedSearchQuery.js');
  for (const s of all) {
    const res = await directory(toDirectoryQuery(s));
    assert.equal(res.success, true, s.name);
    assert.ok(res.pagination.total >= 1, `${s.name} matched nobody`);
  }
});

// ---------- access control ----------
test('every endpoint requires authentication and a CSRF token', async () => {
  const anon = request.agent(app);
  const { body } = await anon.get('/api/auth/csrf');
  const h = { 'x-csrf-token': body.csrfToken };
  const id = new mongoose.Types.ObjectId();
  const calls = [anon.get('/api/saved-searches'), anon.post('/api/saved-searches').set(h).send({}), anon.get(`/api/saved-searches/${id}`),
    anon.patch(`/api/saved-searches/${id}`).set(h).send({}), anon.delete(`/api/saved-searches/${id}`).set(h), anon.post(`/api/saved-searches/${id}/run`).set(h)];
  for (const r of await Promise.all(calls)) assert.equal(r.status, 401);
  const me = await fresh('csrf@example.com');
  const raw = request.agent(app);
  await raw.get('/api/auth/csrf');
  assert.equal((await raw.post('/api/saved-searches').send({ name: 'x' })).status, 403);
  assert.ok(me);
});

// ---------- create ----------
test('create: saves criteria, names them, returns the directory query', async () => {
  const me = await fresh('create1@example.com');
  const res = await me.post('/api/saved-searches', { name: ' Top real estate agents ', category: 'real-estate-agents', location: 'Austin', minRating: 4.5, specializations: ['First-Time Buyers'], serviceRequirements: ['Buyer Representation'], additionalFilters: { minExperience: 5, verifiedOnly: true, sort: 'reviews', keyword: 'sarah' } });
  assert.equal(res.status, 201);
  const s = res.body.data;
  assert.equal(s.name, 'Top real estate agents');
  assert.equal(s.categoryName, 'Real Estate Agents');
  assert.equal(s.lastUsedAt, null);
  assert.equal(s.nameKey, undefined);
  assert.deepEqual(s.query, { category: 'real-estate-agents', location: 'Austin', minRating: 4.5, specialization: 'First-Time Buyers', services: 'Buyer Representation', q: 'sarah', minExperience: 5, verified: 'true', sort: 'reviews' });

  const geo = await me.post('/api/saved-searches', { name: 'Advisors within 10 km', category: 'financial-advisors', location: 'New York, NY', ...NYC, radiusKm: 10, maxDistanceKm: 25 });
  assert.equal(geo.status, 201);
  assert.equal(geo.body.data.query.maxDistanceKm, 10); // the stricter distance wins
  assert.equal(geo.body.data.query.location, undefined); // text location is only a label for the point
});

test('create: rejects invalid criteria', async () => {
  const me = await fresh('create2@example.com');
  const ok = { name: 'x', minRating: 4 };
  const cases = [
    [{ name: '', minRating: 4 }, 'name'], [{ minRating: 4 }, 'name'],
    [{ ...ok, category: 'astrologers' }, 'category'],
    [{ ...ok, specializations: ['Nope'] }, 'specializations'],
    [{ ...ok, serviceRequirements: ['Nope'] }, 'serviceRequirements'],
    [{ ...ok, maxDistanceKm: 10 }, 'maxDistanceKm'], // distance without coordinates
    [{ ...ok, latitude: 40 }, 'latitude'], // half a coordinate
    [{ ...ok, ...NYC, radiusKm: 0 }, 'radiusKm'], [{ ...ok, ...NYC, maxDistanceKm: 501 }, 'maxDistanceKm'],
    [{ ...ok, minRating: 6 }, 'minRating'], [{ ...ok, latitude: 91, longitude: 0 }, 'latitude'],
    [{ ...ok, additionalFilters: { sort: 'bogus' } }, 'additionalFilters'],
    [{ ...ok, visitor: String(new mongoose.Types.ObjectId()) }, '_form'], [{ ...ok, lastUsedAt: '2020-01-01' }, '_form'],
    [{ name: 'empty' }, '_form'], // no criteria at all
    [{ name: 'only sort', additionalFilters: { sort: 'name' } }, '_form'],
  ];
  for (const [body, field] of cases) {
    const r = await me.post('/api/saved-searches', body);
    assert.equal(r.status, 400, JSON.stringify(body));
    assert.ok(r.body.details && (field in r.body.details), `${JSON.stringify(body)} -> ${JSON.stringify(r.body.details)}`);
  }
  assert.equal((await me.get('/api/saved-searches')).body.data.length, 0);
});

test('create: duplicate names (any case) and the per-visitor limit', async () => {
  const me = await fresh('create3@example.com');
  assert.equal((await me.post('/api/saved-searches', { name: 'Same', minRating: 4 })).status, 201);
  assert.equal((await me.post('/api/saved-searches', { name: 'SAME', minRating: 3 })).status, 409);
  const v = await Visitor.findOne({ email: 'create3@example.com' });
  await SavedSearch.insertMany(Array.from({ length: 49 }, (_, i) => ({ visitor: v._id, name: `bulk ${i}`, nameKey: `bulk ${i}`, minRating: 3 })));
  assert.equal((await me.post('/api/saved-searches', { name: 'one too many', minRating: 3 })).status, 400);
});

// ---------- read / edit / delete ----------
test('get, edit (merged validation) and delete', async () => {
  const me = await fresh('edit1@example.com');
  const s = (await me.post('/api/saved-searches', { name: 'Original', category: 'legal-professionals', location: 'New York, NY', ...NYC, maxDistanceKm: 20, minRating: 4 })).body.data;
  const url = `/api/saved-searches/${s._id}`;
  assert.equal((await me.get(url)).body.data.name, 'Original');

  const edited = await me.patch(url, { name: 'Renamed', minRating: 3.5, serviceRequirements: ['Contract Review'], additionalFilters: { verifiedOnly: true } });
  assert.equal(edited.status, 200);
  assert.equal(edited.body.data.name, 'Renamed');
  assert.equal(edited.body.data.minRating, 3.5);
  assert.equal(edited.body.data.category, 'legal-professionals'); // untouched
  assert.equal(edited.body.data.additionalFilters.verifiedOnly, true);
  assert.equal(edited.body.data.additionalFilters.sort, 'rating'); // merged, not replaced
  assert.equal(edited.body.data.lastUsedAt, null); // editing is not running
  assert.equal(edited.body.data.query.services, 'Contract Review');

  assert.equal((await me.patch(url, { minRating: null, category: null })).body.data.query.category, undefined); // clear fields
  assert.equal((await me.patch(url, { latitude: null, longitude: null })).status, 400); // would leave a distance without a point
  assert.equal((await me.patch(url, { latitude: null, longitude: null, maxDistanceKm: null })).status, 200); // location text remains
  assert.equal((await me.patch(url, { maxDistanceKm: 10 })).status, 400);
  assert.equal((await me.patch(url, { category: 'nope' })).status, 400);
  assert.equal((await me.patch(url, {})).status, 400);
  assert.equal((await me.patch(url, { visitor: 'x' })).status, 400);
  assert.equal((await me.patch(url, { nameKey: 'x' })).status, 400);
  // a rejected edit leaves the saved search as it was
  assert.equal((await me.get(url)).body.data.name, 'Renamed');

  const other = (await me.post('/api/saved-searches', { name: 'Other', minRating: 4 })).body.data;
  assert.equal((await me.patch(`/api/saved-searches/${other._id}`, { name: 'renamed' })).status, 409);

  assert.equal((await me.del(url)).status, 200);
  assert.equal((await me.del(url)).status, 404);
  assert.equal((await me.get(url)).status, 404);
  assert.equal((await me.get('/api/saved-searches/not-an-id')).status, 400);
});

// ---------- run ----------
test('run: results equal the directory API for the restored filters, and last-used is tracked', async () => {
  const me = await fresh('run1@example.com');
  const defs = [
    { name: 'a', category: 'real-estate-agents', location: 'TX', minRating: 3.5 },
    { name: 'b', category: 'legal-professionals', location: 'New York, NY', ...NYC, radiusKm: 30 },
    { name: 'c', ...NYC, location: 'New York, NY', maxDistanceKm: 25, minRating: 3 },
    { name: 'd', specializations: ['Plumbing', 'Retirement Planning'], additionalFilters: { sort: 'name' } },
    { name: 'e', serviceRequirements: ['Free Estimates'], additionalFilters: { verifiedOnly: true, minExperience: 5, sort: 'experience' } },
    { name: 'f', minRating: 4.5, additionalFilters: { keyword: 'an', sort: 'reviews' } },
  ];
  for (const d of defs) {
    const s = (await me.post('/api/saved-searches', d)).body.data;
    assert.equal(s.lastUsedAt, null);
    const before = Date.now();
    const run = await me.post(`/api/saved-searches/${s._id}/run?limit=50`);
    assert.equal(run.status, 200, d.name);
    const direct = await directory(run.body.query);
    assert.deepEqual(run.body.results.data.map((p) => p._id), direct.data.map((p) => p._id), d.name);
    assert.equal(run.body.results.pagination.total, direct.pagination.total);
    assert.ok(run.body.results.pagination.total > 0, d.name);
    assert.ok(+new Date(run.body.data.lastUsedAt) >= before - 1000);
    assert.equal((await me.get(`/api/saved-searches/${s._id}`)).body.data.lastUsedAt, run.body.data.lastUsedAt);
  }
  // spot checks that the filters really applied
  const geo = (await me.post('/api/saved-searches', { name: 'geo', ...NYC, maxDistanceKm: 5 })).body.data;
  const r = await me.post(`/api/saved-searches/${geo._id}/run`);
  assert.deepEqual(r.body.results.data.map((p) => p.city), ['New York']);
  const paged = await me.post(`/api/saved-searches/${geo._id}/run?limit=1&page=1`);
  assert.equal(paged.body.results.data.length, 1);
  assert.equal((await me.post(`/api/saved-searches/${geo._id}/run?limit=500`)).status, 400);
  assert.equal((await me.post(`/api/saved-searches/${new mongoose.Types.ObjectId()}/run`)).status, 404);
});

// ---------- list ----------
test('list: sort by recently used / created, search and pagination', async () => {
  const me = await fresh('list1@example.com');
  const v = await Visitor.findOne({ email: 'list1@example.com' });
  const d = (days) => new Date(Date.now() - days * 86400000);
  await SavedSearch.insertMany([
    { visitor: v._id, name: 'Old but used today', nameKey: 'old but used today', minRating: 3, createdAt: d(30), lastUsedAt: d(0) },
    { visitor: v._id, name: 'New never used', nameKey: 'new never used', category: 'legal-professionals', createdAt: d(1), lastUsedAt: null },
    { visitor: v._id, name: 'Middle used', nameKey: 'middle used', location: 'Austin', createdAt: d(10), lastUsedAt: d(5) },
  ]);
  const names = async (q) => (await me.get(`/api/saved-searches?${q}`)).body.data.map((s) => s.name);
  assert.deepEqual(await names(''), ['Old but used today', 'Middle used', 'New never used']); // default: recently used, unused last
  assert.deepEqual(await names('sort=used'), ['Old but used today', 'Middle used', 'New never used']);
  assert.deepEqual(await names('sort=created'), ['New never used', 'Middle used', 'Old but used today']);
  assert.deepEqual(await names('q=austin'), ['Middle used']);
  assert.deepEqual(await names('q=legal'), ['New never used']); // matches the category name
  assert.deepEqual(await names('q=NEVER'), ['New never used']);
  assert.deepEqual(await names('q=.*'), []);
  const page = await me.get('/api/saved-searches?limit=2&page=2');
  assert.equal(page.body.data.length, 1);
  assert.equal(page.body.pagination.total, 3);
  assert.equal((await me.get('/api/saved-searches?sort=bad')).status, 400);
});

// ---------- ownership ----------
test('ownership: another visitor cannot read, change, delete or run my searches', async () => {
  const alice = await fresh('alice2@example.com');
  const bob = await fresh('bob2@example.com');
  const s = (await alice.post('/api/saved-searches', { name: 'Private', minRating: 4 })).body.data;
  const url = `/api/saved-searches/${s._id}`;
  assert.equal((await bob.get(url)).status, 404);
  assert.equal((await bob.patch(url, { name: 'Hacked' })).status, 404);
  assert.equal((await bob.del(url)).status, 404);
  assert.equal((await bob.post(`${url}/run`)).status, 404);
  assert.equal((await bob.get('/api/saved-searches')).body.data.length, 0);
  assert.equal((await bob.get('/api/saved-searches?q=private')).body.data.length, 0);
  const mine = (await alice.get(url)).body.data;
  assert.equal(mine.name, 'Private');
  assert.equal(mine.lastUsedAt, null); // bob's attempted run changed nothing
  assert.equal((await bob.post('/api/saved-searches', { name: 'Private', minRating: 4 })).status, 201); // names are per visitor
});

test('seeded demo account sees its own searches', async () => {
  const emma = await login('emma.carter@example.com');
  const r = await emma.get('/api/saved-searches?limit=50');
  assert.ok(r.body.pagination.total >= 5);
  const first = r.body.data[0];
  const run = await emma.post(`/api/saved-searches/${first._id}/run`);
  assert.equal(run.status, 200);
  assert.ok(run.body.results.pagination.total >= 1);
});
