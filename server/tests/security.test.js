import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import jwt from 'jsonwebtoken';

process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/evp_security_test';
process.env.JWT_SECRET = 'test-secret-test-secret';
process.env.BCRYPT_ROUNDS = '4';
process.env.SENSITIVE_RATE_LIMIT_MAX = '1000';
process.env.LOGIN_RATE_LIMIT_MAX = '1000';
process.env.AI_RATE_LIMIT_MAX = '1000';
const { default: app } = await import('../src/app.js');
const { connectDB } = await import('../src/config/db.js');
const { seed } = await import('../src/seed/index.js');
const { DEMO_PASSWORD } = await import('../src/seed/visitors.js');
const { default: mongoose } = await import('mongoose');
const { default: Visitor } = await import('../src/models/Visitor.js');
const { default: Professional } = await import('../src/models/Professional.js');

const DAY = 86400000;
async function client(email) {
  const agent = request.agent(app);
  const { body } = await agent.get('/api/auth/csrf');
  const h = { 'x-csrf-token': body.csrfToken };
  if (email) { const r = await agent.post('/api/auth/login').set(h).send({ email, password: DEMO_PASSWORD }); assert.equal(r.status, 200); agent.loginResponse = r; }
  return {
    agent, get: (u) => agent.get(u), post: (u, b = {}) => agent.post(u).set(h).send(b), patch: (u, b = {}) => agent.patch(u).set(h).send(b), del: (u) => agent.delete(u).set(h),
    call: (m, u, b) => ({ GET: () => agent.get(u), POST: () => agent.post(u).set(h).send(b ?? {}), PATCH: () => agent.patch(u).set(h).send(b ?? {}), DELETE: () => agent.delete(u).set(h) })[m](),
  };
}
const mkVisitor = async (email) => { const { default: bcrypt } = await import('bcrypt'); return Visitor.create({ firstName: 'Sec', lastName: 'Test', email, passwordHash: await bcrypt.hash(DEMO_PASSWORD, 4), emailVerified: true }); };

let A, B, ANON, ids, proId, otherProId;
before(async () => {
  await connectDB(); await Promise.all(Object.values(mongoose.models).map((m) => m.init())); await seed();
  await mkVisitor('sec-a@example.com'); await mkVisitor('sec-b@example.com');
  [A, B, ANON] = [await client('sec-a@example.com'), await client('sec-b@example.com'), await client()];
  const pros = await Professional.find({ profileStatus: 'active' }).sort({ fullName: 1 }).limit(3).lean();
  [proId, otherProId] = [String(pros[0]._id), String(pros[1]._id)];
  const idOf = (r) => r.body.data._id;
  const ai = await A.post('/api/ai/recommendations', { message: 'I need a mortgage professional with at least 5 years of experience.' });
  const saved = await A.post('/api/saved-professionals', { professionalId: proId });
  const search = await A.post('/api/saved-searches', { name: 'Mine', minRating: 4 });
  ids = {
    saved: idOf(saved), folder: idOf(await A.post('/api/saved-folders', { name: 'Mine' })), search: idOf(search),
    exp: idOf(await A.post('/api/experience-history', { professionalId: proId, serviceUsed: 'Svc', experienceDate: new Date(Date.now() - DAY).toISOString() })),
    svc: idOf(await A.post('/api/service-records', { professionalId: proId, serviceName: 'Svc', serviceDate: new Date().toISOString() })),
    chat: idOf(await A.post('/api/conversations', { professionalId: proId, message: 'Hi' }).then((r) => ({ body: { data: r.body.data } }))),
    ai: ai.body.data.conversation._id,
    viewed: (await A.post('/api/recently-viewed', { professionalId: proId })).body.data._id,
    history: (await A.post('/api/search-history', { query: 'mitchell' })).body.data._id,
    compare: (await A.post('/api/recent-comparisons', { professionalIds: [proId, otherProId] })).body.data._id,
  };
});
after(async () => { await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });

// [method, path builder, valid body (so a 404 is never hidden by a 400)]. "Owned" = addresses one of A's records.
const owned = () => [
  ['PATCH', `/api/saved-professionals/${ids.saved}`, { note: 'x' }], ['DELETE', `/api/saved-professionals/${ids.saved}`],
  ['PATCH', `/api/saved-folders/${ids.folder}`, { name: 'Renamed' }], ['DELETE', `/api/saved-folders/${ids.folder}`],
  ['GET', `/api/saved-searches/${ids.search}`], ['PATCH', `/api/saved-searches/${ids.search}`, { name: 'Renamed' }], ['POST', `/api/saved-searches/${ids.search}/run`], ['DELETE', `/api/saved-searches/${ids.search}`],
  ['GET', `/api/experience-history/${ids.exp}`], ['PATCH', `/api/experience-history/${ids.exp}`, { notes: 'x' }], ['DELETE', `/api/experience-history/${ids.exp}`],
  ['GET', `/api/service-records/${ids.svc}`], ['PATCH', `/api/service-records/${ids.svc}`, { summary: 'x' }], ['DELETE', `/api/service-records/${ids.svc}`],
  ['GET', `/api/conversations/${ids.chat}`], ['GET', `/api/conversations/${ids.chat}/messages`], ['POST', `/api/conversations/${ids.chat}/messages`, { body: 'x' }], ['POST', `/api/conversations/${ids.chat}/read`], ['DELETE', `/api/conversations/${ids.chat}`],
  ['GET', `/api/ai/conversations/${ids.ai}`], ['GET', `/api/ai/conversations/${ids.ai}/messages`], ['PATCH', `/api/ai/conversations/${ids.ai}`, { title: 'x' }], ['DELETE', `/api/ai/conversations/${ids.ai}`],
  ['DELETE', `/api/recently-viewed/${ids.viewed}`], ['DELETE', `/api/search-history/${ids.history}`], ['DELETE', `/api/recent-comparisons/${ids.compare}`],
];
// Private endpoints without an id in the path: a body that is valid so only authentication decides the outcome.
const collection = () => [
  ['GET', '/api/auth/me'], ['PATCH', '/api/auth/profile', { firstName: 'X' }], ['PATCH', '/api/auth/change-password', { currentPassword: 'Demo@12345', newPassword: 'Another1pass' }], ['POST', '/api/auth/resend-verification'],
  ['GET', '/api/saved-professionals'], ['GET', '/api/saved-professionals/ids'], ['POST', '/api/saved-professionals', { professionalId: otherProId }],
  ['GET', '/api/saved-folders'], ['POST', '/api/saved-folders', { name: 'New' }], ['GET', '/api/saved-searches'], ['POST', '/api/saved-searches', { name: 'New', minRating: 3 }],
  ['GET', '/api/experience-history'], ['GET', '/api/experience-history/timeline'], ['POST', '/api/experience-history', { professionalId: proId, serviceUsed: 'S', experienceDate: new Date().toISOString() }],
  ['GET', '/api/service-records'], ['POST', '/api/service-records', { professionalId: proId, serviceName: 'S', serviceDate: new Date().toISOString() }],
  ['GET', '/api/conversations'], ['GET', '/api/conversations/unread-count'], ['POST', '/api/conversations', { professionalId: otherProId, message: 'Hi' }],
  ['GET', '/api/ai/status'], ['GET', '/api/ai/conversations'], ['POST', '/api/ai/conversations', {}], ['POST', '/api/ai/recommendations', { message: 'a mortgage broker' }],
  ['GET', '/api/review-insights/mine'], ['POST', `/api/review-insights/professional/${proId}/generate`],
  ['GET', '/api/recently-viewed'], ['POST', '/api/recently-viewed', { professionalId: proId }], ['DELETE', '/api/recently-viewed/clear'],
  ['GET', '/api/search-history'], ['POST', '/api/search-history', { query: 'x' }], ['DELETE', '/api/search-history/clear'],
  ['GET', '/api/recent-comparisons'], ['POST', '/api/recent-comparisons', { professionalIds: [proId, otherProId] }], ['DELETE', '/api/recent-comparisons/clear'],
];

test('unauthenticated requests cannot reach any private endpoint', async () => {
  const all = [...owned(), ...collection()];
  assert.ok(all.length >= 60);
  for (const [m, url, body] of all) {
    const r = await ANON.call(m, url, body);
    assert.equal(r.status, 401, `${m} ${url} -> ${r.status}`);
    assert.equal(r.body.success, false);
  }
});

test('user B cannot read, change, delete or act on user A\'s records (every owned endpoint answers 404)', async () => {
  for (const [m, url, body] of owned()) {
    const r = await B.call(m, url, body);
    assert.equal(r.status, 404, `${m} ${url} -> ${r.status}`);
  }
  // nothing was changed or removed by those attempts: A can still read everything
  for (const [url] of [[`/api/saved-searches/${ids.search}`], [`/api/experience-history/${ids.exp}`], [`/api/service-records/${ids.svc}`], [`/api/conversations/${ids.chat}`], [`/api/ai/conversations/${ids.ai}`]]) {
    assert.equal((await A.get(url)).status, 200, url);
  }
  assert.equal((await A.get(`/api/service-records/${ids.svc}`)).body.data.summary, '');
  assert.equal((await A.get(`/api/saved-searches/${ids.search}`)).body.data.name, 'Mine');
  // and B's own lists are empty of A's data
  for (const url of ['/api/saved-professionals', '/api/saved-folders', '/api/saved-searches', '/api/experience-history', '/api/service-records', '/api/conversations', '/api/ai/conversations', '/api/recently-viewed', '/api/search-history', '/api/recent-comparisons', '/api/experience-history/timeline']) {
    const r = await B.get(url);
    assert.equal(r.status, 200, url);
    assert.equal(r.body.data.length, 0, `${url} leaked another visitor's data`);
  }
  assert.deepEqual((await B.get('/api/saved-professionals/ids')).body.data, {});
  assert.equal((await B.get('/api/review-insights/mine')).body.data.length, 0);
});

test('invalid MongoDB ids are rejected safely (400, never a 500 or a crash)', async () => {
  const bad = ['not-an-id', '123', '%7B%22%24ne%22%3Anull%7D', 'x'.repeat(40), '0'.repeat(23)];
  for (const [m, url, body] of owned()) {
    for (const junk of bad) {
      const hit = url.replace(/[a-f0-9]{24}/i, junk);
      const r = await A.call(m, hit, body);
      assert.equal(r.status, 400, `${m} ${hit} -> ${r.status}`);
      assert.equal(r.body.success, false);
    }
    const missing = await A.call(m, url.replace(/[a-f0-9]{24}/i, '0'.repeat(24)), body); // well-formed but nonexistent
    assert.equal(missing.status, 404, `${m} ${url} with an unknown id -> ${missing.status}`);
  }
  for (const url of [`/api/review-insights/professional/zzz`, '/api/professionals/zzz', '/api/professionals/zzz/reviews', '/api/ai/conversations/zzz/messages']) assert.ok([400, 401].includes((await A.get(url)).status), url);
  assert.equal((await A.get('/api/professionals/compare?ids=zzz,yyy')).status, 400);
  assert.equal((await A.get('/api/saved-professionals?folder=zzz')).status, 400);
  assert.equal((await A.get('/api/experience-history?professionalId=zzz')).status, 400);
});

test('Zod validation rejects malformed, oversized and unexpected input on every write endpoint', async () => {
  const writes = [
    '/api/saved-professionals', '/api/saved-folders', '/api/saved-searches', '/api/experience-history', '/api/service-records',
    '/api/conversations', '/api/ai/recommendations', '/api/recently-viewed', '/api/search-history', '/api/recent-comparisons',
  ];
  for (const url of writes) {
    for (const body of [{}, { unexpectedField: 'x' }, { professionalId: { $ne: null } }, { name: ['a'], message: 123, professionalId: 5 }]) {
      const r = await A.post(url, body);
      assert.equal(r.status, 400, `POST ${url} ${JSON.stringify(body)} -> ${r.status}`);
      assert.equal(r.body.success, false);
    }
  }
  assert.equal((await A.post('/api/ai/conversations', { visitor: 'x' })).status, 400);
  assert.equal((await A.post('/api/ai/recommendations', { message: 'x'.repeat(1001) })).status, 400);
  for (const [url, body] of [[`/api/saved-folders/${ids.folder}`, { visitor: 'x' }], [`/api/experience-history/${ids.exp}`, { visitor: 'x' }], [`/api/service-records/${ids.svc}`, { visitor: 'x' }], [`/api/saved-searches/${ids.search}`, { visitor: 'x' }], ['/api/auth/profile', { role: 'admin' }], ['/api/auth/profile', { emailVerified: true }], ['/api/auth/profile', { accountStatus: 'active' }]]) {
    assert.equal((await A.patch(url, body)).status, 400, `PATCH ${url}`);
  }
  // public endpoints too
  const anon = await client();
  assert.equal((await anon.post('/api/auth/register', { firstName: 'a', lastName: 'b', email: { $gt: '' }, password: 'Passw0rdOK' })).status, 400);
  assert.equal((await anon.post('/api/auth/register', { firstName: 'a', lastName: 'b', email: 'x@y.co', password: 'Passw0rdOK', role: 'admin' })).status, 400);
  assert.equal((await anon.post('/api/auth/login', { email: { $ne: null }, password: { $ne: null } })).status, 400); // NoSQL operator injection
  assert.equal((await anon.post('/api/auth/login', { email: 'a@b.co', password: ['x'] })).status, 400);
  assert.equal((await request(app).get('/api/professionals?minRating[$gt]=0&sort[$ne]=1')).status, 200); // bracket syntax is not parsed into operators
});

test('visitors cannot reach functionality that does not exist for them', async () => {
  for (const [m, url] of [['GET', '/api/admin'], ['GET', '/api/visitors'], ['GET', `/api/visitors/${ids.saved}`], ['POST', '/api/professionals'], ['PATCH', `/api/professionals/${proId}`], ['DELETE', `/api/professionals/${proId}`], ['POST', `/api/professionals/${proId}/reviews`], ['DELETE', `/api/professionals/${proId}/reviews/${ids.saved}`], ['GET', '/api/auth/users']]) {
    const r = await A.call(m, url, {});
    assert.equal(r.status, 404, `${m} ${url} -> ${r.status}`);
  }
  // the role is never taken from the client
  const me = (await A.get('/api/auth/me')).body.data;
  assert.equal(me.role, 'visitor');
  assert.equal(me.passwordHash, undefined);
});

test('JWT: the cookie and token expire after the configured time, and expired or forged tokens are refused', async () => {
  const loginRes = A.agent.loginResponse;
  const cookie = loginRes.headers['set-cookie'].find((c) => c.startsWith('evp_token='));
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /Max-Age=28800/); // ACCESS_TOKEN_TTL_MINUTES default 480
  const token = cookie.split(';')[0].split('=')[1];
  const payload = jwt.decode(token);
  assert.equal(payload.exp - payload.iat, 28800);
  assert.equal(payload.role, 'visitor');

  const sub = payload.sub;
  const withToken = (t) => request(app).get('/api/auth/me').set('Cookie', `evp_token=${t}`);
  assert.equal((await withToken(jwt.sign({}, process.env.JWT_SECRET, { subject: sub, expiresIn: 1 }))).status, 200);
  await new Promise((r) => setTimeout(r, 2100)); // let a 1 second token actually expire
  const shortLived = jwt.sign({}, process.env.JWT_SECRET, { subject: sub, expiresIn: -5 });
  const expired = await withToken(shortLived);
  assert.equal(expired.status, 401);
  assert.match(expired.body.message, /expired/i);
  assert.equal((await withToken(jwt.sign({}, 'another-secret-another-secret', { subject: sub }))).status, 401); // forged
  assert.equal((await withToken(`${token.slice(0, -4)}AAAA`)).status, 401); // tampered signature
  assert.equal((await withToken(jwt.sign({}, process.env.JWT_SECRET, { subject: sub, algorithm: 'HS512' }))).status, 401); // wrong algorithm
  assert.equal((await withToken(jwt.sign({}, process.env.JWT_SECRET, { subject: new mongoose.Types.ObjectId().toString() }))).status, 401); // visitor does not exist
  const none = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub })).toString('base64url')}.`;
  assert.equal((await withToken(none)).status, 401); // unsigned token
  assert.equal((await A.get('/api/auth/me')).status, 200); // the real session is unaffected
});

test('a suspended visitor with a valid session loses access to every private endpoint', async () => {
  await mkVisitor('sec-suspend@example.com');
  const S = await client('sec-suspend@example.com');
  assert.equal((await S.get('/api/auth/me')).status, 200);
  await Visitor.updateOne({ email: 'sec-suspend@example.com' }, { accountStatus: 'suspended' });
  for (const [m, url, body] of collection()) {
    const r = await S.call(m, url, body);
    assert.equal(r.status, 403, `${m} ${url} -> ${r.status}`);
  }
  await Visitor.deleteOne({ email: 'sec-suspend@example.com' });
  assert.equal((await S.get('/api/auth/me')).status, 401); // a deleted account's token no longer works
});

test('logout ends the session and writes need a CSRF token', async () => {
  await mkVisitor('sec-out@example.com');
  const O = await client('sec-out@example.com');
  assert.equal((await O.get('/api/saved-folders')).status, 200);
  assert.equal((await O.post('/api/auth/logout')).status, 200);
  assert.equal((await O.get('/api/saved-folders')).status, 401);
  const raw = request.agent(app);
  assert.equal((await raw.post('/api/saved-folders').send({ name: 'x' })).status, 403); // no csrf token at all
  await raw.get('/api/auth/csrf');
  assert.equal((await raw.post('/api/saved-folders').set('x-csrf-token', 'a'.repeat(64)).send({ name: 'x' })).status, 403); // wrong token
});

test('responses never contain secrets', async () => {
  const bodies = [await A.get('/api/auth/me'), await A.get('/api/conversations'), await A.get('/api/saved-professionals'), await A.get('/api/review-insights/mine')]
    .map((r) => JSON.stringify(r.body));
  for (const s of bodies) assert.doesNotMatch(s, /passwordHash|\$2[aby]\$|TokenHash|ResetExpires|JWT_SECRET|test-secret/);
  assert.doesNotMatch(JSON.stringify((await request(app).get('/api/professionals/' + proId)).body), /passwordHash|JWT_SECRET/);
});
