import { test, expect } from '@playwright/test';
import { DEMO, api, login } from './helpers.js';

test('AI recommendations: natural language in, structured filters and real professionals out (demo mode)', async ({ page }) => {
  await login(page, DEMO.emma);
  await page.goto('/dashboard/ai-assistant');
  await expect(page.getByText('Demo mode.')).toBeVisible(); // clearly labelled
  expect((await api(page, 'GET', '/api/ai/status')).body.data).toMatchObject({ mode: 'demo', label: 'Demo mode' });

  // example question
  await page.locator('div.mx-auto.max-w-2xl').getByRole('button', { name: 'I need a mortgage professional with at least 5 years of experience.' }).click(); // the example list, not the saved conversation of the same name
  await expect(page).toHaveURL(/c=[a-f0-9]{24}/);
  const reply = page.locator('div.flex.gap-3', { hasText: 'What I understood' }).last();
  await expect(reply.getByText('Mortgage Professionals', { exact: true }).first()).toBeVisible(); // the structured filters it extracted
  await expect(reply.getByText('5+ years', { exact: true })).toBeVisible();
  await expect(reply.getByText(/Demo mode: understood with built-in keyword rules/)).toBeVisible();
  const cards = reply.getByRole('link', { name: 'View profile' });
  await expect(cards.first()).toBeVisible();

  // the recommended professionals are real records, shown with their stored facts
  const href = await cards.first().getAttribute('href');
  const id = href.split('/').pop();
  const real = (await api(page, 'GET', `/api/professionals/${id}`)).body.data;
  expect(real.categorySlug).toBe('mortgage-professionals');
  expect(real.yearsOfExperience).toBeGreaterThanOrEqual(5);
  const card = reply.locator('section[class*="rounded-2xl"]').first();
  await expect(card).toContainText(real.fullName);
  await expect(card).toContainText(real.averageRating.toFixed(1));
  await expect(card).toContainText(`${real.reviewCount} reviews`);
  await expect(card).toContainText(`${real.yearsOfExperience} yrs experience`);
  await expect(card).toContainText('Why this match');
  await expect(card).toContainText('Match score');

  // refine: the conversation remembers the earlier filters
  await page.getByRole('button', { name: 'Rated 4.5 or higher' }).click();
  const refined = page.locator('div.flex.gap-3', { hasText: 'What I understood' }).last();
  await expect(refined.getByText('Rated 4.5+', { exact: true })).toBeVisible();
  await expect(refined.getByText('Mortgage Professionals', { exact: true }).first()).toBeVisible();
  await expect(refined.getByText('5+ years', { exact: true })).toBeVisible();

  // a request the directory cannot satisfy gets an honest answer, not an invented professional
  await page.getByLabel('Message the assistant').fill('Find a financial advisor in Indore.');
  await page.keyboard.press('Enter');
  await expect(page.getByText(/No professionals in our directory match/)).toBeVisible();
  await expect(page.locator('div.flex.gap-3', { hasText: 'Indore' }).last().getByRole('link', { name: 'View profile' })).toHaveCount(0);

  // save a recommendation, open its profile
  await page.getByRole('button', { name: 'New conversation' }).click();
  await expect(page).not.toHaveURL(/c=/);
  await page.getByLabel('Message the assistant').fill('I need a real estate agent experienced in helping first-time home buyers.');
  await page.keyboard.press('Enter');
  const first = page.locator('div.flex.gap-3', { hasText: 'What I understood' }).last();
  await expect(first.getByRole('link', { name: 'View profile' }).first()).toBeVisible();
  const saveBtn = first.getByRole('button', { name: /^Save$/ }).first();
  const savedBefore = Object.keys((await api(page, 'GET', '/api/saved-professionals/ids')).body.data).length;
  if (await saveBtn.count()) {
    await saveBtn.click();
    await expect(page.getByText('Saved. Organize it in My Saved Professionals.')).toBeVisible();
    expect(Object.keys((await api(page, 'GET', '/api/saved-professionals/ids')).body.data).length).toBe(savedBefore + 1);
  }
  await first.getByRole('link', { name: 'View profile' }).first().click();
  await expect(page).toHaveURL(/\/professionals\/[a-f0-9]{24}/);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  // previous conversations are listed and can be reopened
  await page.goto('/dashboard/ai-assistant');
  const previous = page.locator('aside').getByRole('button', { name: /mortgage professional with at least 5 years/ }).first(); // the sidebar entry, not the example prompt
  await previous.click();
  await expect(page.getByText('Rated 4.5 or higher please.')).toBeVisible();
  const stored = (await api(page, 'GET', '/api/ai/conversations?limit=50')).body.data;
  expect(stored.length).toBeGreaterThanOrEqual(4);
});

test('the assistant asks for a location when "near me" has none, and rejects empty input', async ({ page }) => {
  await login(page, DEMO.emma);
  await page.goto('/dashboard/ai-assistant');
  await page.getByLabel('Message the assistant').fill('Find highly rated insurance professionals near my location.');
  await page.keyboard.press('Enter');
  await expect(page.getByText(/I need your location/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send' })).toBeDisabled(); // empty input cannot be sent
  const bad = await api(page, 'POST', '/api/ai/recommendations', { message: '' });
  expect(bad.status).toBe(400);
});
