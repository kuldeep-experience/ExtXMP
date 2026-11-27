import { test, expect } from '@playwright/test';
import { DEMO, api, login } from './helpers.js';

test('recently viewed, search history, comparisons, and clearing', async ({ page }) => {
  await login(page, DEMO.ava);
  for (const k of ['recently-viewed', 'search-history', 'recent-comparisons']) await api(page, 'DELETE', `/api/${k}/clear`);
  const pros = (await api(page, 'GET', '/api/professionals?limit=50&sort=name')).body.data;
  const [a, b, c] = pros.slice(0, 3);

  // profile views are tracked, once per visit window
  await page.goto(`/professionals/${a._id}`);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(a.fullName);
  await page.goto(`/professionals/${a._id}`);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(a.fullName);
  await page.goto(`/professionals/${b._id}`);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(b.fullName);

  // searches are tracked with their filters and result count
  await page.goto(`/professionals?category=${a.categorySlug}&minRating=3`);
  await expect(page.getByText(/Showing 1–/)).toBeVisible();
  await expect.poll(async () => (await api(page, 'GET', '/api/search-history')).body.data.length, { timeout: 8000 }).toBe(1);

  // comparisons
  await page.goto('/professionals');
  await page.getByRole('checkbox', { name: 'Compare' }).nth(0).check();
  await page.getByRole('checkbox', { name: 'Compare' }).nth(1).check();
  await page.getByRole('region', { name: 'Comparison' }).getByRole('button', { name: 'Compare' }).click();
  await expect(page.getByRole('heading', { name: 'Compare professionals' })).toBeVisible();
  await expect.poll(async () => (await api(page, 'GET', '/api/recent-comparisons')).body.data.length).toBe(1);

  await page.goto('/dashboard/recently-viewed');
  await expect(page.getByText('History tracking is on.')).toBeVisible();
  const viewed = page.locator('section', { has: page.getByRole('heading', { name: 'Recently viewed professionals' }) });
  await expect(viewed).toContainText(b.fullName); // newest first
  await expect(viewed).toContainText(a.fullName);
  const aCard = viewed.locator('div.rounded-2xl', { hasText: a.fullName }).first();
  await expect(aCard).toContainText('Viewed 1 time'); // two visits inside the window count once
  await expect(page.getByRole('heading', { name: 'Continue where you left off' })).toBeVisible();

  // repeat a search
  const searches = page.locator('section', { has: page.getByRole('heading', { name: 'Recent searches' }) });
  await expect(searches).toContainText('Rated 3+');
  await searches.getByRole('button', { name: 'Search again' }).click();
  await expect(page).toHaveURL(new RegExp(`category=${a.categorySlug}`));
  await expect(page).toHaveURL(/minRating=3/);

  // revisit a comparison
  await page.goto('/dashboard/recently-viewed');
  await page.getByRole('link', { name: 'Revisit comparison' }).click();
  await expect(page.getByRole('heading', { name: 'Compare professionals' })).toBeVisible();

  // remove single records
  await page.goto('/dashboard/recently-viewed');
  await page.getByRole('button', { name: `Remove ${a.fullName} from history` }).click();
  await expect(page.getByText('Removed from history.')).toBeVisible();
  await expect(aCard).toHaveCount(0);
  await page.getByRole('button', { name: 'Remove this search' }).click();
  await expect(page.getByText('Search removed.')).toBeVisible();

  // privacy: turn tracking off, nothing new is recorded
  await page.getByRole('button', { name: 'Turn off tracking' }).click();
  await expect(page.getByText('History tracking is off.', { exact: false }).first()).toBeVisible();
  const before = (await api(page, 'GET', '/api/recently-viewed')).body.pagination.total;
  await page.goto(`/professionals/${c._id}`);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(c.fullName);
  await page.waitForTimeout(600);
  expect((await api(page, 'GET', '/api/recently-viewed')).body.pagination.total).toBe(before);
  await page.goto('/dashboard/recently-viewed');
  await page.getByRole('button', { name: 'Turn on tracking' }).click();
  await expect(page.getByText('History tracking is on.')).toBeVisible();

  // clear everything
  await page.getByRole('button', { name: 'Clear all history' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText('No history yet')).toBeVisible();
  for (const k of ['recently-viewed', 'search-history', 'recent-comparisons']) expect((await api(page, 'GET', `/api/${k}`)).body.data).toHaveLength(0);
});

test('history retention and tracking settings live in Account Settings', async ({ page }) => {
  await login(page, DEMO.ava);
  await page.goto('/dashboard/settings#privacy');
  await expect(page.getByRole('heading', { name: 'Privacy & history' })).toBeVisible();
  await page.getByLabel('Delete history older than').selectOption('30');
  await expect(page.getByText('Privacy settings saved')).toBeVisible();
  expect((await api(page, 'GET', '/api/auth/me')).body.data.privacySettings.historyRetentionDays).toBe(30);
  await page.getByLabel('Delete history older than').selectOption('90');
});
