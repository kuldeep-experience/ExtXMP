import { test, expect } from '@playwright/test';
import { DEMO, DEMO_PASSWORD, greeting, login } from './helpers.js';

const unique = (tag) => `e2e.${tag}.${Date.now()}@example.com`;

async function register(page, email, name = 'Zoe') {
  await page.goto('/register');
  await page.getByLabel('First name').fill(name);
  await page.getByLabel('Last name').fill('Tester');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('Testpass123');
  await page.getByLabel('Confirm password').fill('Testpass123');
  await page.getByRole('button', { name: 'Create account' }).click();
}

test.describe('authentication', () => {
  test('protected routes send signed-out visitors to the login page', async ({ page }) => {
    for (const path of ['/dashboard', '/dashboard/saved', '/dashboard/contacts']) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login/);
    }
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  });

  test('registration, session restore on refresh, logout and login', async ({ page }) => {
    const email = unique('reg');
    await register(page, email);
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(greeting(page)).toContainText('Zoe');
    await expect(page.getByText('to secure your account')).toBeVisible();

    await page.reload(); // the HttpOnly cookie restores the session
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(greeting(page)).toContainText('Zoe');

    await page.getByRole('button', { name: 'Log out' }).click();
    await expect(page).toHaveURL(/\/login/);
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/); // logged out for real

    await login(page, email, 'Testpass123');
    await expect(greeting(page)).toContainText('Zoe');
  });

  test('registration and login show clear errors', async ({ page }) => {
    await page.goto('/register');
    await page.getByLabel('First name').fill('A');
    await page.getByLabel('Last name').fill('B');
    await page.getByLabel('Email').fill(DEMO.emma); // already registered
    await page.getByLabel('Password', { exact: true }).fill('Testpass123');
    await page.getByLabel('Confirm password').fill('Testpass123');
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByText('An account with this email already exists').first()).toBeVisible();

    await page.getByLabel('Confirm password').fill('different');
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByText('Passwords do not match')).toBeVisible();

    await page.goto('/login');
    await page.getByLabel('Email').fill(DEMO.emma);
    await page.getByLabel('Password').fill('WrongPassword1');
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page.getByRole('alert')).toContainText('Invalid email or password');
    await expect(page).toHaveURL(/\/login/);

    await page.getByLabel('Email').fill('suspended.demo@example.com'); // a suspended account cannot log in even with the right password
    await page.getByLabel('Password').fill(DEMO_PASSWORD);
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page.getByRole('alert')).toContainText('not active');
  });

  test('email verification through the development mailbox', async ({ page }) => {
    const email = unique('verify');
    await register(page, email);
    await expect(page.getByText('to secure your account')).toBeVisible();
    await page.goto(`/dev/mailbox?email=${encodeURIComponent(email)}`);
    await expect(page.getByText('Development mailbox.')).toBeVisible();
    await page.locator('section', { hasText: 'Verify your Experience.com email address' }).getByRole('link', { name: /Open link/ }).click();
    await expect(page.getByText('Your email address is verified.')).toBeVisible();
    await page.goto('/dashboard');
    await expect(greeting(page)).toBeVisible();
    await expect(page.getByText('to secure your account')).toHaveCount(0);
  });

  test('password recovery: reset link, single use, new password works and old one does not', async ({ page }) => {
    const email = unique('reset');
    await register(page, email);
    await page.getByRole('button', { name: 'Log out' }).click();

    await page.goto('/forgot-password');
    await page.getByLabel('Email').fill(email);
    await page.getByRole('button', { name: 'Send reset link' }).click();
    await expect(page.getByText('If an account exists for that email')).toBeVisible();

    await page.goto(`/dev/mailbox?email=${encodeURIComponent(email)}`);
    const link = page.locator('section', { hasText: 'Reset your Experience.com password' }).getByRole('link', { name: /Open link/ });
    const href = await link.getAttribute('href');
    await link.click();
    await page.getByLabel('New password', { exact: true }).fill('Brandnew456');
    await page.getByLabel('Confirm new password').fill('Brandnew456');
    await page.getByRole('button', { name: 'Update password' }).click();
    await expect(page).toHaveURL(/\/login/);

    await page.goto(href); // the same link a second time
    await page.getByLabel('New password', { exact: true }).fill('Another789x');
    await page.getByLabel('Confirm new password').fill('Another789x');
    await page.getByRole('button', { name: 'Update password' }).click();
    await expect(page.getByRole('alert')).toContainText('invalid or has expired');

    await page.goto('/login');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill('Testpass123'); // the old password
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page.getByRole('alert')).toContainText('Invalid email or password');
    await login(page, email, 'Brandnew456');
    await expect(greeting(page)).toBeVisible();
  });

  test('change password from settings ends the other sessions', async ({ page, browser }) => {
    const email = unique('chg');
    await register(page, email);
    const other = await (await browser.newContext()).newPage();
    await login(other, email, 'Testpass123');
    await expect(greeting(other)).toBeVisible();

    await page.waitForTimeout(1100); // token timestamps have one second resolution
    await page.goto('/dashboard/settings');
    await page.getByLabel('Current password').fill('Testpass123');
    await page.getByLabel('New password', { exact: true }).fill('Changed4567');
    await page.getByLabel('Confirm new password').fill('Changed4567');
    await page.getByRole('button', { name: 'Update password' }).click();
    await expect(page.getByText('Password changed.')).toBeVisible();
    await page.reload();
    await expect(page).toHaveURL(/\/settings/); // this session continues

    await other.goto('/dashboard'); // the other device was signed out
    await expect(other).toHaveURL(/\/login/);
    await other.context().close();
  });
});
