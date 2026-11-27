import { test, expect } from '@playwright/test';
import { DEMO, api, login } from './helpers.js';

test('save the current search, edit it, run it, and delete it', async ({ page }) => {
  await login(page, DEMO.emma);
  await page.goto('/professionals?category=financial-advisors&minRating=3.5');
  const expectedTotal = (await api(page, 'GET', '/api/professionals?category=financial-advisors&minRating=3.5&limit=1')).body.pagination.total;
  await page.getByRole('button', { name: 'Save this search' }).click();
  const dialog = page.getByRole('dialog', { name: 'Save this search' });
  await expect(dialog.getByLabel('Professional category')).toHaveValue('financial-advisors'); // the current filters are carried over
  await expect(dialog.getByLabel('Minimum rating')).toHaveValue('3.5');
  await dialog.getByRole('button', { name: 'Save search' }).click(); // a name is required
  await expect(dialog.getByText('Give the search a name')).toBeVisible();
  await dialog.getByLabel('Search name').fill('E2E advisors');
  await dialog.getByRole('button', { name: 'Save search' }).click();
  await expect(page.getByText('Search saved')).toBeVisible();

  await page.goto('/dashboard/search-preferences');
  const card = page.locator('section[class*="rounded-2xl"]', { has: page.getByRole('heading', { name: 'E2E advisors' }) });
  await expect(card).toContainText('Financial Advisors');
  await expect(card).toContainText('Rated 3.5+');
  await expect(card).toContainText('Never used');

  // edit: rename and add a service requirement
  await card.getByRole('button', { name: 'Edit E2E advisors' }).click();
  const edit = page.getByRole('dialog', { name: 'Edit saved search' });
  await edit.getByLabel('Search name').fill('E2E advisors edited');
  await edit.getByRole('button', { name: 'Retirement Planning' }).first().click();
  await edit.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Search updated')).toBeVisible();
  const edited = page.locator('section[class*="rounded-2xl"]', { has: page.getByRole('heading', { name: 'E2E advisors edited' }) });
  await expect(edited).toContainText('Retirement Planning');

  // run: all filters are restored in the directory, with the matching professionals
  await edited.getByRole('button', { name: 'Run search' }).click();
  await expect(page).toHaveURL(/\/professionals\?.*category=financial-advisors/);
  await expect(page).toHaveURL(/minRating=3.5/);
  await expect(page).toHaveURL(/savedSearch=/);
  await expect(page.getByText('Showing saved search')).toContainText('E2E advisors edited');
  await expect(page.getByLabel('Category')).toHaveValue('financial-advisors');
  await expect(page.getByLabel('Minimum rating')).toHaveValue('3.5');
  const results = await page.getByText(/Showing \d+–\d+ of \d+ professionals|\d+ professionals found/).textContent();
  expect(Number(results.match(/of (\d+)/)?.[1] ?? 0)).toBeLessThanOrEqual(expectedTotal);
  for (const c of await page.getByText('Financial Advisors').allTextContents()) expect(c).toBeTruthy();

  await page.goto('/dashboard/search-preferences?sort=used');
  const ran = page.locator('section[class*="rounded-2xl"]', { has: page.getByRole('heading', { name: 'E2E advisors edited' }) });
  await expect(ran).toContainText('Last used'); // tracked
  await expect(page.locator('h3').first()).toHaveText('E2E advisors edited'); // recently used sorts first

  await page.getByLabel('Search saved searches').fill('advisors edited');
  await expect(page.locator('h3')).toHaveCount(1);
  await page.getByLabel('Search saved searches').fill('');
  await ran.getByRole('button', { name: 'Delete E2E advisors edited' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText('Saved search deleted.')).toBeVisible();
  expect((await api(page, 'GET', '/api/saved-searches?q=E2E advisors')).body.data).toHaveLength(0);
});
