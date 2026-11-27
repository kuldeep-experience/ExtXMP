import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/evp_auth_test';
process.env.JWT_SECRET = 'test-secret-test-secret';
process.env.BCRYPT_ROUNDS = '4';
process.env.LOGIN_RATE_LIMIT_MAX = '5';
process.env.SENSITIVE_RATE_LIMIT_MAX = '1000';
const { default: app } = await import('../src/app.js');
const { connectDB } = await import('../src/config/db.js');
const { seedVisitors, DEMO_PASSWORD } = await import('../src/seed/visitors.js');
const { default: mongoose } = await import('mongoose');
const { default: Visitor } = await import('../src/models/Visitor.js');

// A browser-like client: keeps cookies and sends the CSRF header.
async function client() {
  const agent = request.agent(app);
  const { body } = await agent.get('/api/auth/csrf');
  const h = { 'x-csrf-token': body.csrfToken };
  const c = {
    agent,
    get: (u) => agent.get(u),
    post: (u, b = {}) => agent.post(u).set(h).send(b),
    patch: (u, b = {}) => agent.patch(u).set(h).send(b),
  };
  return c;
}
const emailLink = async (to) => {
  const res = await request(app).get(`/api/dev/emails?to=${encodeURIComponent(to)}`);
  assert.equal(res.status, 200);
  const link = res.body.data[0]?.link;
  return link && new URL(link).searchParams.get('token');
};
let n = 0;
const newUser = (over = {}) => ({ firstName: 'Test', lastName: 'User', email: `user${++n}@example.com`, password: 'Passw0rdOK', ...over });
const register = async (over) => { const c = await client(); const u = newUser(over); const r = await c.post('/api/auth/register', u); return { c, u, r }; };

before(async () => { await connectDB();
  await Promise.all(Object.values(mongoose.models).map((m) => m.init())); await seedVisitors(); });
after(async () => { await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });

test('seed creates 5+ demo visitors with hashed passwords that can log in', async () => {
  assert.ok(await Visitor.countDocuments() >= 5);
  const v = await Visitor.findOne({ email: 'emma.carter@example.com' }).select('+passwordHash');
  assert.match(v.passwordHash, /^\$2[aby]\$/);
  assert.notEqual(v.passwordHash, DEMO_PASSWORD);
  const c = await client();
  assert.equal((await c.post('/api/auth/login', { email: 'emma.carter@example.com', password: DEMO_PASSWORD })).status, 200);
});

test('register: creates account, sets HttpOnly cookie, never returns the hash', async () => {
  const { r, u } = await register();
  assert.equal(r.status, 201);
  assert.equal(r.body.data.email, u.email);
  assert.equal(r.body.data.role, 'visitor');
  assert.equal(r.body.data.emailVerified, false);
  assert.ok(!JSON.stringify(r.body).includes('passwordHash'));
  const cookie = r.headers['set-cookie'].find((c) => c.startsWith('evp_token='));
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=Lax/i);
  const stored = await Visitor.findOne({ email: u.email }).select('+passwordHash +emailVerificationTokenHash');
  assert.match(stored.passwordHash, /^\$2[aby]\$/);
  assert.notEqual(stored.emailVerificationTokenHash, await emailLink(u.email)); // only a hash is stored
});

test('register: validation, duplicates (case-insensitive) and privilege escalation', async () => {
  const c = await client();
  assert.equal((await c.post('/api/auth/register', newUser({ password: 'short1' }))).status, 400);
  assert.equal((await c.post('/api/auth/register', newUser({ password: 'onlyletters' }))).status, 400);
  assert.equal((await c.post('/api/auth/register', newUser({ email: 'not-an-email' }))).status, 400);
  assert.equal((await c.post('/api/auth/register', newUser({ firstName: '' }))).status, 400);
  for (const extra of [{ role: 'admin' }, { accountStatus: 'active' }, { emailVerified: true }, { passwordHash: 'x' }]) {
    const res = await c.post('/api/auth/register', newUser(extra));
    assert.equal(res.status, 400, JSON.stringify(extra));
  }
  const { u } = await register();
  const dup = await c.post('/api/auth/register', newUser({ email: u.email.toUpperCase() }));
  assert.equal(dup.status, 409);
});

test('CSRF: state-changing requests need a matching token', async () => {
  const agent = request.agent(app);
  assert.equal((await agent.post('/api/auth/login').send({ email: 'a@b.co', password: 'x' })).status, 403);
  await agent.get('/api/auth/csrf');
  const bad = await agent.post('/api/auth/login').set('x-csrf-token', 'f'.repeat(64)).send({ email: 'a@b.co', password: 'x' });
  assert.equal(bad.status, 403);
  assert.equal(bad.body.code, 'CSRF');
  // a different session's token does not work either
  const other = await client();
  const { body } = await other.get('/api/auth/csrf');
  const cross = await agent.post('/api/auth/login').set('x-csrf-token', body.csrfToken).send({ email: 'a@b.co', password: 'x' });
  assert.equal(cross.status, 403);
});

test('login: success, generic failures, suspended account', async () => {
  const { u } = await register();
  const c = await client();
  const ok = await c.post('/api/auth/login', { email: u.email.toUpperCase(), password: u.password });
  assert.equal(ok.status, 200);
  assert.ok(ok.headers['set-cookie'].some((x) => x.startsWith('evp_token=')));
  const wrongPw = await c.post('/api/auth/login', { email: u.email, password: 'WrongPass1' });
  const noUser = await c.post('/api/auth/login', { email: 'nobody@example.com', password: 'WrongPass1' });
  assert.equal(wrongPw.status, 401);
  assert.equal(noUser.status, 401);
  assert.equal(wrongPw.body.message, noUser.body.message); // no account enumeration
  const sus = await c.post('/api/auth/login', { email: 'suspended.demo@example.com', password: DEMO_PASSWORD });
  assert.equal(sus.status, 403);
});

test('private routes: require auth, return only the caller, never the hash', async () => {
  assert.equal((await request(app).get('/api/auth/me')).status, 401);
  assert.equal((await request(app).get('/api/auth/me').set('Authorization', 'Bearer abc')).status, 401);
  const a = await register(), b = await register();
  const meA = await a.c.get('/api/auth/me');
  const meB = await b.c.get('/api/auth/me');
  assert.equal(meA.body.data.email, a.u.email);
  assert.equal(meB.body.data.email, b.u.email);
  assert.ok(!JSON.stringify(meA.body).match(/passwordHash|TokenHash|ResetExpires/));
});

test('forged, tampered and expired tokens are rejected', async () => {
  const jwt = (await import('jsonwebtoken')).default;
  const { u } = await register();
  const id = String((await Visitor.findOne({ email: u.email }))._id);
  const get = (t) => request(app).get('/api/auth/me').set('Cookie', `evp_token=${t}`);
  assert.equal((await get(jwt.sign({}, 'wrong-secret-wrong-secret', { subject: id }))).status, 401);
  assert.equal((await get(jwt.sign({}, process.env.JWT_SECRET, { subject: id, expiresIn: -10 }))).status, 401);
  assert.equal((await get(jwt.sign({}, process.env.JWT_SECRET, { subject: id, algorithm: 'HS512' }))).status, 401);
  assert.equal((await get('garbage')).status, 401);
  assert.equal((await get(jwt.sign({}, process.env.JWT_SECRET, { subject: id }))).status, 200);
});

test('suspended account loses access to existing sessions', async () => {
  const { c, u } = await register();
  await Visitor.updateOne({ email: u.email }, { accountStatus: 'suspended' });
  assert.equal((await c.get('/api/auth/me')).status, 403);
});

test('logout clears the cookie and ends access', async () => {
  const { c } = await register();
  assert.equal((await c.get('/api/auth/me')).status, 200);
  const out = await c.post('/api/auth/logout');
  assert.equal(out.status, 200);
  assert.match(out.headers['set-cookie'].find((x) => x.startsWith('evp_token=')), /evp_token=;/);
  assert.equal((await c.get('/api/auth/me')).status, 401);
});

test('profile update: allowed fields, preferences merge, escalation blocked', async () => {
  const { c, u } = await register();
  const ok = await c.patch('/api/auth/profile', { firstName: 'Renamed', phone: '(555) 123-4567', notificationPreferences: { productUpdates: true } });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.data.firstName, 'Renamed');
  assert.equal(ok.body.data.phone, '(555) 123-4567');
  assert.equal(ok.body.data.notificationPreferences.productUpdates, true);
  assert.equal(ok.body.data.notificationPreferences.recommendations, true); // untouched
  assert.equal((await c.patch('/api/auth/profile', { notificationPreferences: { appointmentReminders: false } })).status, 400); // removed preference
  for (const bad of [{ role: 'admin' }, { email: 'x@y.co' }, { accountStatus: 'active' }, { emailVerified: true }, { passwordHash: 'x' }, { _id: '1' }, { phone: 'abc' }, { profileImage: 'javascript:alert(1)' }]) {
    assert.equal((await c.patch('/api/auth/profile', bad)).status, 400, JSON.stringify(bad));
  }
  const stored = await Visitor.findOne({ email: u.email });
  assert.equal(stored.role, 'visitor');
  assert.equal(stored.emailVerified, false);
  assert.equal((await request(app).patch('/api/auth/profile').send({})).status, 403); // no csrf
  const anon = await client();
  assert.equal((await anon.patch('/api/auth/profile', { firstName: 'X' })).status, 401);
});

test('change password: verifies current, rotates session, invalidates other sessions', async () => {
  const { c: c1, u } = await register();
  const c2 = await client();
  await c2.post('/api/auth/login', { email: u.email, password: u.password });
  assert.equal((await c1.patch('/api/auth/change-password', { currentPassword: 'Wrong1234', newPassword: 'NewPassw0rd' })).status, 400);
  assert.equal((await c1.patch('/api/auth/change-password', { currentPassword: u.password, newPassword: u.password })).status, 400);
  assert.equal((await c1.patch('/api/auth/change-password', { currentPassword: u.password, newPassword: 'weak' })).status, 400);
  await new Promise((r) => setTimeout(r, 1100)); // token iat has 1s resolution
  const ok = await c1.patch('/api/auth/change-password', { currentPassword: u.password, newPassword: 'NewPassw0rd' });
  assert.equal(ok.status, 200);
  assert.equal((await c1.get('/api/auth/me')).status, 200); // this session continues
  assert.equal((await c2.get('/api/auth/me')).status, 401); // other session is dead
  const fresh = await client();
  assert.equal((await fresh.post('/api/auth/login', { email: u.email, password: u.password })).status, 401);
  assert.equal((await fresh.post('/api/auth/login', { email: u.email, password: 'NewPassw0rd' })).status, 200);
});

test('password recovery: generic response, single-use token, expiry, session invalidation', async () => {
  const { c: session, u } = await register();
  const c = await client();
  const known = await c.post('/api/auth/forgot-password', { email: u.email });
  const unknown = await c.post('/api/auth/forgot-password', { email: 'ghost@example.com' });
  assert.equal(known.status, 200);
  assert.deepEqual(known.body, unknown.body);
  assert.equal(await emailLink('ghost@example.com'), undefined); // nothing sent for unknown accounts
  const t = await emailLink(u.email);
  assert.match(t, /^[a-f0-9]{64}$/);
  assert.equal((await c.post('/api/auth/reset-password', { token: 'a'.repeat(64), password: 'Another1pass' })).status, 400);
  assert.equal((await c.post('/api/auth/reset-password', { token: t, password: 'short' })).status, 400);
  await new Promise((r) => setTimeout(r, 1100));
  assert.equal((await c.post('/api/auth/reset-password', { token: t, password: 'Another1pass' })).status, 200);
  assert.equal((await c.post('/api/auth/reset-password', { token: t, password: 'Another2pass' })).status, 400); // single use
  assert.equal((await session.get('/api/auth/me')).status, 401); // old session ended
  assert.equal((await c.post('/api/auth/login', { email: u.email, password: u.password })).status, 401);
  assert.equal((await c.post('/api/auth/login', { email: u.email, password: 'Another1pass' })).status, 200);
});

test('password reset token expires', async () => {
  const { u } = await register();
  const c = await client();
  await c.post('/api/auth/forgot-password', { email: u.email });
  const t = await emailLink(u.email);
  await Visitor.updateOne({ email: u.email }, { passwordResetExpires: new Date(Date.now() - 1000) });
  assert.equal((await c.post('/api/auth/reset-password', { token: t, password: 'Another1pass' })).status, 400);
});

test('email verification: verify, single use, resend replaces old link', async () => {
  const { c, u } = await register();
  const first = await emailLink(u.email);
  assert.equal((await c.post('/api/auth/verify-email', { token: 'b'.repeat(64) })).status, 400);
  assert.equal((await c.post('/api/auth/resend-verification')).status, 200);
  const second = await emailLink(u.email);
  assert.notEqual(first, second);
  assert.equal((await c.post('/api/auth/verify-email', { token: first })).status, 400); // replaced
  assert.equal((await c.post('/api/auth/verify-email', { token: second })).status, 200);
  assert.equal((await c.get('/api/auth/me')).body.data.emailVerified, true);
  assert.equal((await c.post('/api/auth/verify-email', { token: second })).status, 400); // single use
  assert.equal((await c.post('/api/auth/resend-verification')).status, 400); // already verified
});

test('dev mailbox is dev-only: requires the "to" parameter', async () => {
  assert.equal((await request(app).get('/api/dev/emails')).status, 400);
});

test('login is rate limited per IP + email', async () => {
  const c = await client();
  const email = 'brute.force@example.com';
  for (let i = 0; i < 5; i++) assert.equal((await c.post('/api/auth/login', { email, password: 'WrongPass1' })).status, 401);
  assert.equal((await c.post('/api/auth/login', { email, password: 'WrongPass1' })).status, 429);
  // another account from the same IP is unaffected
  assert.equal((await c.post('/api/auth/login', { email: 'emma.carter@example.com', password: DEMO_PASSWORD })).status, 200);
});
