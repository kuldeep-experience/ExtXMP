import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/evp_saved_test';
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
const { default: SavedFolder } = await import('../src/models/SavedFolder.js');
const { default: SavedProfessional } = await import('../src/models/SavedProfessional.js');

async function login(email) {
  const agent = request.agent(app);
  const { body } = await agent.get('/api/auth/csrf');
  const h = { 'x-csrf-token': body.csrfToken };
  const r = await agent.post('/api/auth/login').set(h).send({ email, password: DEMO_PASSWORD });
  assert.equal(r.status, 200, email);
  return {
    get: (u) => agent.get(u),
    post: (u, b = {}) => agent.post(u).set(h).send(b),
    patch: (u, b = {}) => agent.patch(u).set(h).send(b),
    del: (u) => agent.delete(u).set(h),
  };
}
const fresh = async (email) => {
  // brand-new visitor with no saved data, so tests do not depend on seeded records
  const { default: bcrypt } = await import('bcrypt');
  await Visitor.create({ firstName: 'T', lastName: 'U', email, passwordHash: await bcrypt.hash(DEMO_PASSWORD, 4), emailVerified: true });
  return login(email);
};
const proIds = async (n, extra = {}) => (await Professional.find({ profileStatus: 'active', ...extra }).sort({ fullName: 1 }).limit(n).lean()).map((p) => String(p._id));

before(async () => { await connectDB();
  await Promise.all(Object.values(mongoose.models).map((m) => m.init())); await seed(); });
after(async () => { await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });

test('seed: every demo visitor has 3+ folders and 5-8 valid, distinct saved professionals', async () => {
  const visitors = await Visitor.find({ email: { $in: demoVisitors.map((v) => v.email) } }).lean();
  assert.equal(visitors.length, demoVisitors.length);
  const proSet = new Set((await Professional.find().select('_id').lean()).map((p) => String(p._id)));
  const allDates = new Set(), allNotes = new Set();
  for (const v of visitors) {
    const folders = await SavedFolder.find({ visitor: v._id }).lean();
    const saved = await SavedProfessional.find({ visitor: v._id }).lean();
    assert.ok(folders.length >= 3, v.email);
    assert.ok(saved.length >= 5 && saved.length <= 8, `${v.email}: ${saved.length}`);
    assert.equal(new Set(saved.map((s) => String(s.professional))).size, saved.length); // no duplicates
    const folderIds = new Set(folders.map((f) => String(f._id)));
    for (const s of saved) {
      assert.ok(proSet.has(String(s.professional)));
      assert.ok(!s.folder || folderIds.has(String(s.folder))); // folders belong to the same visitor
      allDates.add(+s.createdAt); if (s.note) allNotes.add(s.note);
    }
  }
  assert.ok(allDates.size > 20 && allNotes.size >= 8);
});

test('every endpoint requires authentication', async () => {
  const id = new mongoose.Types.ObjectId();
  const a = request.agent(app);
  const { body } = await a.get('/api/auth/csrf');
  const h = { 'x-csrf-token': body.csrfToken };
  const calls = [
    a.get('/api/saved-professionals'), a.get('/api/saved-professionals/ids'), a.post('/api/saved-professionals').set(h).send({}),
    a.patch(`/api/saved-professionals/${id}`).set(h).send({}), a.delete(`/api/saved-professionals/${id}`).set(h),
    a.get('/api/saved-folders'), a.post('/api/saved-folders').set(h).send({}),
    a.patch(`/api/saved-folders/${id}`).set(h).send({}), a.delete(`/api/saved-folders/${id}`).set(h),
  ];
  for (const r of await Promise.all(calls)) assert.equal(r.status, 401);
});

test('state-changing requests need a CSRF token', async () => {
  const c = request.agent(app);
  await c.get('/api/auth/csrf');
  const { body } = await c.post('/api/auth/login').set('x-csrf-token', (await c.get('/api/auth/csrf')).body.csrfToken).send({ email: 'emma.carter@example.com', password: DEMO_PASSWORD });
  assert.ok(body.success);
  assert.equal((await c.post('/api/saved-folders').send({ name: 'x' })).status, 403);
});

test('save: creates, returns professional summary, blocks duplicates and bad input', async () => {
  const me = await fresh('save1@example.com');
  const [p] = await proIds(1);
  const res = await me.post('/api/saved-professionals', { professionalId: p, note: '  my note ' });
  assert.equal(res.status, 201);
  assert.equal(res.body.data.professional._id, p);
  assert.ok(res.body.data.professional.fullName && res.body.data.professional.averageRating >= 3);
  assert.equal(res.body.data.note, 'my note');
  assert.equal(res.body.data.folder, null);
  assert.ok(res.body.data.savedAt);
  assert.equal((await me.post('/api/saved-professionals', { professionalId: p })).status, 409);
  assert.equal(await SavedProfessional.countDocuments({ professional: p, visitor: (await Visitor.findOne({ email: 'save1@example.com' }))._id }), 1);
  assert.equal((await me.post('/api/saved-professionals', { professionalId: 'nope' })).status, 400);
  assert.equal((await me.post('/api/saved-professionals', { professionalId: String(new mongoose.Types.ObjectId()) })).status, 404);
  assert.equal((await me.post('/api/saved-professionals', { professionalId: p, visitor: String(new mongoose.Types.ObjectId()) })).status, 400);
  assert.equal((await me.post('/api/saved-professionals', { professionalId: (await proIds(2))[1], note: 'x'.repeat(1001) })).status, 400);
  const inactive = await Professional.findOne({ profileStatus: { $ne: 'active' } });
  assert.equal((await me.post('/api/saved-professionals', { professionalId: String(inactive._id) })).status, 404);
});

test('list: search, sort, folder filter, pagination and ids map', async () => {
  const me = await fresh('list1@example.com');
  const pros = await Professional.find({ profileStatus: 'active' }).sort({ fullName: 1 }).limit(6).lean();
  const f = (await me.post('/api/saved-folders', { name: 'Shortlist' })).body.data;
  for (const [i, p] of pros.entries()) await me.post('/api/saved-professionals', { professionalId: String(p._id), folderId: i < 2 ? f._id : undefined, note: i === 3 ? 'ask about weekends' : '' });

  const all = await me.get('/api/saved-professionals');
  assert.equal(all.body.data.length, 6);
  assert.equal(all.body.pagination.total, 6);
  const dates = all.body.data.map((s) => +new Date(s.savedAt));
  assert.deepEqual(dates, [...dates].sort((a, b) => b - a)); // recent first

  const byName = (await me.get('/api/saved-professionals?sort=name')).body.data.map((s) => s.professional.fullName);
  assert.deepEqual(byName, [...byName].sort((a, b) => a.localeCompare(b)));
  const byRating = (await me.get('/api/saved-professionals?sort=rating')).body.data.map((s) => s.professional.averageRating);
  assert.deepEqual(byRating, [...byRating].sort((a, b) => b - a));

  const inFolder = await me.get(`/api/saved-professionals?folder=${f._id}`);
  assert.equal(inFolder.body.data.length, 2);
  assert.ok(inFolder.body.data.every((s) => s.folder === f._id));
  assert.equal((await me.get('/api/saved-professionals?folder=unfiled')).body.data.length, 4);

  const byQ = await me.get(`/api/saved-professionals?q=${encodeURIComponent(pros[0].fullName.split(' ')[1])}`);
  assert.ok(byQ.body.data.some((s) => s.professional._id === String(pros[0]._id)));
  assert.equal((await me.get('/api/saved-professionals?q=weekends')).body.data.length, 1); // searches notes too
  assert.equal((await me.get('/api/saved-professionals?q=zzzzqqq')).body.data.length, 0);
  assert.equal((await me.get('/api/saved-professionals?q=.*')).body.data.length, 0); // regex chars are literal

  const page = await me.get('/api/saved-professionals?limit=4&page=2');
  assert.equal(page.body.data.length, 2);
  assert.equal(page.body.pagination.totalPages, 2);

  const ids = await me.get('/api/saved-professionals/ids');
  assert.equal(Object.keys(ids.body.data).length, 6);
  assert.equal(ids.body.data[String(pros[0]._id)], all.body.data.find((s) => s.professional._id === String(pros[0]._id))._id);

  assert.equal((await me.get('/api/saved-professionals?sort=bad')).status, 400);
  // Express 5 does not parse bracket syntax, so an operator object can never reach MongoDB: the param is just ignored
  assert.equal((await me.get('/api/saved-professionals?folder[$ne]=x')).body.data.length, 6);
  assert.equal((await me.get('/api/saved-professionals?folder=bad')).status, 400);
});

test('update: move between folders, unfile, add/edit/delete note, strict input', async () => {
  const me = await fresh('upd1@example.com');
  const [p] = await proIds(1);
  const f1 = (await me.post('/api/saved-folders', { name: 'One' })).body.data;
  const f2 = (await me.post('/api/saved-folders', { name: 'Two' })).body.data;
  const s = (await me.post('/api/saved-professionals', { professionalId: p })).body.data;
  const url = `/api/saved-professionals/${s._id}`;

  assert.equal((await me.patch(url, { folderId: f1._id })).body.data.folder, f1._id);
  assert.equal((await me.patch(url, { folderId: f2._id })).body.data.folder, f2._id);
  assert.equal((await me.patch(url, { folderId: null })).body.data.folder, null);
  assert.equal((await me.patch(url, { note: 'first note' })).body.data.note, 'first note');
  const edited = await me.patch(url, { note: 'edited note' });
  assert.equal(edited.body.data.note, 'edited note');
  assert.equal(edited.body.data.folder, null); // note edit leaves folder alone
  assert.equal((await me.patch(url, { note: '' })).body.data.note, '');
  assert.equal((await me.patch(url, { folderId: f1._id, note: 'both' })).body.data.note, 'both');

  for (const bad of [{}, { professional: p }, { visitor: 'x' }, { folderId: 'bad' }, { note: 'x'.repeat(1001) }, { createdAt: '2020-01-01' }]) {
    assert.equal((await me.patch(url, bad)).status, 400, JSON.stringify(bad));
  }
  assert.equal((await me.patch(`/api/saved-professionals/${new mongoose.Types.ObjectId()}`, { note: 'x' })).status, 404);
  assert.equal((await me.patch('/api/saved-professionals/not-an-id', { note: 'x' })).status, 400);
});

test('remove: deletes once, then 404; can save again afterwards', async () => {
  const me = await fresh('del1@example.com');
  const [p] = await proIds(1);
  const s = (await me.post('/api/saved-professionals', { professionalId: p })).body.data;
  assert.equal((await me.del(`/api/saved-professionals/${s._id}`)).status, 200);
  assert.equal((await me.del(`/api/saved-professionals/${s._id}`)).status, 404);
  assert.equal((await me.get('/api/saved-professionals')).body.data.length, 0);
  assert.equal((await me.post('/api/saved-professionals', { professionalId: p })).status, 201);
});

test('folders: create, duplicate names, rename, counts, delete moves items to unfiled', async () => {
  const me = await fresh('fold1@example.com');
  const [a, b, c] = await proIds(3);
  const f = await me.post('/api/saved-folders', { name: ' Home Buying ', description: 'Agents' });
  assert.equal(f.status, 201);
  assert.equal(f.body.data.name, 'Home Buying');
  assert.equal(f.body.data.nameKey, undefined);
  assert.equal((await me.post('/api/saved-folders', { name: 'home buying' })).status, 409); // case-insensitive
  assert.equal((await me.post('/api/saved-folders', { name: '' })).status, 400);
  assert.equal((await me.post('/api/saved-folders', { name: 'x'.repeat(61) })).status, 400);
  assert.equal((await me.post('/api/saved-folders', { name: 'Ok', visitor: 'x' })).status, 400);
  const g = (await me.post('/api/saved-folders', { name: 'Legal' })).body.data;

  await me.post('/api/saved-professionals', { professionalId: a, folderId: f.body.data._id });
  await me.post('/api/saved-professionals', { professionalId: b, folderId: f.body.data._id });
  await me.post('/api/saved-professionals', { professionalId: c });
  const list = await me.get('/api/saved-folders');
  assert.deepEqual(list.body.totals, { all: 3, unfiled: 1 });
  assert.equal(list.body.data.find((x) => x._id === f.body.data._id).count, 2);
  assert.equal(list.body.data.find((x) => x._id === g._id).count, 0);

  const renamed = await me.patch(`/api/saved-folders/${f.body.data._id}`, { name: 'House Hunt', description: '' });
  assert.equal(renamed.body.data.name, 'House Hunt');
  assert.equal(renamed.body.data.description, '');
  assert.equal((await me.patch(`/api/saved-folders/${f.body.data._id}`, { name: 'LEGAL' })).status, 409);
  assert.equal((await me.patch(`/api/saved-folders/${f.body.data._id}`, {})).status, 400);

  const del = await me.del(`/api/saved-folders/${f.body.data._id}`);
  assert.equal(del.status, 200);
  assert.equal(del.body.movedToUnfiled, 2);
  assert.equal((await me.get('/api/saved-professionals?folder=unfiled')).body.data.length, 3); // nothing lost
  assert.equal((await me.del(`/api/saved-folders/${f.body.data._id}`)).status, 404);
  assert.equal((await me.post('/api/saved-professionals', { professionalId: (await proIds(4))[3], folderId: f.body.data._id })).status, 404);
});

test('ownership: another visitor can never read or change my records', async () => {
  const alice = await fresh('alice@example.com');
  const bob = await fresh('bob@example.com');
  const [p, q] = await proIds(2);
  const folder = (await alice.post('/api/saved-folders', { name: 'Private' })).body.data;
  const saved = (await alice.post('/api/saved-professionals', { professionalId: p, folderId: folder._id, note: 'secret' })).body.data;

  // reads are isolated
  assert.equal((await bob.get('/api/saved-professionals')).body.data.length, 0);
  assert.deepEqual((await bob.get('/api/saved-professionals/ids')).body.data, {});
  assert.equal((await bob.get('/api/saved-folders')).body.data.length, 0);
  assert.equal((await bob.get(`/api/saved-professionals?folder=${folder._id}`)).body.data.length, 0);
  assert.equal((await bob.get('/api/saved-professionals?q=secret')).body.data.length, 0);

  // writes against alice's ids look like "not found"
  assert.equal((await bob.patch(`/api/saved-professionals/${saved._id}`, { note: 'hacked' })).status, 404);
  assert.equal((await bob.patch(`/api/saved-professionals/${saved._id}`, { folderId: null })).status, 404);
  assert.equal((await bob.del(`/api/saved-professionals/${saved._id}`)).status, 404);
  assert.equal((await bob.patch(`/api/saved-folders/${folder._id}`, { name: 'Hacked' })).status, 404);
  assert.equal((await bob.del(`/api/saved-folders/${folder._id}`)).status, 404);
  // bob cannot file his own save into alice's folder, or move it there
  assert.equal((await bob.post('/api/saved-professionals', { professionalId: q, folderId: folder._id })).status, 404);
  const mine = (await bob.post('/api/saved-professionals', { professionalId: q })).body.data;
  assert.equal((await bob.patch(`/api/saved-professionals/${mine._id}`, { folderId: folder._id })).status, 404);

  // alice's data is untouched, and both can save the same professional independently
  const after = (await alice.get('/api/saved-professionals')).body.data;
  assert.equal(after.length, 1);
  assert.equal(after[0].note, 'secret');
  assert.equal(after[0].folder, folder._id);
  assert.equal((await alice.get('/api/saved-folders')).body.data[0].name, 'Private');
  assert.equal((await bob.post('/api/saved-professionals', { professionalId: p })).status, 201);
});

test('seeded demo account sees its own saved professionals through the API', async () => {
  const emma = await login('emma.carter@example.com');
  const noah = await login('noah.fischer@example.com');
  const e = (await emma.get('/api/saved-professionals')).body;
  const n = (await noah.get('/api/saved-professionals')).body;
  assert.ok(e.data.length >= 5 && n.data.length >= 5);
  const folders = (await emma.get('/api/saved-folders')).body;
  assert.ok(folders.data.length >= 3);
  assert.equal(folders.totals.all, e.pagination.total);
  assert.equal(folders.data.reduce((s, f) => s + f.count, 0) + folders.totals.unfiled, folders.totals.all);
});
