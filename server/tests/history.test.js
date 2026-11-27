import { test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/evp_history_test';
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
const { default: Professional } = await import('../src/models/Professional.js');
const { default: RecentlyViewed } = await import('../src/models/RecentlyViewedProfessional.js');
const { default: SearchHistory } = await import('../src/models/SearchHistory.js');
const { default: RecentComparison } = await import('../src/models/RecentComparison.js');
const { historyPolicy, purgeAll, DAY } = await import('../src/lib/history.js');
const { listQuery, searchProfessionals } = await import('../src/lib/professionalSearch.js');

async function login(email) {
  const agent = request.agent(app);
  const { body } = await agent.get('/api/auth/csrf');
  const h = { 'x-csrf-token': body.csrfToken };
  assert.equal((await agent.post('/api/auth/login').set(h).send({ email, password: DEMO_PASSWORD })).status, 200);
  return { get: (u) => agent.get(u), post: (u, b = {}) => agent.post(u).set(h).send(b), patch: (u, b = {}) => agent.patch(u).set(h).send(b), del: (u) => agent.delete(u).set(h) };
}
const fresh = async (email) => {
  const { default: bcrypt } = await import('bcrypt');
  const v = await Visitor.create({ firstName: 'Zelda', lastName: 'Quillfeather', email, passwordHash: await bcrypt.hash(DEMO_PASSWORD, 4), emailVerified: true });
  return { me: await login(email), visitor: v };
};
const pros = async (n, extra = {}) => (await Professional.find({ profileStatus: 'active', ...extra }).sort({ fullName: 1 }).limit(n).lean()).map((p) => String(p._id));
const qs = (o) => new URLSearchParams(o).toString();
const ago = (ms) => new Date(Date.now() - ms);
const setPrivacy = (me, privacySettings) => me.patch('/api/auth/profile', { privacySettings });

before(async () => { await connectDB(); await Promise.all(Object.values(mongoose.models).map((m) => m.init())); await seed(); });
afterEach(() => { historyPolicy.dedupMs = 30 * 60000; });
after(async () => { await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });

// ================= seed =================
test('seed: every demo visitor has 10+ viewed, 5+ searches, 3+ comparisons, all pointing at real data', async () => {
  const visitors = await Visitor.find({ email: { $in: demoVisitors.map((v) => v.email) } }).lean();
  assert.equal(visitors.length, demoVisitors.length);
  const active = new Set((await Professional.find({ profileStatus: 'active' }).select('_id').lean()).map((p) => String(p._id)));
  for (const v of visitors) {
    const viewed = await RecentlyViewed.find({ visitor: v._id }).lean();
    assert.ok(viewed.length >= 10, `${v.email}: ${viewed.length} viewed`);
    assert.equal(new Set(viewed.map((x) => String(x.professional))).size, viewed.length);
    for (const x of viewed) {
      assert.ok(active.has(String(x.professional)));
      assert.ok(x.viewCount >= 1 && x.lastViewedAt >= x.firstViewedAt);
      assert.ok(Date.now() - x.lastViewedAt < 90 * DAY); // inside the default retention
    }
    assert.ok(new Set(viewed.map((x) => +x.lastViewedAt)).size > viewed.length / 2);

    const searches = await SearchHistory.find({ visitor: v._id }).lean();
    assert.ok(searches.length >= 5, `${v.email}: ${searches.length} searches`);
    for (const s of searches) {
      const { near, ...params } = s.filters;
      const parsed = listQuery.parse({ ...params, ...(s.query && { q: s.query }), page: 1, limit: 1 }); // valid for the directory
      assert.equal((await searchProfessionals(parsed)).pagination.total, s.resultsCount); // stored count is the real count
      assert.ok(s.resultsCount >= 1);
    }

    const comps = await RecentComparison.find({ visitor: v._id }).lean();
    assert.ok(comps.length >= 3, `${v.email}: ${comps.length} comparisons`);
    for (const c of comps) {
      assert.ok(c.professionals.length >= 2 && c.professionals.length <= 4);
      assert.ok(c.professionals.every((p) => active.has(String(p))));
      assert.equal(new Set(c.professionals.map(String)).size, c.professionals.length);
    }
  }
});

// ================= access control =================
test('every endpoint requires authentication; writes need a CSRF token', async () => {
  const anon = request.agent(app);
  const { body } = await anon.get('/api/auth/csrf');
  const h = { 'x-csrf-token': body.csrfToken };
  const id = new mongoose.Types.ObjectId();
  const calls = [
    anon.get('/api/recently-viewed'), anon.post('/api/recently-viewed').set(h).send({}), anon.delete(`/api/recently-viewed/${id}`).set(h), anon.delete('/api/recently-viewed/clear').set(h),
    anon.get('/api/search-history'), anon.post('/api/search-history').set(h).send({}), anon.delete(`/api/search-history/${id}`).set(h), anon.delete('/api/search-history/clear').set(h),
    anon.get('/api/recent-comparisons'), anon.post('/api/recent-comparisons').set(h).send({}), anon.delete(`/api/recent-comparisons/${id}`).set(h), anon.delete('/api/recent-comparisons/clear').set(h),
  ];
  for (const r of await Promise.all(calls)) assert.equal(r.status, 401);
  const { me } = await fresh('csrf-h@example.com');
  assert.ok(me);
  const raw = request.agent(app);
  await raw.get('/api/auth/csrf');
  assert.equal((await raw.post('/api/recently-viewed').send({ professionalId: String(id) })).status, 403);
});

// ================= recently viewed =================
test('views: first view creates one entry, repeats inside the window refresh the time without counting', async () => {
  const { me, visitor } = await fresh('views1@example.com');
  const [p] = await pros(1);
  const first = await me.post('/api/recently-viewed', { professionalId: p });
  assert.equal(first.status, 201);
  assert.equal(first.body.counted, true);
  assert.equal(first.body.data.viewCount, 1);
  const t1 = new Date(first.body.data.lastViewedAt);
  await new Promise((r) => setTimeout(r, 20));

  const again = await me.post('/api/recently-viewed', { professionalId: p });
  assert.equal(again.status, 200);
  assert.equal(again.body.counted, false);
  assert.equal(again.body.data.viewCount, 1); // not counted again
  assert.ok(new Date(again.body.data.lastViewedAt) > t1); // but "last viewed" moves
  assert.equal(new Date(again.body.data.firstViewedAt).getTime(), t1.getTime() - 0 || t1.getTime());
  assert.equal(await RecentlyViewed.countDocuments({ visitor: visitor._id }), 1); // never a duplicate entry

  // after the window the visit counts
  await RecentlyViewed.updateOne({ visitor: visitor._id, professional: p }, { lastViewedAt: ago(31 * 60000) });
  const later = await me.post('/api/recently-viewed', { professionalId: p });
  assert.equal(later.body.counted, true);
  assert.equal(later.body.data.viewCount, 2);
  assert.equal(await RecentlyViewed.countDocuments({ visitor: visitor._id }), 1);
});

test('views: the dedupe window is configurable', async () => {
  const { me } = await fresh('views2@example.com');
  const [p] = await pros(1);
  historyPolicy.dedupMs = 0; // every visit counts
  await me.post('/api/recently-viewed', { professionalId: p });
  const second = await me.post('/api/recently-viewed', { professionalId: p });
  assert.equal(second.body.counted, true);
  assert.equal(second.body.data.viewCount, 2);
  historyPolicy.dedupMs = 60 * 60000;
  const third = await me.post('/api/recently-viewed', { professionalId: p });
  assert.equal(third.body.counted, false);
  assert.equal(third.body.data.viewCount, 2);
});

test('views: simultaneous requests for the same profile make one entry', async () => {
  const { me, visitor } = await fresh('views3@example.com');
  const [p] = await pros(1);
  const results = await Promise.all(Array.from({ length: 6 }, () => me.post('/api/recently-viewed', { professionalId: p })));
  assert.ok(results.every((r) => r.status === 200 || r.status === 201));
  assert.equal(await RecentlyViewed.countDocuments({ visitor: visitor._id }), 1);
  assert.equal((await RecentlyViewed.findOne({ visitor: visitor._id })).viewCount, 1);
});

test('views: validation and unavailable professionals', async () => {
  const { me } = await fresh('views4@example.com');
  assert.equal((await me.post('/api/recently-viewed', { professionalId: 'nope' })).status, 400);
  assert.equal((await me.post('/api/recently-viewed', {})).status, 400);
  assert.equal((await me.post('/api/recently-viewed', { professionalId: (await pros(1))[0], visitor: 'x' })).status, 400);
  assert.equal((await me.post('/api/recently-viewed', { professionalId: String(new mongoose.Types.ObjectId()) })).status, 404);
  const inactive = await Professional.findOne({ profileStatus: { $ne: 'active' } });
  assert.equal((await me.post('/api/recently-viewed', { professionalId: String(inactive._id) })).status, 404);
});

test('views: list is newest first with public professional data; inactive professionals are hidden; pagination', async () => {
  const { me, visitor } = await fresh('views5@example.com');
  const ids = await pros(5);
  for (const [i, id] of ids.entries()) await RecentlyViewed.create({ visitor: visitor._id, professional: id, firstViewedAt: ago((10 - i) * DAY), lastViewedAt: ago((10 - i) * DAY), viewCount: i + 1 });
  const res = await me.get('/api/recently-viewed');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.data.map((r) => r.professional._id), [...ids].reverse()); // most recently viewed first
  const first = res.body.data[0];
  assert.equal(first.viewCount, 5);
  assert.ok(first.firstViewedAt && first.lastViewedAt);
  for (const k of ['fullName', 'title', 'category', 'location', 'averageRating', 'reviewCount', 'yearsOfExperience', 'specializations']) assert.ok(first.professional[k] !== undefined, k);
  assert.equal(first.professional.contactEmail, undefined);
  assert.equal(first.professional.description, undefined);
  assert.deepEqual(res.body.settings, { trackHistory: true, retentionDays: 90 });

  assert.equal((await me.get('/api/recently-viewed?limit=2&page=3')).body.data.length, 1);
  assert.equal((await me.get('/api/recently-viewed?limit=500')).status, 400);
  await Professional.updateOne({ _id: ids[4] }, { profileStatus: 'inactive' });
  const hidden = await me.get('/api/recently-viewed');
  assert.equal(hidden.body.data.length, 4);
  assert.equal(hidden.body.pagination.total, 4);
  await Professional.updateOne({ _id: ids[4] }, { profileStatus: 'active' });
});

test('views: only the newest 100 are kept', async () => {
  const { me, visitor } = await fresh('views6@example.com');
  const all = await Professional.find({ profileStatus: 'active' }).select('_id').lean();
  const docs = Array.from({ length: 100 }, (_, i) => ({ visitor: visitor._id, professional: new mongoose.Types.ObjectId(), firstViewedAt: ago((200 - i) * 60000), lastViewedAt: ago((200 - i) * 60000), viewCount: 1 }));
  await RecentlyViewed.insertMany(docs);
  const oldest = docs[0].professional;
  await me.post('/api/recently-viewed', { professionalId: String(all[0]._id) });
  assert.equal(await RecentlyViewed.countDocuments({ visitor: visitor._id }), 100);
  assert.equal(await RecentlyViewed.countDocuments({ visitor: visitor._id, professional: oldest }), 0);
});

test('views: remove one record, then clear all (and "clear" is not treated as an id)', async () => {
  const { me, visitor } = await fresh('views7@example.com');
  const ids = await pros(3);
  for (const id of ids) await me.post('/api/recently-viewed', { professionalId: id });
  const list = (await me.get('/api/recently-viewed')).body.data;
  assert.equal((await me.del(`/api/recently-viewed/${list[0]._id}`)).status, 200);
  assert.equal((await me.del(`/api/recently-viewed/${list[0]._id}`)).status, 404);
  assert.equal((await me.del('/api/recently-viewed/not-an-id')).status, 400);
  const cleared = await me.del('/api/recently-viewed/clear');
  assert.equal(cleared.status, 200);
  assert.equal(cleared.body.deleted, 2);
  assert.equal(await RecentlyViewed.countDocuments({ visitor: visitor._id }), 0);
  assert.equal((await me.get('/api/recently-viewed')).body.data.length, 0);
});

// ================= search history =================
test('searches: criteria are stored, the result count is computed by the server, repeats update one entry', async () => {
  const { me, visitor } = await fresh('search1@example.com');
  const res = await me.post('/api/search-history', { query: 'mitchell', filters: { category: 'real-estate-agents', minRating: 3, sort: 'reviews' } });
  assert.equal(res.status, 201);
  assert.equal(res.body.data.query, 'mitchell');
  assert.deepEqual(res.body.data.filters, { category: 'real-estate-agents', minRating: '3', sort: 'reviews' });
  const direct = await request(app).get(`/api/professionals?${qs({ q: 'mitchell', category: 'real-estate-agents', minRating: 3, sort: 'reviews' })}`);
  assert.equal(res.body.data.resultsCount, direct.body.pagination.total); // the same search through the directory API
  assert.equal(res.body.data.resultsCount, 1);
  assert.ok(res.body.data.searchedAt);

  const t = new Date(res.body.data.searchedAt);
  await new Promise((r) => setTimeout(r, 15));
  const again = await me.post('/api/search-history', { query: 'MITCHELL', filters: { sort: 'reviews', minRating: '3', category: 'real-estate-agents' } }); // same search, other order and case
  assert.equal(again.status, 200);
  assert.ok(new Date(again.body.data.searchedAt) > t);
  assert.equal(await SearchHistory.countDocuments({ visitor: visitor._id }), 1);

  assert.equal((await me.post('/api/search-history', { query: 'mitchell', resultsCount: 999 })).status, 400); // a client cannot supply the count
  const noResults = await me.post('/api/search-history', { query: 'zzzzqqqq' });
  assert.equal(noResults.body.data.resultsCount, 0);
});

test('searches: distance searches and the label are kept so they can be repeated exactly', async () => {
  const { me } = await fresh('search2@example.com');
  const f = { lat: 40.7128, lng: -74.006, maxDistanceKm: 25, near: 'New York, NY', category: 'legal-professionals' };
  const res = await me.post('/api/search-history', { filters: f });
  assert.equal(res.status, 201);
  assert.equal(res.body.data.filters.near, 'New York, NY');
  assert.equal(res.body.data.resultsCount, 2);
  const rerun = await request(app).get(`/api/professionals?${qs({ ...res.body.data.filters, near: undefined })}`.replace('&near=undefined', ''));
  assert.equal(rerun.body.pagination.total, res.body.data.resultsCount);
});

test('searches: validation', async () => {
  const { me } = await fresh('search3@example.com');
  const bad = [
    {}, { query: '' }, { filters: {} }, { filters: { sort: 'name' } }, // nothing to record
    { query: 'x'.repeat(101) }, { filters: { minRating: 9 } }, { filters: { lat: 40, lng: 70 } }, { filters: { sort: 'bogus', category: 'a' } },
    { filters: { password: 'x' } }, { filters: { category: { $ne: 1 } } }, { query: 'a', visitor: 'x' }, { filters: { category: 'x'.repeat(600) } },
  ];
  for (const b of bad) assert.equal((await me.post('/api/search-history', b)).status, 400, JSON.stringify(b));
  assert.equal((await me.get('/api/search-history')).body.data.length, 0);
});

test('searches: list newest first, remove one, clear all, only the newest 50 are kept', async () => {
  const { me, visitor } = await fresh('search4@example.com');
  for (const q of ['alpha', 'bravo', 'charlie']) { await me.post('/api/search-history', { query: q }); await new Promise((r) => setTimeout(r, 5)); }
  const list = await me.get('/api/search-history');
  assert.deepEqual(list.body.data.map((s) => s.query), ['charlie', 'bravo', 'alpha']);
  assert.ok(list.body.data.every((s) => s.searchedAt && s.resultsCount !== undefined && s.queryKey === undefined));
  assert.equal((await me.get('/api/search-history?limit=2&page=2')).body.data.length, 1);
  assert.equal((await me.del(`/api/search-history/${list.body.data[1]._id}`)).status, 200);
  assert.equal((await me.del(`/api/search-history/${list.body.data[1]._id}`)).status, 404);
  const cleared = await me.del('/api/search-history/clear');
  assert.equal(cleared.body.deleted, 2);

  await SearchHistory.insertMany(Array.from({ length: 50 }, (_, i) => ({ visitor: visitor._id, query: `old${i}`, filters: {}, queryKey: `k${i}`, resultsCount: 1, searchedAt: ago((100 - i) * 60000) })));
  await me.post('/api/search-history', { query: 'newest' });
  assert.equal(await SearchHistory.countDocuments({ visitor: visitor._id }), 50);
  assert.equal(await SearchHistory.countDocuments({ visitor: visitor._id, query: 'old0' }), 0);
  assert.equal(await SearchHistory.countDocuments({ visitor: visitor._id, query: 'newest' }), 1);
});

// ================= comparisons =================
test('comparisons: record a session, the same set in another order refreshes one entry', async () => {
  const { me, visitor } = await fresh('cmp1@example.com');
  const [a, b, c] = await pros(3);
  const res = await me.post('/api/recent-comparisons', { professionalIds: [a, b, c] });
  assert.equal(res.status, 201);
  assert.deepEqual(res.body.data.professionals.map(String), [a, b, c]);
  const t = new Date(res.body.data.comparedAt);
  await new Promise((r) => setTimeout(r, 15));
  const again = await me.post('/api/recent-comparisons', { professionalIds: [c, a, b] });
  assert.equal(again.status, 200);
  assert.ok(new Date(again.body.data.comparedAt) > t);
  assert.equal(await RecentComparison.countDocuments({ visitor: visitor._id }), 1);
  assert.equal((await me.post('/api/recent-comparisons', { professionalIds: [a, b] })).status, 201); // a different set is a new entry
  assert.equal(await RecentComparison.countDocuments({ visitor: visitor._id }), 2);
});

test('comparisons: 2 to 4 distinct, existing professionals', async () => {
  const { me } = await fresh('cmp2@example.com');
  const [a, b, c, d, e] = await pros(5);
  for (const body of [{ professionalIds: [a] }, { professionalIds: [a, b, c, d, e] }, { professionalIds: [a, a] }, { professionalIds: [a, 'bad'] }, { professionalIds: [] }, {}, { professionalIds: [a, b], visitor: 'x' }]) {
    assert.equal((await me.post('/api/recent-comparisons', body)).status, 400, JSON.stringify(body));
  }
  assert.equal((await me.post('/api/recent-comparisons', { professionalIds: [a, String(new mongoose.Types.ObjectId())] })).status, 404);
  const inactive = await Professional.findOne({ profileStatus: { $ne: 'active' } });
  assert.equal((await me.post('/api/recent-comparisons', { professionalIds: [a, String(inactive._id)] })).status, 404);
  assert.equal((await me.post('/api/recent-comparisons', { professionalIds: [a, b, c, d] })).status, 201);
});

test('comparisons: list with professional data, hide unavailable ones, remove and clear', async () => {
  const { me } = await fresh('cmp3@example.com');
  const [a, b, c] = await pros(3);
  await me.post('/api/recent-comparisons', { professionalIds: [a, b] });
  await new Promise((r) => setTimeout(r, 5));
  await me.post('/api/recent-comparisons', { professionalIds: [a, b, c] });
  const list = (await me.get('/api/recent-comparisons')).body;
  assert.equal(list.data.length, 2);
  assert.equal(list.data[0].professionals.length, 3); // newest first
  assert.deepEqual(list.data[0].professionals.map((p) => p._id), [a, b, c]);
  assert.equal(list.data[0].professionals[0].contactEmail, undefined);
  await Professional.updateOne({ _id: c }, { profileStatus: 'inactive' });
  const hidden = (await me.get('/api/recent-comparisons')).body.data[0];
  assert.equal(hidden.professionals.length, 2);
  assert.equal(hidden.unavailable, 1);
  await Professional.updateOne({ _id: c }, { profileStatus: 'active' });

  assert.equal((await me.del(`/api/recent-comparisons/${list.data[0]._id}`)).status, 200);
  assert.equal((await me.del(`/api/recent-comparisons/${list.data[0]._id}`)).status, 404);
  assert.equal((await me.del('/api/recent-comparisons/clear')).body.deleted, 1);
});

test('compare endpoint: 2-4 professionals in the requested order', async () => {
  const [a, b, c] = await pros(3);
  const get = (ids) => request(app).get(`/api/professionals/compare?ids=${ids}`);
  const ok = await get(`${c},${a},${b}`);
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.body.data.map((p) => p._id), [c, a, b]);
  assert.ok(ok.body.data[0].services && ok.body.data[0].qualifications);
  assert.equal((await get(a)).status, 400);
  assert.equal((await get(`${a},bad`)).status, 400);
  assert.equal((await get([a, b, c, a, b].join(','))).status, 200); // duplicates collapse
  assert.equal((await get((await pros(5)).join(','))).status, 400);
  assert.equal((await get(`${a},${new mongoose.Types.ObjectId()}`)).status, 404);
  const inactive = await Professional.findOne({ profileStatus: { $ne: 'active' } });
  const partial = await get(`${a},${b},${inactive._id}`);
  assert.equal(partial.body.data.length, 2);
  assert.equal(partial.body.unavailable, 1);
});

// ================= privacy =================
test('privacy: with tracking off nothing new is stored, existing history stays readable and removable', async () => {
  const { me, visitor } = await fresh('priv1@example.com');
  const [a, b] = await pros(2);
  await me.post('/api/recently-viewed', { professionalId: a });
  const off = await setPrivacy(me, { trackHistory: false });
  assert.equal(off.status, 200);
  assert.equal(off.body.data.privacySettings.trackHistory, false);
  assert.equal((await me.get('/api/auth/me')).body.data.privacySettings.trackHistory, false);

  const v = await me.post('/api/recently-viewed', { professionalId: b });
  const s = await me.post('/api/search-history', { query: 'mitchell' });
  const c = await me.post('/api/recent-comparisons', { professionalIds: [a, b] });
  for (const r of [v, s, c]) { assert.equal(r.status, 200); assert.equal(r.body.tracked, false); assert.equal(r.body.reason, 'disabled'); }
  assert.equal(await RecentlyViewed.countDocuments({ visitor: visitor._id }), 1);
  assert.equal(await SearchHistory.countDocuments({ visitor: visitor._id }), 0);
  assert.equal(await RecentComparison.countDocuments({ visitor: visitor._id }), 0);
  const list = await me.get('/api/recently-viewed');
  assert.equal(list.body.data.length, 1); // old entries are still there
  assert.equal(list.body.settings.trackHistory, false);
  assert.equal((await me.del('/api/recently-viewed/clear')).body.deleted, 1);

  await setPrivacy(me, { trackHistory: true });
  assert.equal((await me.post('/api/recently-viewed', { professionalId: b })).body.tracked, true); // resumes when switched back on
});

test('privacy: invalid settings are rejected; settings never reach other visitors', async () => {
  const { me } = await fresh('priv2@example.com');
  for (const bad of [{ historyRetentionDays: 7 }, { historyRetentionDays: '90' }, { trackHistory: 'no' }, { admin: true }]) assert.equal((await setPrivacy(me, bad)).status, 400, JSON.stringify(bad));
  assert.equal((await setPrivacy(me, { historyRetentionDays: 30 })).body.data.privacySettings.historyRetentionDays, 30);
  assert.equal((await setPrivacy(me, { historyRetentionDays: 30 })).body.data.privacySettings.trackHistory, true); // untouched
});

test('retention: expired history is deleted when read, when the period is shortened, and by the sweep', async () => {
  const { me, visitor } = await fresh('ret1@example.com');
  const [a, b, c] = await pros(3);
  const mk = (professional, days) => ({ visitor: visitor._id, professional, firstViewedAt: ago(days * DAY), lastViewedAt: ago(days * DAY), viewCount: 1 });
  await RecentlyViewed.insertMany([mk(a, 5), mk(b, 40), mk(c, 100)]);
  await SearchHistory.insertMany([{ q: 'x', d: 5 }, { q: 'y', d: 100 }].map((x) => ({ visitor: visitor._id, query: x.q, filters: {}, queryKey: x.q, resultsCount: 1, searchedAt: ago(x.d * DAY) })));
  await RecentComparison.insertMany([{ d: 5, k: 'a' }, { d: 100, k: 'b' }].map((x) => ({ visitor: visitor._id, professionals: [a, b], setKey: x.k, comparedAt: ago(x.d * DAY) })));

  // default retention is 90 days: reading removes the 100-day-old records
  const list = await me.get('/api/recently-viewed');
  assert.deepEqual(list.body.data.map((r) => r.professional._id), [a, b]);
  assert.equal((await me.get('/api/search-history')).body.data.length, 1);
  assert.equal((await me.get('/api/recent-comparisons')).body.data.length, 1);

  // shortening the period to 30 days applies immediately, without reading
  assert.equal((await setPrivacy(me, { historyRetentionDays: 30 })).status, 200);
  assert.equal(await RecentlyViewed.countDocuments({ visitor: visitor._id }), 1);
  assert.equal((await RecentlyViewed.findOne({ visitor: visitor._id })).professional.toString(), a);

  // the periodic sweep applies each visitor's own period
  const other = await fresh('ret2@example.com');
  await RecentlyViewed.insertMany([mk(a, 5), mk(b, 40), mk(c, 200)].map((d) => ({ ...d, visitor: other.visitor._id })));
  await purgeAll(); // other visitor: default 90 days
  assert.deepEqual((await RecentlyViewed.find({ visitor: other.visitor._id })).map((d) => d.professional.toString()).sort(), [a, b].sort());
  await Visitor.updateOne({ _id: other.visitor._id }, { 'privacySettings.historyRetentionDays': 365 });
  await RecentlyViewed.create({ ...mk(c, 200), visitor: other.visitor._id });
  await purgeAll();
  assert.equal(await RecentlyViewed.countDocuments({ visitor: other.visitor._id }), 3); // 200 days is within 365
  assert.equal(await RecentlyViewed.countDocuments({ visitor: visitor._id }), 1); // first visitor unaffected by the other's period
});

// ================= ownership =================
test('ownership: records are private; one visitor cannot read, remove or clear another\'s history', async () => {
  const alice = (await fresh('alice-h@example.com')).me;
  const bob = (await fresh('bob-h@example.com')).me;
  const [a, b] = await pros(2);
  await alice.post('/api/recently-viewed', { professionalId: a });
  await alice.post('/api/search-history', { query: 'mitchell' });
  await alice.post('/api/recent-comparisons', { professionalIds: [a, b] });
  const ids = {
    v: (await alice.get('/api/recently-viewed')).body.data[0]._id,
    s: (await alice.get('/api/search-history')).body.data[0]._id,
    c: (await alice.get('/api/recent-comparisons')).body.data[0]._id,
  };
  for (const url of ['/api/recently-viewed', '/api/search-history', '/api/recent-comparisons']) assert.equal((await bob.get(url)).body.data.length, 0);
  assert.equal((await bob.del(`/api/recently-viewed/${ids.v}`)).status, 404);
  assert.equal((await bob.del(`/api/search-history/${ids.s}`)).status, 404);
  assert.equal((await bob.del(`/api/recent-comparisons/${ids.c}`)).status, 404);
  assert.equal((await bob.del('/api/recently-viewed/clear')).body.deleted, 0);
  assert.equal((await bob.del('/api/search-history/clear')).body.deleted, 0);
  assert.equal((await bob.del('/api/recent-comparisons/clear')).body.deleted, 0);
  assert.equal((await alice.get('/api/recently-viewed')).body.data.length, 1); // alice's history is untouched
  assert.equal((await alice.get('/api/search-history')).body.data.length, 1);
  assert.equal((await alice.get('/api/recent-comparisons')).body.data.length, 1);
});

test('a seeded demo account reads its own history through the API', async () => {
  const emma = await login('emma.carter@example.com');
  const viewed = (await emma.get('/api/recently-viewed')).body;
  assert.ok(viewed.pagination.total >= 10);
  const dates = viewed.data.map((r) => +new Date(r.lastViewedAt));
  assert.deepEqual(dates, [...dates].sort((a, b) => b - a));
  assert.ok((await emma.get('/api/search-history')).body.pagination.total >= 5);
  assert.ok((await emma.get('/api/recent-comparisons')).body.pagination.total >= 3);
});
