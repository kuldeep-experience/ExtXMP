import { test, expect } from '@playwright/test';
import { DEMO, api, login, withDb } from './helpers.js';

test('review insights are built from the real reviews and link back to them', async ({ page }) => {
  await login(page, DEMO.ava);
  const seededIds = await withDb(async (m) => (await m.connection.db.collection('reviewinsights').find().toArray()).map((d) => String(d.professional)));
  const all = (await api(page, 'GET', '/api/professionals?limit=50&sort=name')).body.data;
  const pro = all.find((p) => seededIds.includes(p._id));

  let generateCalls = 0;
  page.on('request', (r) => { if (r.url().includes('/generate')) generateCalls += 1; });
  await page.goto(`/professionals/${pro._id}`);
  const panel = page.locator('section[class*="rounded-2xl"]', { has: page.getByRole('heading', { name: 'Review insights' }) });
  await expect(panel).toBeVisible();
  await expect(panel.getByText('Demo analyzer', { exact: true })).toBeVisible(); // demo mode is labelled
  await expect(panel.getByText(/No AI model was used/)).toBeVisible();
  await expect(panel.getByText(/opinions, not verified facts/)).toBeVisible();

  const insight = (await api(page, 'GET', `/api/review-insights/professional/${pro._id}`)).body;
  expect(insight.status).toBe('ready');
  await expect(panel.getByText(`Based on ${insight.data.reviewsAnalyzed} reviews`)).toBeVisible();
  await expect(panel.getByText(/Last updated/)).toBeVisible();
  await expect(panel.getByText(new RegExp(`Based on ${insight.data.reviewsAnalyzed} approved reviews`))).toBeVisible();

  // sections expand and collapse
  const strengths = panel.getByRole('button', { name: /Frequently mentioned strengths/ });
  await expect(strengths).toHaveAttribute('aria-expanded', 'false');
  await strengths.click();
  await expect(strengths).toHaveAttribute('aria-expanded', 'true');

  // every item links to the original reviews, which are real, approved and visible
  const link = panel.getByRole('button', { name: /^View \d+ supporting reviews?$/ }).first();
  await link.click();
  const sources = (await api(page, 'GET', `/api/review-insights/professional/${pro._id}/sources?limit=50`)).body.data;
  expect(sources.length).toBe(insight.data.reviewsAnalyzed);
  const shown = await panel.locator('ul li[id^="source-"]').first().locator('p').nth(0).textContent();
  expect(shown.length).toBeGreaterThan(5);
  const allReviews = (await api(page, 'GET', `/api/professionals/${pro._id}/reviews?limit=50`)).body.data.map((r) => r.text);
  const bodyText = await panel.locator('ul li[id^="source-"]').first().locator('p.text-sm').textContent();
  expect(allReviews).toContain(bodyText); // the text on screen is a stored public review

  // caching: reloading neither regenerates nor changes the stored insight
  const stamp = insight.data.generatedAt;
  await page.reload();
  await expect(panel).toBeVisible();
  expect((await api(page, 'GET', `/api/review-insights/professional/${pro._id}`)).body.data.generatedAt).toBe(stamp);
  expect(generateCalls).toBe(0);
});

test('an insight that does not exist yet is generated on first view, then cached', async ({ page }) => {
  await login(page, DEMO.ava);
  const seededIds = await withDb(async (m) => (await m.connection.db.collection('reviewinsights').find().toArray()).map((d) => String(d.professional)));
  const all = (await api(page, 'GET', '/api/professionals?limit=50&sort=name')).body.data;
  const pro = all.find((p) => !seededIds.includes(p._id));
  await page.goto(`/professionals/${pro._id}`);
  const panel = page.locator('section[class*="rounded-2xl"]', { has: page.getByRole('heading', { name: 'Review insights' }) });
  await expect(panel.getByText('Demo analyzer', { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(panel.getByText(/Based on \d+ approved reviews/)).toBeVisible();
  const first = (await api(page, 'GET', `/api/review-insights/professional/${pro._id}`)).body;
  expect(first.status).toBe('ready');
  await page.reload();
  await expect(panel.getByText('Demo analyzer', { exact: true })).toBeVisible();
  const second = (await api(page, 'GET', `/api/review-insights/professional/${pro._id}`)).body;
  expect(second.data.generatedAt).toBe(first.data.generatedAt); // served from the cache
  // the dashboard shows insights for saved professionals
  await page.goto('/dashboard/review-insights');
  await expect(page.getByRole('heading', { name: 'Review Insights', level: 1 })).toBeVisible();
});
