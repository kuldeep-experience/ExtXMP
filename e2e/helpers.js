import fs from 'node:fs';
import { createRequire } from 'node:module';
import { expect } from '@playwright/test';
import { E2E_DB } from '../playwright.config.js';

const mongoose = createRequire(new URL('../server/package.json', import.meta.url))('mongoose'); // installed under server/

export const DEMO_PASSWORD = 'Demo@12345';
export const DEMO = { emma: 'emma.carter@example.com', liam: 'liam.nguyen@example.com', sofia: 'sofia.ramirez@example.com', noah: 'noah.fischer@example.com', ava: 'ava.thompson@example.com' };
export const greeting = (page) => page.getByRole('heading', { name: /^Good (morning|afternoon|evening),/ });

export async function login(page, email, password = DEMO_PASSWORD) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

// Calls the API from inside the page, so it uses the logged-in session cookie and CSRF protection like the app does.
export async function api(page, method, path, body) {
  return page.evaluate(async ({ method, path, body }) => {
    const csrf = (await (await fetch('/api/auth/csrf')).json()).csrfToken;
    const res = await fetch(path, { method, headers: { 'content-type': 'application/json', 'x-csrf-token': csrf }, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, body: await res.json().catch(() => null) };
  }, { method, path, body });
}

export async function withDb(fn) {
  await mongoose.connect(E2E_DB);
  try { return await fn(mongoose); } finally { await mongoose.disconnect(); }
}

// Same secret as the server under test, to forge tokens for the expiry test.
export function jwtSecret() {
  const env = fs.readFileSync(new URL('../server/.env', import.meta.url), 'utf8');
  return env.match(/^JWT_SECRET=(.+)$/m)[1].trim();
}
