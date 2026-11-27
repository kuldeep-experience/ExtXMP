import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/evp_engagement_test';
process.env.JWT_SECRET = 'test-secret-test-secret';
process.env.BCRYPT_ROUNDS = '4';
process.env.SENSITIVE_RATE_LIMIT_MAX = '1000';
process.env.LOGIN_RATE_LIMIT_MAX = '1000';
const { default: app } = await import('../src/app.js');
const { connectDB } = await import('../src/config/db.js');
const { seed } = await import('../src/seed/index.js');
const { DEMO_PASSWORD } = await import('../src/seed/visitors.js');
const { default: mongoose } = await import('mongoose');
const { default: Visitor } = await import('../src/models/Visitor.js');
const { default: Professional } = await import('../src/models/Professional.js');
const { default: DevEmail } = await import('../src/models/DevEmail.js');
const { default: ExperienceEntry } = await import('../src/models/ExperienceEntry.js');
const { default: ServiceRecord } = await import('../src/models/ServiceRecord.js');
const { default: Conversation } = await import('../src/models/Conversation.js');
const { default: Message } = await import('../src/models/Message.js');

async function login(email) {
  const agent = request.agent(app);
  const { body } = await agent.get('/api/auth/csrf');
  const h = { 'x-csrf-token': body.csrfToken };
  assert.equal((await agent.post('/api/auth/login').set(h).send({ email, password: DEMO_PASSWORD })).status, 200);
  return { get: (u) => agent.get(u), post: (u, b = {}) => agent.post(u).set(h).send(b), patch: (u, b = {}) => agent.patch(u).set(h).send(b), del: (u) => agent.delete(u).set(h) };
}
const fresh = async (email, extra = {}) => {
  const { default: bcrypt } = await import('bcrypt');
  const visitor = await Visitor.create({ firstName: 'Zelda', lastName: 'Quillfeather', email, passwordHash: await bcrypt.hash(DEMO_PASSWORD, 4), emailVerified: true, ...extra });
  return { me: await login(email), visitor };
};
const DAY = 86400000;
let proIndex = 0;
const pro = async () => (await Professional.find({ profileStatus: 'active' }).sort({ fullName: 1 }).skip(proIndex++ % 30).limit(1).lean())[0];

before(async () => { await connectDB(); await Promise.all(Object.values(mongoose.models).map((m) => m.init())); await seed(); });
after(async () => { await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });

// ================= chat with professionals =================
test('chat: start a thread, add to it, read it back', async () => {
  const { me } = await fresh('chat1@example.com');
  const p = await pro();
  const first = await me.post('/api/conversations', { professionalId: String(p._id), message: '  Hello, I need help with taxes.  ', subject: 'Tax help' });
  assert.equal(first.status, 201);
  assert.equal(first.body.data.professional.fullName, p.fullName);
  assert.equal(first.body.data.subject, 'Tax help');
  assert.equal(first.body.data.messageCount, 1);
  assert.equal(first.body.message.body, 'Hello, I need help with taxes.');
  assert.equal(first.body.data.professional.contactEmail, undefined);

  const second = await me.post('/api/conversations', { professionalId: String(p._id), message: 'Following up.' });
  assert.equal(second.status, 200); // same professional: the same thread
  assert.equal(second.body.data._id, first.body.data._id);
  assert.equal(second.body.data.messageCount, 2);

  const sent = await me.post(`/api/conversations/${first.body.data._id}/messages`, { body: 'One more question.' });
  assert.equal(sent.status, 201);
  assert.equal(sent.body.data.senderType, 'visitor');
  const msgs = (await me.get(`/api/conversations/${first.body.data._id}/messages`)).body;
  assert.deepEqual(msgs.data.map((m) => m.body), ['Hello, I need help with taxes.', 'Following up.', 'One more question.']); // oldest first
  assert.equal(msgs.pagination.total, 3);
  const list = (await me.get('/api/conversations')).body.data;
  assert.equal(list.length, 1);
  assert.equal(list[0].lastMessagePreview, 'One more question.');
  assert.equal((await me.get(`/api/conversations/${first.body.data._id}`)).body.data.messageCount, 3);
  assert.equal((await me.get(`/api/conversations/${first.body.data._id}/messages?limit=2&page=2`)).body.data.length, 1);
});

test('chat: validation and limits', async () => {
  const { me, visitor } = await fresh('chat2@example.com');
  const p = await pro(), other = await pro();
  const start = (over) => me.post('/api/conversations', { professionalId: String(p._id), message: 'Hi', ...over });
  for (const over of [{ message: '' }, { message: '   ' }, { message: 'x'.repeat(2001) }, { subject: 'x'.repeat(101) }, { visitor: 'x' }, { professionalId: 'bad' }, { appointmentId: 'bad' }, { senderType: 'professional' }]) {
    assert.equal((await start(over)).status, 400, JSON.stringify(over).slice(0, 60));
  }
  assert.equal((await start({ professionalId: String(new mongoose.Types.ObjectId()) })).status, 404);
  const inactive = await Professional.findOne({ profileStatus: { $ne: 'active' } });
  assert.equal((await start({ professionalId: String(inactive._id) })).status, 404);
  assert.equal(await Conversation.countDocuments({ visitor: visitor._id }), 0); // nothing stored for rejected requests

  const linked = await me.post('/api/conversations', { professionalId: String(other._id), message: 'Second thread' });
  assert.equal(linked.status, 201);
  assert.equal(linked.body.data.appointment, undefined);

  const id = linked.body.data._id;
  for (const bad of [{}, { body: '' }, { body: 'x'.repeat(2001) }, { body: 'ok', senderType: 'professional' }, { message: 'wrong field' }]) assert.equal((await me.post(`/api/conversations/${id}/messages`, bad)).status, 400, JSON.stringify(bad).slice(0, 50));
  await Conversation.updateOne({ _id: id }, { messageCount: 500 });
  assert.equal((await me.post(`/api/conversations/${id}/messages`, { body: 'one too many' })).status, 400);
});

test('chat: unread messages, marking read, search and delete', async () => {
  const { me, visitor } = await fresh('chat3@example.com');
  const [p1, p2] = [await pro(), await pro()];
  const c1 = (await me.post('/api/conversations', { professionalId: String(p1._id), message: 'Question about roofing' })).body.data;
  const c2 = (await me.post('/api/conversations', { professionalId: String(p2._id), message: 'Question about taxes' })).body.data;
  // a reply from the professional (sample data: the POC has no professional inbox)
  await Message.create({ conversation: c1._id, visitor: visitor._id, professional: p1._id, senderType: 'professional', body: 'Happy to help.' });
  await Conversation.updateOne({ _id: c1._id }, { $inc: { messageCount: 1, unreadCount: 1 } });

  assert.equal((await me.get('/api/conversations/unread-count')).body.count, 1);
  assert.equal((await me.get('/api/conversations')).body.data.find((c) => c._id === c1._id).unreadCount, 1);
  const read = await me.post(`/api/conversations/${c1._id}/read`);
  assert.equal(read.body.marked, 1);
  assert.equal((await me.get('/api/conversations/unread-count')).body.count, 0);
  assert.ok((await me.get(`/api/conversations/${c1._id}/messages`)).body.data.find((m) => m.senderType === 'professional').readAt);

  assert.equal((await me.get('/api/conversations?q=roofing')).body.data.length, 1);
  assert.equal((await me.get(`/api/conversations?q=${encodeURIComponent(p2.fullName.split(' ')[1])}`)).body.data.some((c) => c._id === c2._id), true);
  assert.equal((await me.get('/api/conversations?q=.*')).body.data.length, 0);
  assert.equal((await me.get('/api/conversations?limit=500')).status, 400);

  assert.equal((await me.del(`/api/conversations/${c1._id}`)).status, 200);
  assert.equal(await Message.countDocuments({ conversation: c1._id }), 0);
  assert.equal((await me.del(`/api/conversations/${c1._id}`)).status, 404);
  assert.equal(await Message.countDocuments({ conversation: c2._id }), 1);
});

test('chat is private to the visitor, and the seeded demo account has threads with both sides', async () => {
  const a = await fresh('chat4@example.com');
  const b = await fresh('chat5@example.com');
  const p = await pro();
  const c = (await a.me.post('/api/conversations', { professionalId: String(p._id), message: 'Private question' })).body.data;
  assert.equal((await b.me.get(`/api/conversations/${c._id}`)).status, 404);
  assert.equal((await b.me.get(`/api/conversations/${c._id}/messages`)).status, 404);
  assert.equal((await b.me.post(`/api/conversations/${c._id}/messages`, { body: 'intruder' })).status, 404);
  assert.equal((await b.me.post(`/api/conversations/${c._id}/read`)).status, 404);
  assert.equal((await b.me.del(`/api/conversations/${c._id}`)).status, 404);
  assert.equal((await b.me.get('/api/conversations')).body.data.length, 0);
  assert.equal((await b.me.get('/api/conversations/unread-count')).body.count, 0);
  assert.equal((await a.me.get(`/api/conversations/${c._id}/messages`)).body.data.length, 1);
  // bob starting his own thread with the same professional is a separate thread
  assert.notEqual((await b.me.post('/api/conversations', { professionalId: String(p._id), message: 'Mine' })).body.data._id, c._id);

  const emma = await login('emma.carter@example.com');
  const threads = (await emma.get('/api/conversations')).body.data;
  assert.ok(threads.length >= 3);
  for (const t of threads) {
    const m = (await emma.get(`/api/conversations/${t._id}/messages`)).body.data;
    assert.ok(m.length >= 4 && m.some((x) => x.senderType === 'visitor') && m.some((x) => x.senderType === 'professional'));
  }
});

// ================= service records =================
const rec = (me, p, over = {}) => me.post('/api/service-records', { professionalId: String(p._id), serviceName: p.services[0], serviceDate: new Date(Date.now() - 20 * DAY).toISOString(), status: 'completed', amountCents: 125000, summary: 'Finished on time', ...over });

test('service records: create, read, edit, delete', async () => {
  const { me } = await fresh('svc1@example.com');
  const p = await pro();
  const res = await rec(me, p, { summary: '  Done  ' });
  assert.equal(res.status, 201);
  const r = res.body.data;
  assert.equal(r.professional.fullName, p.fullName);
  assert.equal(r.summary, 'Done');
  assert.equal(r.amountCents, 125000);
  assert.equal(r.currency, 'USD');
  assert.equal((await me.get(`/api/service-records/${r._id}`)).body.data.serviceName, p.services[0]);
  const edited = await me.patch(`/api/service-records/${r._id}`, { status: 'in_progress', amountCents: null, serviceName: 'Renamed service' });
  assert.deepEqual([edited.body.data.status, edited.body.data.amountCents, edited.body.data.serviceName], ['in_progress', null, 'Renamed service']);
  const defaults = await me.post('/api/service-records', { professionalId: String(p._id), serviceName: 'Check-up', serviceDate: new Date().toISOString() });
  assert.equal(defaults.body.data.status, 'completed'); // defaults
  assert.equal(defaults.body.data.amountCents, null);
  assert.equal((await me.del(`/api/service-records/${r._id}`)).status, 200);
  assert.equal((await me.del(`/api/service-records/${r._id}`)).status, 404);
  assert.equal((await me.get(`/api/service-records/${r._id}`)).status, 404);
});

test('service records: validation and links to experiences', async () => {
  const a = await fresh('svc2@example.com');
  const b = await fresh('svc3@example.com');
  const [p, other] = [await pro(), await pro()];
  for (const over of [{ serviceName: '' }, { serviceName: 'x'.repeat(101) }, { serviceDate: 'someday' }, { status: 'done' }, { amountCents: -5 }, { amountCents: 10.5 }, { amountCents: '100' }, { summary: 'x'.repeat(1001) }, { visitor: 'x' }, { professionalId: 'bad' }, { appointmentId: '507f1f77bcf86cd799439011' }]) {
    assert.equal((await rec(a.me, p, over)).status, 400, JSON.stringify(over).slice(0, 60));
  }
  assert.equal((await rec(a.me, { _id: new mongoose.Types.ObjectId(), services: ['x'] })).status, 404);
  const inactive = await Professional.findOne({ profileStatus: { $ne: 'active' } });
  assert.equal((await rec(a.me, inactive)).status, 404);

  const exp = (await ExperienceEntry.create({ visitor: a.visitor._id, professional: p._id, serviceUsed: 'x', experienceDate: new Date(Date.now() - 5 * DAY) }));
  assert.equal((await rec(a.me, p, { experienceId: String(exp._id) })).status, 201);
  assert.equal((await rec(a.me, other, { experienceId: String(exp._id) })).status, 400);
  assert.equal((await rec(b.me, p, { experienceId: String(exp._id) })).status, 404);
  assert.equal((await a.me.patch(`/api/service-records/${(await ServiceRecord.findOne({ visitor: a.visitor._id }))._id}`, { experience: String(exp._id) })).status, 400); // links cannot be changed afterwards
  assert.equal((await a.me.patch(`/api/service-records/${(await ServiceRecord.findOne({ visitor: a.visitor._id }))._id}`, {})).status, 400);
});

test('service records: filters, sorting, totals and privacy', async () => {
  const a = await fresh('svc4@example.com');
  const b = await fresh('svc5@example.com');
  const [p1, p2] = [await pro(), await pro()];
  await rec(a.me, p1, { serviceName: 'Roof repair', amountCents: 400000, serviceDate: new Date(Date.now() - 100 * DAY).toISOString(), summary: 'Replaced flashing' });
  await rec(a.me, p2, { serviceName: 'Tax filing', amountCents: 50000, serviceDate: new Date(Date.now() - 10 * DAY).toISOString(), status: 'in_progress' });
  await rec(a.me, p1, { serviceName: 'Inspection', amountCents: null, serviceDate: new Date(Date.now() - 50 * DAY).toISOString() });
  await rec(b.me, p1, { serviceName: 'Bobs private service', amountCents: 999 });

  const all = (await a.me.get('/api/service-records')).body;
  assert.equal(all.pagination.total, 3);
  assert.deepEqual(all.data.map((r) => r.serviceName), ['Tax filing', 'Inspection', 'Roof repair']); // most recent service first
  assert.equal(all.totalSpentCents, 450000);
  assert.deepEqual((await a.me.get('/api/service-records?sort=amount')).body.data.map((r) => r.serviceName)[0], 'Roof repair');
  assert.equal((await a.me.get('/api/service-records?status=in_progress')).body.data.length, 1);
  assert.equal((await a.me.get(`/api/service-records?professionalId=${p1._id}`)).body.data.length, 2);
  assert.equal((await a.me.get('/api/service-records?q=flashing')).body.data.length, 1); // summary
  assert.equal((await a.me.get('/api/service-records?q=tax')).body.data.length, 1);
  assert.equal((await a.me.get(`/api/service-records?q=${encodeURIComponent(p2.fullName.split(' ')[1])}`)).body.data.some((r) => r.serviceName === 'Tax filing'), true);
  const from = new Date(Date.now() - 60 * DAY).toISOString(), to = new Date(Date.now() - 20 * DAY).toISOString();
  assert.deepEqual((await a.me.get(`/api/service-records?from=${from}&to=${to}`)).body.data.map((r) => r.serviceName), ['Inspection']);
  assert.equal((await a.me.get('/api/service-records?limit=2&page=2')).body.data.length, 1);
  assert.equal((await a.me.get('/api/service-records?status=bogus')).status, 400);
  assert.equal((await a.me.get('/api/service-records?from=notadate')).status, 400);
  assert.equal((await a.me.get('/api/service-records?q=.*')).body.data.length, 0);

  const bobs = (await b.me.get('/api/service-records')).body.data[0];
  assert.equal((await a.me.get(`/api/service-records/${bobs._id}`)).status, 404);
  assert.equal((await a.me.patch(`/api/service-records/${bobs._id}`, { summary: 'hacked' })).status, 404);
  assert.equal((await a.me.del(`/api/service-records/${bobs._id}`)).status, 404);
  assert.equal((await b.me.get('/api/service-records')).body.totalSpentCents, 999);
});

// ================= timeline =================
test('timeline: experiences, service records and chats in one list', async () => {
  const a = await fresh('tl1@example.com');
  const b = await fresh('tl2@example.com');
  const [p1, p2] = [await pro(), await pro()];
  const dayAgo = (n) => new Date(Date.now() - n * DAY);
  await ExperienceEntry.create({ visitor: a.visitor._id, professional: p2._id, serviceUsed: 'Closing support', experienceDate: dayAgo(30), notes: 'Great closing', rating: 5 });
  await ServiceRecord.create({ visitor: a.visitor._id, professional: p1._id, serviceName: 'Tax filing', serviceDate: dayAgo(10), summary: 'Filed on time', status: 'completed', amountCents: 1000 });
  const chat = (await a.me.post('/api/conversations', { professionalId: String(p2._id), message: 'Hello', subject: 'Roof question' })).body.data;
  await Conversation.updateOne({ _id: chat._id }, { createdAt: dayAgo(5) });
  await ExperienceEntry.create({ visitor: b.visitor._id, professional: p1._id, serviceUsed: 'Bobs experience', experienceDate: dayAgo(1) });

  const tl = (await a.me.get('/api/experience-history/timeline')).body;
  assert.deepEqual(tl.data.map((i) => i.type), ['conversation', 'service', 'experience']); // newest first
  assert.equal(tl.pagination.total, 3);
  const dates = tl.data.map((i) => +new Date(i.date));
  assert.deepEqual(dates, [...dates].sort((x, y) => y - x));
  assert.equal(tl.data[0].title, 'Roof question');
  assert.ok(!tl.data.some((i) => i.type === 'appointment'));
  assert.equal(tl.data.find((i) => i.type === 'service').amountCents, 1000);
  assert.ok(tl.data.every((i) => i.professional.fullName && i.professional.contactEmail === undefined));

  const only = async (q) => (await a.me.get(`/api/experience-history/timeline?${q}`)).body.data.map((i) => i.type);
  assert.deepEqual(await only('types=experience'), ['experience']);
  assert.deepEqual((await only('types=service,conversation')).sort(), ['conversation', 'service']);
  assert.deepEqual(await only(`professionalId=${p1._id}`), ['service']);
  assert.deepEqual(await only('q=closing'), ['experience']);
  assert.deepEqual(await only('q=filed'), ['service']);
  assert.deepEqual(await only(`q=${encodeURIComponent(p2.fullName.split(' ')[1])}`.replace(/%/g, '%')), (await only(`q=${encodeURIComponent(p2.fullName.split(' ')[1])}`)));
  assert.deepEqual(await only(`from=${dayAgo(35).toISOString()}&to=${dayAgo(15).toISOString()}`), ['experience']);
  assert.deepEqual(await only('q=.*'), []);

  const p1page = (await a.me.get('/api/experience-history/timeline?limit=2&page=1')).body;
  const p2page = (await a.me.get('/api/experience-history/timeline?limit=2&page=2')).body;
  assert.deepEqual([...p1page.data, ...p2page.data].map((i) => i._id), tl.data.map((i) => i._id)); // pages stitch together exactly
  assert.equal(p2page.data.length, 1);
  assert.equal(p1page.pagination.totalPages, 2);

  for (const q of ['types=bogus', 'types=appointment', 'types=experience,nope', 'professionalId=bad', 'from=x', 'limit=500', 'page=0']) assert.equal((await a.me.get(`/api/experience-history/timeline?${q}`)).status, 400, q);
  const bobs = (await b.me.get('/api/experience-history/timeline')).body.data;
  assert.deepEqual(bobs.map((i) => i.title), ['Bobs experience']); // private to each visitor
});

test('timeline: the seeded demo account sees all three kinds of activity', async () => {
  const emma = await login('emma.carter@example.com');
  const tl = (await emma.get('/api/experience-history/timeline?limit=50')).body;
  const types = new Set(tl.data.map((i) => i.type));
  for (const t of ['experience', 'service', 'conversation']) assert.ok(types.has(t), `missing ${t}`);
  assert.ok(tl.pagination.total >= 12);
});

// ================= professional notification and simulated replies =================
const mails = async (to) => DevEmail.find({ to: to.toLowerCase() }).sort({ createdAt: 1 }).lean();

test('contacting a professional emails them; so does every new message', async () => {
  const { me, visitor } = await fresh('notify1@example.com');
  const p = await pro();
  const before = (await mails(p.contactEmail)).length;
  const c = (await me.post('/api/conversations', { professionalId: String(p._id), message: 'First hello' })).body.data;
  let list = await mails(p.contactEmail);
  assert.equal(list.length, before + 1);
  assert.equal(list.at(-1).to, p.contactEmail.toLowerCase());
  assert.ok(list.at(-1).subject.startsWith(`New message from ${visitor.firstName} ${visitor.lastName}`));
  assert.match(list.at(-1).text, /First hello/);
  assert.equal((await me.post(`/api/conversations/${c._id}/messages`, { body: 'Second note' })).status, 201);
  assert.equal((await me.post('/api/conversations', { professionalId: String(p._id), message: 'Third note' })).status, 200);
  list = await mails(p.contactEmail);
  assert.equal(list.length, before + 3);
  assert.match(list.at(-1).text, /Third note/);
  // a rejected request sends nothing
  assert.equal((await me.post(`/api/conversations/${c._id}/messages`, { body: '' })).status, 400);
  assert.equal((await mails(p.contactEmail)).length, before + 3);
});

test('simulate-reply: adds the professional message, unread count and an email to the visitor', async () => {
  const { me, visitor } = await fresh('sim1@example.com');
  const p = await pro();
  const c = (await me.post('/api/conversations', { professionalId: String(p._id), message: 'Can you help?' })).body.data;
  const send = (body) => me.post('/api/dev/simulate-reply', body);
  const r = await send({ conversationId: c._id, body: '  Yes, happy to help.  ' });
  assert.equal(r.status, 201);
  assert.equal(r.body.data.senderType, 'professional');
  assert.equal(r.body.data.body, 'Yes, happy to help.');
  const view = (await me.get(`/api/conversations/${c._id}`)).body.data;
  assert.deepEqual([view.messageCount, view.unreadCount, view.lastMessagePreview], [2, 1, 'Yes, happy to help.']);
  assert.equal((await me.get('/api/conversations/unread-count')).body.count, 1);
  const msgs = (await me.get(`/api/conversations/${c._id}/messages`)).body.data;
  assert.deepEqual(msgs.map((m) => m.senderType), ['visitor', 'professional']);
  const email = (await mails(visitor.email)).at(-1);
  assert.equal(email.subject, `${p.fullName} replied to your message on Experience.com`);
  assert.match(email.text, /happy to help/);
  await send({ conversationId: c._id, body: 'Another one' });
  assert.equal((await me.get('/api/conversations/unread-count')).body.count, 2);
  await me.post(`/api/conversations/${c._id}/read`);
  assert.equal((await me.get('/api/conversations/unread-count')).body.count, 0);
});

test('simulate-reply: validation, unknown conversation, CSRF, and replies stay private to the thread owner', async () => {
  const a = await fresh('sim2@example.com');
  const b = await fresh('sim3@example.com');
  const p = await pro();
  const c = (await a.me.post('/api/conversations', { professionalId: String(p._id), message: 'Private' })).body.data;
  for (const bad of [{}, { conversationId: c._id }, { body: 'x' }, { conversationId: 'bad', body: 'x' }, { conversationId: c._id, body: '   ' }, { conversationId: c._id, body: 'x'.repeat(2001) }, { conversationId: c._id, body: 'x', senderType: 'visitor' }]) {
    assert.equal((await a.me.post('/api/dev/simulate-reply', bad)).status, 400, JSON.stringify(bad).slice(0, 60));
  }
  assert.equal((await a.me.post('/api/dev/simulate-reply', { conversationId: String(new mongoose.Types.ObjectId()), body: 'x' })).status, 404);
  const raw = request.agent(app);
  await raw.get('/api/auth/csrf');
  assert.equal((await raw.post('/api/dev/simulate-reply').send({ conversationId: c._id, body: 'x' })).status, 403); // CSRF header required
  assert.equal(await Message.countDocuments({ conversation: c._id }), 1); // nothing stored for rejected requests
  await a.me.post('/api/dev/simulate-reply', { conversationId: c._id, body: 'Secret reply' });
  assert.equal((await b.me.get(`/api/conversations/${c._id}/messages`)).status, 404);
  assert.equal((await b.me.get('/api/conversations/unread-count')).body.count, 0);
  assert.equal((await a.me.get(`/api/conversations/${c._id}/messages`)).body.data.length, 2);
});
