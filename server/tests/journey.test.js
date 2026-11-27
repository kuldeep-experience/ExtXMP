import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/evp_journey_test';
process.env.JWT_SECRET = 'test-secret-test-secret';
process.env.BCRYPT_ROUNDS = '4';
process.env.SENSITIVE_RATE_LIMIT_MAX = '1000';
process.env.LOGIN_RATE_LIMIT_MAX = '1000';
process.env.AI_RATE_LIMIT_MAX = '1000';
const { default: app } = await import('../src/app.js');
const { connectDB } = await import('../src/config/db.js');
const { seed } = await import('../src/seed/index.js');
const { DEMO_PASSWORD, demoVisitors } = await import('../src/seed/visitors.js');
const { default: mongoose } = await import('mongoose');
const { default: Visitor } = await import('../src/models/Visitor.js');
const { default: Professional } = await import('../src/models/Professional.js');
const { default: ServiceRecord } = await import('../src/models/ServiceRecord.js');
const { default: Conversation } = await import('../src/models/Conversation.js');
const { default: Message } = await import('../src/models/Message.js');
const { default: ExperienceEntry } = await import('../src/models/ExperienceEntry.js');
const { default: AIConversation } = await import('../src/models/AIConversation.js');
const { default: AIMessage } = await import('../src/models/AIMessage.js');
const { default: RecommendationSearch } = await import('../src/models/RecommendationSearch.js');

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
const DAY = 86400000;
const at = (days, hour = 10, min = 0) => { const d = new Date(Date.now() + days * DAY); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hour, min)); };
let proIndex = 0;
const pro = async () => (await Professional.find({ profileStatus: 'active' }).sort({ fullName: 1 }).skip(proIndex++ % 30).limit(1).lean())[0];

before(async () => { await connectDB(); await Promise.all(Object.values(mongoose.models).map((m) => m.init())); await seed(); });
after(async () => { await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });

// ================= seed =================
// ================= seed =================
test('seed: every demo visitor has 3 contacts with messages from both sides, 6 experiences and service records', async () => {
  const visitors = await Visitor.find({ email: { $in: demoVisitors.map((v) => v.email) } }).lean();
  assert.ok(visitors.length >= 5);
  const active = new Set((await Professional.find({ profileStatus: 'active' }).select('_id').lean()).map((p) => String(p._id)));
  const now = new Date();
  for (const v of visitors) {
    const convs = await Conversation.find({ visitor: v._id }).lean();
    assert.equal(convs.length, 3, v.email);
    for (const c of convs) {
      assert.ok(active.has(String(c.professional)));
      const msgs = await Message.find({ conversation: c._id }).lean();
      assert.equal(c.messageCount, msgs.length);
      assert.ok(msgs.some((m) => m.senderType === 'visitor') && msgs.some((m) => m.senderType === 'professional'), 'both sides wrote');
      assert.equal(c.unreadCount, msgs.filter((m) => m.senderType === 'professional' && !m.readAt).length);
    }
    const entries = await ExperienceEntry.find({ visitor: v._id }).lean();
    assert.equal(entries.length, 6, v.email);
    for (const e of entries) assert.ok(active.has(String(e.professional)) && e.experienceDate <= now && e.serviceUsed);
    const contacted = new Set(convs.map((c) => String(c.professional)));
    assert.ok(entries.filter((e) => contacted.has(String(e.professional))).length >= 2, 'experiences with professionals they contacted');
    const recs = await ServiceRecord.find({ visitor: v._id }).lean();
    const statuses = new Set(recs.map((r) => r.status));
    assert.ok(['completed', 'in_progress', 'planned'].every((x) => statuses.has(x)), v.email);
    assert.ok(recs.filter((r) => r.experience && r.status === 'completed').length >= 2, 'completed records linked to experiences');
    for (const r of recs) assert.ok(!('appointment' in r) && (!r.experience || entries.some((e) => String(e._id) === String(r.experience))));
  }
});

// ================= access control =================
test('every endpoint requires authentication and a CSRF token', async () => {
  const anon = request.agent(app);
  const { body } = await anon.get('/api/auth/csrf');
  const h = { 'x-csrf-token': body.csrfToken };
  const id = new mongoose.Types.ObjectId();
  const calls = [
    anon.get('/api/experience-history'), anon.post('/api/experience-history').set(h).send({}), anon.get(`/api/experience-history/${id}`), anon.patch(`/api/experience-history/${id}`).set(h).send({}), anon.delete(`/api/experience-history/${id}`).set(h),
    anon.patch(`/api/ai/conversations/${id}`).set(h).send({ title: 'x' }), anon.delete(`/api/ai/conversations/${id}`).set(h),
  ];
  for (const r of await Promise.all(calls)) assert.equal(r.status, 401);
  const { me } = await fresh('csrf-j@example.com');
  assert.ok(me);
  const raw = request.agent(app);
  await raw.get('/api/auth/csrf');
  assert.equal((await raw.post('/api/experience-history').send({})).status, 403);
});

// ================= experience history =================
const exp = (me, p, over = {}) => me.post('/api/experience-history', { professionalId: String(p._id), serviceUsed: p.services[0], experienceDate: at(-20).toISOString(), rating: 4, wouldRecommend: 'yes', notes: 'Went well', ...over });

test('experience: log, read, edit and delete', async () => {
  const { me } = await fresh('exp1@example.com');
  const p = await pro();
  const res = await exp(me, p, { notes: '  Helpful and clear  ' });
  assert.equal(res.status, 201);
  const e = res.body.data;
  assert.equal(e.professional.fullName, p.fullName);
  assert.equal(e.notes, 'Helpful and clear');
  assert.equal(e.rating, 4);
  assert.equal(e.appointment, undefined);
  assert.equal((await me.get(`/api/experience-history/${e._id}`)).body.data.serviceUsed, p.services[0]);

  const edited = await me.patch(`/api/experience-history/${e._id}`, { rating: 2, wouldRecommend: 'unsure', notes: 'On reflection, slow', serviceUsed: 'Other service' });
  assert.equal(edited.status, 200);
  assert.deepEqual([edited.body.data.rating, edited.body.data.wouldRecommend, edited.body.data.serviceUsed], [2, 'unsure', 'Other service']);
  assert.equal((await me.patch(`/api/experience-history/${e._id}`, { rating: null, wouldRecommend: null })).body.data.rating, null);
  for (const bad of [{}, { professional: String(p._id) }, { appointmentId: 'x' }, { visitor: 'x' }, { rating: 6 }, { rating: 0 }, { rating: 3.5 }, { notes: 'x'.repeat(1001) }, { serviceUsed: '' }, { experienceDate: 'soon' }, { experienceDate: at(10).toISOString() }]) {
    assert.equal((await me.patch(`/api/experience-history/${e._id}`, bad)).status, 400, JSON.stringify(bad));
  }
  assert.equal((await me.del(`/api/experience-history/${e._id}`)).status, 200);
  assert.equal((await me.del(`/api/experience-history/${e._id}`)).status, 404);
  assert.equal((await me.get(`/api/experience-history/${e._id}`)).status, 404);
});

test('experience: validation on create', async () => {
  const { me } = await fresh('exp2@example.com');
  const p = await pro();
  for (const over of [{ serviceUsed: '' }, { experienceDate: at(30).toISOString() }, { experienceDate: 'x' }, { rating: 9 }, { wouldRecommend: 'maybe' }, { visitor: 'x' }, { professionalId: 'bad' }, { appointmentId: '507f1f77bcf86cd799439011' }]) {
    assert.equal((await exp(me, p, over)).status, 400, JSON.stringify(over));
  }
  assert.equal((await exp(me, { _id: new mongoose.Types.ObjectId(), services: ['x'] })).status, 404);
  const inactive = await Professional.findOne({ profileStatus: { $ne: 'active' } });
  assert.equal((await exp(me, inactive)).status, 404);
  assert.equal((await exp(me, p, { rating: undefined, wouldRecommend: undefined, notes: undefined })).status, 201); // only the service and date are required
});

test('experience: search, filter, sort and paginate; private to the visitor', async () => {
  const a = await fresh('exp5@example.com');
  const b = await fresh('exp6@example.com');
  const [p1, p2] = [await pro(), await pro()];
  await exp(a.me, p1, { serviceUsed: 'Tax filing', notes: 'Patient with my questions', rating: 5, experienceDate: at(-100).toISOString() });
  await exp(a.me, p2, { serviceUsed: 'Closing support', notes: 'Slow replies', rating: 2, experienceDate: at(-10).toISOString() });
  await exp(a.me, p1, { serviceUsed: 'Annual review', notes: 'Fine', rating: 3, experienceDate: at(-50).toISOString() });
  await exp(b.me, p1, { serviceUsed: 'Tax filing', notes: 'bob only' });

  const list = (await a.me.get('/api/experience-history')).body;
  assert.equal(list.pagination.total, 3);
  assert.deepEqual(list.data.map((e) => e.rating), [2, 3, 5]); // newest experience first
  assert.deepEqual((await a.me.get('/api/experience-history?sort=rating')).body.data.map((e) => e.rating), [5, 3, 2]);
  assert.equal((await a.me.get('/api/experience-history?q=tax')).body.data.length, 1); // service
  assert.equal((await a.me.get('/api/experience-history?q=slow')).body.data.length, 1); // notes
  assert.equal((await a.me.get(`/api/experience-history?q=${encodeURIComponent(p2.fullName.split(' ')[1])}`)).body.data.length >= 1, true); // professional name
  assert.equal((await a.me.get(`/api/experience-history?professionalId=${p1._id}`)).body.data.length, 2);
  assert.equal((await a.me.get('/api/experience-history?q=.*')).body.data.length, 0);
  assert.equal((await a.me.get('/api/experience-history?limit=2&page=2')).body.data.length, 1);
  assert.equal((await a.me.get('/api/experience-history?sort=bad')).status, 400);

  const bobs = (await b.me.get('/api/experience-history')).body.data;
  assert.equal(bobs.length, 1);
  assert.equal((await a.me.get(`/api/experience-history/${bobs[0]._id}`)).status, 404);
  assert.equal((await a.me.patch(`/api/experience-history/${bobs[0]._id}`, { notes: 'x' })).status, 404);
  assert.equal((await a.me.del(`/api/experience-history/${bobs[0]._id}`)).status, 404);
  assert.equal((await b.me.get('/api/experience-history')).body.data[0].notes, 'bob only');
});

// ================= conversations (rename, search, delete) =================
test('conversations: rename, search, delete with their messages; private to the visitor', async () => {
  const a = await fresh('conv-a@example.com');
  const b = await fresh('conv-b@example.com');
  const r1 = await a.me.post('/api/ai/recommendations', { message: 'I need a mortgage professional with at least 5 years of experience.' });
  const r2 = await a.me.post('/api/ai/recommendations', { message: 'Find a financial advisor in Charlotte.' });
  const c1 = r1.body.data.conversation._id, c2 = r2.body.data.conversation._id;
  assert.equal((await a.me.get('/api/ai/conversations?q=mortgage')).body.data.length, 1);
  assert.equal((await a.me.get('/api/ai/conversations?q=.*')).body.data.length, 0);

  const renamed = await a.me.patch(`/api/ai/conversations/${c1}`, { title: 'Mortgage ideas' });
  assert.equal(renamed.status, 200);
  assert.equal(renamed.body.data.title, 'Mortgage ideas');
  assert.equal((await a.me.get('/api/ai/conversations?q=ideas')).body.data[0]._id, c1);
  for (const bad of [{}, { title: '' }, { title: 'x'.repeat(81) }, { title: 'ok', messageCount: 0 }]) assert.equal((await a.me.patch(`/api/ai/conversations/${c1}`, bad)).status, 400);

  assert.equal((await b.me.patch(`/api/ai/conversations/${c1}`, { title: 'hacked' })).status, 404);
  assert.equal((await b.me.del(`/api/ai/conversations/${c1}`)).status, 404);
  assert.equal((await AIConversation.findById(c1)).title, 'Mortgage ideas');

  assert.equal(await AIMessage.countDocuments({ conversation: c1 }), 2);
  assert.equal((await a.me.del(`/api/ai/conversations/${c1}`)).status, 200);
  assert.equal(await AIMessage.countDocuments({ conversation: c1 }), 0);
  assert.equal(await RecommendationSearch.countDocuments({ conversation: c1 }), 0);
  assert.equal(await AIConversation.countDocuments({ _id: c1 }), 0);
  assert.equal((await a.me.del(`/api/ai/conversations/${c1}`)).status, 404);
  assert.equal(await AIMessage.countDocuments({ conversation: c2 }), 2); // other conversations untouched
});
