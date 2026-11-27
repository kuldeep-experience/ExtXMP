import { test, expect } from '@playwright/test';
import { DEMO, api, login } from './helpers.js';

// Picks a professional the visitor has not saved yet.
async function unsavedProfessional(page) {
  const ids = (await api(page, 'GET', '/api/saved-professionals/ids')).body.data;
  const all = (await api(page, 'GET', '/api/professionals?limit=50&sort=name')).body.data;
  return all.find((p) => !ids[p._id]);
}

test('save and unsave professionals from the directory', async ({ page }) => {
  await login(page, DEMO.liam);
  const pro = await unsavedProfessional(page);
  await page.goto(`/professionals?q=${encodeURIComponent(pro.fullName)}`);
  const save = page.getByRole('button', { name: 'Save professional' });
  await expect(save).toHaveCount(1);
  await save.click();
  await expect(page.getByText('Saved. Organize it in My Saved Professionals.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Remove from saved professionals' })).toHaveAttribute('aria-pressed', 'true');
  expect((await api(page, 'GET', '/api/saved-professionals/ids')).body.data[pro._id]).toBeTruthy(); // really stored in MongoDB

  await page.reload(); // the bookmark state comes from the visitor's saved records
  await expect(page.getByRole('button', { name: 'Remove from saved professionals' })).toBeVisible();
  await page.getByRole('button', { name: 'Remove from saved professionals' }).click();
  await expect(page.getByText('Removed from saved professionals.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save professional' })).toBeVisible();
  expect((await api(page, 'GET', '/api/saved-professionals/ids')).body.data[pro._id]).toBeUndefined();
});

test('save from the profile page, then organize with folders and private notes', async ({ page }) => {
  await login(page, DEMO.liam);
  const pro = await unsavedProfessional(page);
  await page.goto(`/professionals/${pro._id}`);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Saved' })).toBeVisible();

  await page.goto('/dashboard/saved');
  const card = page.locator('section[class*="rounded-2xl"]', { has: page.getByRole('link', { name: pro.fullName }) });
  await expect(card).toBeVisible();
  await expect(card.getByText(/Saved on/)).toBeVisible(); // the saved date

  // folders: create, move into, show only that folder
  await page.getByRole('button', { name: 'New folder' }).click();
  await page.getByLabel('Folder name').fill('E2E Folder');
  await page.getByLabel('Description (optional)').fill('Created by the browser test');
  await page.getByRole('dialog').getByRole('button', { name: 'Create folder' }).click();
  await expect(page.getByText('Folder created')).toBeVisible();
  await card.getByLabel(`Folder for ${pro.fullName}`).selectOption({ label: 'E2E Folder' });
  await expect(page.getByText('Moved')).toBeVisible();
  await page.getByRole('button', { name: /^E2E Folder \d+$/ }).click();
  await expect(page).toHaveURL(/folder=/);
  await expect(page.getByRole('link', { name: pro.fullName })).toBeVisible();
  await page.getByRole('button', { name: /^All Saved/ }).click();

  // notes: add, edit, delete
  await card.getByRole('button', { name: 'Add a private note' }).click();
  await page.getByLabel('Only you can see this note').fill('Ask about weekend availability');
  await page.getByRole('button', { name: 'Save note' }).click();
  await expect(page.getByText('Note saved')).toBeVisible();
  await expect(card.getByText('Ask about weekend availability')).toBeVisible();
  await card.getByTitle('Edit note').click();
  await page.getByLabel('Only you can see this note').fill('Call on Monday instead');
  await page.getByRole('button', { name: 'Save note' }).click();
  await expect(card.getByText('Call on Monday instead')).toBeVisible();
  await card.getByTitle('Edit note').click();
  await page.getByRole('button', { name: 'Delete note' }).click();
  await expect(page.getByText('Note deleted')).toBeVisible();
  await expect(card.getByRole('button', { name: 'Add a private note' })).toBeVisible();

  // rename the folder, then delete it: the professional is kept, unfiled
  await page.getByRole('button', { name: 'Manage folder E2E Folder' }).click();
  await page.getByLabel('Folder name').fill('E2E Renamed');
  await page.getByRole('dialog').getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('button', { name: /^E2E Renamed \d+$/ })).toBeVisible();
  await page.getByRole('button', { name: 'Manage folder E2E Renamed' }).click();
  await page.getByRole('button', { name: 'Delete…' }).click();
  await page.getByRole('button', { name: 'Delete folder' }).click();
  await expect(page.getByRole('button', { name: /E2E Renamed/ })).toHaveCount(0);
  await expect(card).toBeVisible();
  await expect(card.getByLabel(`Folder for ${pro.fullName}`)).toHaveValue(''); // unfiled

  // search within saved, then remove
  await page.getByLabel('Search saved professionals').fill(pro.fullName.split(' ')[1]);
  await expect(card).toBeVisible();
  await page.getByLabel('Search saved professionals').fill('zzzzqqqq');
  await expect(page.getByText('No saved professionals match')).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await card.getByRole('button', { name: `Remove ${pro.fullName}` }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Remove' }).click();
  await expect(page.getByText('Removed from saved professionals.')).toBeVisible();
  await expect(page.getByRole('link', { name: pro.fullName })).toHaveCount(0);
  expect((await api(page, 'GET', '/api/saved-professionals/ids')).body.data[pro._id]).toBeUndefined();
});
