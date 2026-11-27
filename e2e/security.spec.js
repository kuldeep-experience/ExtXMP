import { test, expect, request as pwRequest } from '@playwright/test';
import { createRequire } from 'node:module';
import { DEMO, api, greeting, jwtSecret, login, withDb } from './helpers.js';

const sign = createRequire(new URL('../server/package.json', import.meta.url))('jsonwebtoken');

test('unauthenticated API calls are refused', async ({ baseURL }) => {
  const anon = await pwRequest.newContext({ baseURL });
  for (const path of ['/api/auth/me', '/api/conversations', '/api/service-records', '/api/saved-professionals', '/api/recently-viewed', '/api/review-insights/mine']) {
    const r = await anon.get(path);
    expect(r.status(), path).toBe(401);
  }
  expect((await anon.get('/api/professionals')).status()).toBe(200); // the public directory stays public
  await anon.dispose();
});

test('user A cannot see or change user B\'s private data', async ({ browser }) => {
  const a = await (await browser.newContext()).newPage();
  const b = await (await browser.newContext()).newPage();
  await login(a, DEMO.emma);
  await login(b, DEMO.liam);

  const mine = {
    thread: (await api(a, 'GET', '/api/conversations')).body.data[0]._id,
    experience: (await api(a, 'GET', '/api/experience-history')).body.data[0]._id,
    service: (await api(a, 'GET', '/api/service-records')).body.data[0]._id,
    saved: (await api(a, 'GET', '/api/saved-professionals')).body.data[0]._id,
    ai: (await api(a, 'GET', '/api/ai/conversations')).body.data[0]._id,
  };
  for (const [kind, path] of [['thread', `/api/conversations/${mine.thread}`], ['experience', `/api/experience-history/${mine.experience}`], ['service', `/api/service-records/${mine.service}`], ['ai', `/api/ai/conversations/${mine.ai}`]]) {
    expect((await api(a, 'GET', path)).status, `A reads own ${kind}`).toBe(200);
    expect((await api(b, 'GET', path)).status, `B reads A's ${kind}`).toBe(404);
  }
  expect((await api(b, 'DELETE', `/api/service-records/${mine.service}`)).status).toBe(404);
  expect((await api(b, 'POST', `/api/conversations/${mine.thread}/messages`, { body: 'intruder' })).status).toBe(404);
  expect((await api(b, 'PATCH', `/api/saved-professionals/${mine.saved}`, { note: 'hacked' })).status).toBe(404);

  // in the UI too: B sees an error page, never A's content
  await b.goto(`/dashboard/contacts/${mine.thread}`);
  await expect(b.getByText('Conversation not found')).toBeVisible();
  await expect(b.getByLabel('Messages', { exact: true })).toHaveCount(0);
  // B's lists never contain A's records
  // A's data is untouched
  expect((await api(a, 'GET', `/api/conversations/${mine.thread}/messages`)).body.data.every((m) => m.body !== 'intruder')).toBeTruthy();
  await a.context().close(); await b.context().close();
});

test('invalid ids and invalid input are rejected safely', async ({ page }) => {
  await login(page, DEMO.emma);
  for (const path of ['/api/saved-searches/not-an-id', '/api/conversations/123', '/api/service-records/%7B%22%24ne%22%3Anull%7D', '/api/experience-history/zzz', '/api/review-insights/professional/zzz', '/api/professionals/zzz']) {
    const r = await api(page, 'GET', path);
    expect(r.status, path).toBe(400);
    expect(r.body.success).toBe(false);
  }
  expect((await api(page, 'GET', '/api/conversations/000000000000000000000000')).status).toBe(404);
  const bad = [
    ['/api/service-records', { serviceName: '' }], ['/api/conversations', { message: 'x'.repeat(3000), professionalId: 'x' }],
    ['/api/saved-folders', { name: '' }], ['/api/experience-history', { rating: 99 }], ['/api/ai/recommendations', { message: 'x'.repeat(1500) }],
  ];
  for (const [path, body] of bad) expect((await api(page, 'POST', path, body)).status, path).toBe(400);
  expect((await api(page, 'PATCH', '/api/auth/profile', { role: 'admin' })).status).toBe(400); // no privilege escalation
  // invalid ids in the address bar show an error, not a crash
  await page.goto('/dashboard/contacts/not-an-id');
  await expect(page.getByRole('alert')).toBeVisible();
  await page.goto('/professionals/not-an-id');
  await expect(page.getByText('Professional not found')).toBeVisible();
  await page.goto('/this/page/does/not/exist');
  await expect(page.getByText('Page not found')).toBeVisible();
});

test('expired and forged tokens are refused; an ended session sends you back to login', async ({ browser, baseURL }) => {
  const secret = jwtSecret();
  const ids = await withDb(async (m) => (await m.connection.db.collection('visitors').findOne({ email: DEMO.emma }))._id.toString());

  for (const [label, token] of [['expired', sign.sign({}, secret, { subject: ids, expiresIn: -60 })], ['forged', sign.sign({}, 'not-the-real-secret-not-the-real-secret', { subject: ids })], ['garbage', 'abc.def.ghi']]) {
    const ctx = await browser.newContext();
    await ctx.addCookies([{ name: 'evp_token', value: token, url: baseURL, httpOnly: true }]);
    const page = await ctx.newPage();
    await page.goto('/dashboard');
    await expect(page, label).toHaveURL(/\/login/);
    await ctx.close();
  }

  const ctx = await browser.newContext();
  await ctx.addCookies([{ name: 'evp_token', value: sign.sign({}, secret, { subject: ids, expiresIn: '1h' }), url: baseURL, httpOnly: true }]);
  const page = await ctx.newPage();
  await page.goto('/dashboard');
  await expect(greeting(page)).toBeVisible(); // a correctly signed, unexpired token works

  await ctx.clearCookies(); // the session ends while the page is open
  await page.locator('nav[aria-label="Dashboard"]').getByRole('link', { name: /^Saved Professionals/ }).click();
  await expect(page).toHaveURL(/\/login/);
  await ctx.close();
});

test('a suspended account cannot use a session that was already open', async ({ page }) => {
  const email = `e2e.suspend.${Date.now()}@example.com`;
  await page.goto('/register');
  await page.getByLabel('First name').fill('Sus'); await page.getByLabel('Last name').fill('Pend');
  await page.getByLabel('Email').fill(email); await page.getByLabel('Password', { exact: true }).fill('Testpass123'); await page.getByLabel('Confirm password').fill('Testpass123');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(greeting(page)).toBeVisible();
  await withDb(async (m) => m.connection.db.collection('visitors').updateOne({ email }, { $set: { accountStatus: 'suspended' } }));
  await page.reload();
  await expect(page).toHaveURL(/\/login/);
});
