import { test, expect } from '@playwright/test';
import { DEMO, api, login, withDb } from './helpers.js';

test.describe('experience history', () => {
  test.beforeEach(async ({ page }) => { await login(page, DEMO.noah); });

  test('timeline shows every kind of activity and can be filtered', async ({ page }) => {
    await page.goto('/dashboard/experience-history');
    await expect(page.getByRole('heading', { name: 'My Experience History' })).toBeVisible();
    const items = page.locator('ol > li');
    await expect(items.first()).toBeVisible();
    const api0 = (await api(page, 'GET', '/api/experience-history/timeline?limit=50')).body;
    const kinds = new Set(api0.data.map((i) => i.type));
    for (const k of ['experience', 'service', 'conversation']) expect(kinds.has(k)).toBeTruthy(); // the demo account has all three
    // newest first
    const dates = api0.data.map((i) => +new Date(i.date));
    expect(dates).toEqual([...dates].sort((a, b) => b - a));

    // filter by kind
    await page.getByRole('button', { name: 'Service records' }).click();
    await expect(page).toHaveURL(/types=service/);
    await expect(items.filter({ hasText: 'Service record' })).not.toHaveCount(0);
    await expect.poll(async () => (await items.count()) - (await items.filter({ hasText: 'Service record' }).count())).toBe(0); // only service records are left
    await page.getByRole('button', { name: 'Service records' }).click(); // toggle off

    // search by professional name
    const first = api0.data.find((i) => i.type === 'experience');
    await page.getByLabel('Search timeline').fill(first.professional.fullName);
    await expect(page).toHaveURL(/q=/);
    await expect(items.first()).toContainText(first.professional.fullName.split(' ')[0]);
    const count = await items.count();
    for (let i = 0; i < count; i++) await expect(items.nth(i)).toContainText(first.professional.fullName);

    // a date range with nothing in it shows the empty state, and clearing restores the list
    await page.getByLabel('Search timeline').fill('');
    await page.getByLabel('From date').fill('2099-01-01');
    await expect(page.getByText('Nothing matches these filters')).toBeVisible();
    await page.getByRole('button', { name: 'Clear filters' }).click();
    await expect(items.first()).toBeVisible();
  });

  test('experience notes can be edited and are stored', async ({ page }) => {
    await page.goto('/dashboard/experience-history?tab=experiences');
    const first = page.getByRole('button', { name: /^Edit experience with/ }).first();
    await first.click();
    const dialog = page.getByRole('dialog', { name: 'Edit experience' });
    await dialog.getByLabel('Private notes').fill('E2E note: would hire again');
    await dialog.getByRole('button', { name: /^(Yes|Not sure|No)$/ }).first().click();
    await dialog.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('Experience updated')).toBeVisible();
    await expect(page.getByText('E2E note: would hire again')).toBeVisible();
    const stored = (await api(page, 'GET', '/api/experience-history?q=E2E note')).body;
    expect(stored.data).toHaveLength(1);
    // search and sort the list
    await page.getByLabel('Search experiences').fill('zzzzqqqq');
    await expect(page.getByText(/No experiences match/)).toBeVisible();
    await page.getByRole('button', { name: 'Clear search' }).click();
    await page.getByLabel('Sort by').selectOption({ label: 'Highest rated' });
    await expect(page).toHaveURL(/sort=rating/);
  });

  test('service records: add, filter, edit and delete', async ({ page }) => {
    await page.goto('/dashboard/experience-history?tab=records');
    await expect(page.getByText('Total tracked cost:')).toBeVisible();
    await page.getByRole('button', { name: 'Add service record' }).click();
    const dialog = page.getByRole('dialog', { name: 'Add a service record' });
    await dialog.getByRole('button', { name: 'Save record' }).click(); // required fields are checked first
    await expect(dialog.getByText('Choose a professional')).toBeVisible();
    await dialog.getByRole('option').first().click();
    await dialog.getByLabel('Service', { exact: true }).fill('E2E Service');
    await dialog.getByLabel('Date').fill('2026-10-01');
    await dialog.getByLabel('Status').selectOption({ label: 'In progress' });
    await dialog.getByLabel('Cost in USD (optional)').fill('123.45');
    await dialog.getByLabel('Summary (optional)').fill('Created by the browser test');
    await dialog.getByRole('button', { name: 'Save record' }).click();
    await expect(page.getByText('Service record saved')).toBeVisible();
    const card = page.locator('section[class*="rounded-2xl"]', { hasText: 'E2E Service' });
    await expect(card).toContainText('$123.45');
    await expect(card).toContainText('In progress');

    // filters
    await page.getByLabel('Search service records').fill('E2E Service');
    await expect(page).toHaveURL(/q=E2E/);
    await expect(page.getByText('E2E Service')).toHaveCount(1);
    await page.getByLabel('Status').selectOption({ label: 'Completed' });
    await expect(page.getByText('No service records match these filters')).toBeVisible();
    await page.getByRole('button', { name: 'Clear filters' }).click();

    // edit then delete
    await page.getByLabel('Search service records').fill('E2E Service');
    await page.getByRole('button', { name: 'Edit E2E Service' }).click();
    await page.getByRole('dialog').getByLabel('Status').selectOption({ label: 'Completed' });
    await page.getByRole('dialog').getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('Service record updated')).toBeVisible();
    await expect(card).toContainText('Completed');
    await page.getByRole('button', { name: 'Delete E2E Service' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByText('Service record deleted.')).toBeVisible();
    expect((await api(page, 'GET', '/api/service-records?q=E2E Service')).body.data).toHaveLength(0);
  });
});

test.describe('contacts: chat with professionals', () => {
  test.beforeEach(async ({ page }) => { await login(page, DEMO.noah); });

  test('read a seeded conversation, send a message, and see unread counts update', async ({ page }) => {
    const threads = (await api(page, 'GET', '/api/conversations')).body.data;
    expect(threads.length).toBeGreaterThanOrEqual(3);
    const unreadThread = threads.find((t) => t.unreadCount > 0) ?? threads[0];
    const unreadBefore = (await api(page, 'GET', '/api/conversations/unread-count')).body.count;

    await page.goto('/dashboard/contacts');
    await expect(page.getByRole('heading', { name: 'My Contacts', level: 1 })).toBeVisible();
    for (const t of threads) await expect(page.getByRole('link', { name: new RegExp(t.professional.fullName) }).first()).toBeVisible();

    await page.getByRole('link', { name: new RegExp(unreadThread.professional.fullName) }).first().click();
    await expect(page).toHaveURL(/\/dashboard\/contacts\//);
    const messages = page.getByLabel('Messages', { exact: true });
    await expect(messages).toContainText('Thanks for reaching out'); // the professional's sample reply
    await expect(messages).toContainText("I'd like some help with"); // the visitor's message
    if (unreadThread.unreadCount > 0) {
      await expect.poll(async () => (await api(page, 'GET', '/api/conversations/unread-count')).body.count).toBe(unreadBefore - unreadThread.unreadCount); // opening marks it read
    }

    await page.getByLabel('Write a message').fill('E2E: is Thursday possible?');
    await page.keyboard.press('Enter');
    await expect(messages).toContainText('E2E: is Thursday possible?');
    await page.reload();
    await expect(page.getByLabel('Messages', { exact: true })).toContainText('E2E: is Thursday possible?'); // stored in MongoDB
    const stored = (await api(page, 'GET', `/api/conversations/${unreadThread._id}/messages`)).body.data;
    expect(stored.at(-1)).toMatchObject({ senderType: 'visitor', body: 'E2E: is Thursday possible?' });
  });

  test('contact a professional from a profile, the professional is emailed, a reply comes back by email and in the chat', async ({ page }) => {
    const haveThread = new Set((await api(page, 'GET', '/api/conversations?limit=50')).body.data.map((t) => t.professional._id));
    const pro = (await api(page, 'GET', '/api/professionals?limit=50&sort=name')).body.data.find((p) => !haveThread.has(p._id));
    await page.goto(`/professionals/${pro._id}`);
    await page.getByRole('button', { name: 'Contact', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Contact a professional' });
    await dialog.getByRole('button', { name: 'Contact', exact: true }).click();
    await expect(dialog.getByText('Type a message')).toBeVisible();
    await dialog.getByLabel('Subject (optional)').fill('E2E question');
    await dialog.getByLabel('Message').fill('Hello from the browser test');
    await dialog.getByRole('button', { name: 'Contact', exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard\/contacts\/[a-f0-9]{24}/);
    await expect(page.getByLabel('Messages', { exact: true })).toContainText('Hello from the browser test');
    await expect(page.getByText('no professional inbox').first()).toBeVisible(); // the limitation is stated

    // the professional is told by email (dev mailbox) ...
    const proEmail = await withDb(async (m) => (await m.connection.db.collection('professionals').findOne({ _id: new m.Types.ObjectId(pro._id) })).contactEmail);
    const proMail = (await api(page, 'GET', `/api/dev/emails?to=${encodeURIComponent(proEmail)}`)).body.data;
    expect(proMail.some((e) => /^New message from Noah Fischer/.test(e.subject) && e.text.includes('Hello from the browser test'))).toBeTruthy();

    // ... and when they reply (simulated: the POC has no professional inbox) the visitor gets an email and sees it in the chat
    const threadId = page.url().split('/').pop();
    const sim = await api(page, 'POST', '/api/dev/simulate-reply', { conversationId: threadId, body: 'Happy to help, Thursday works.' });
    expect(sim.status).toBe(201);
    const visitorMail = (await api(page, 'GET', `/api/dev/emails?to=${DEMO.noah}`)).body.data;
    expect(visitorMail.some((e) => e.subject === `${pro.fullName} replied to your message on Experience.com`)).toBeTruthy();
    await page.goto('/dashboard');
    await expect(page.getByLabel(/\d+ unread messages/)).toBeVisible(); // the badge on My Contacts
    await page.goto(`/dashboard/contacts/${threadId}`);
    await expect(page.getByLabel('Messages', { exact: true })).toContainText('Happy to help, Thursday works.');

    await page.goto('/dashboard/contacts');
    await page.getByLabel('Search contacts').fill('E2E question');
    await expect(page.getByRole('link', { name: new RegExp(pro.fullName) })).toBeVisible();
    await page.getByRole('button', { name: `Delete contact ${pro.fullName}` }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByText('Contact deleted.')).toBeVisible();
    expect((await api(page, 'GET', '/api/conversations?q=E2E question')).body.data).toHaveLength(0);
  });

  test('assistant conversations live in their own tab', async ({ page }) => {
    await page.goto('/dashboard/contacts?tab=ai');
    await expect(page.getByRole('tab', { name: 'AI assistant', selected: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Open' }).first()).toBeVisible();
  });
});
