import { test, expect } from '@playwright/test';
import { DEMO, api, login } from './helpers.js';

const SIZES = [['mobile', { width: 375, height: 812 }], ['tablet', { width: 768, height: 1024 }], ['desktop', { width: 1280, height: 800 }]];
const DASHBOARD = ['/dashboard', '/dashboard/discover', '/dashboard/saved', '/dashboard/experience-history', '/dashboard/experience-history?tab=experiences', '/dashboard/experience-history?tab=records',
  '/dashboard/search-preferences', '/dashboard/ai-assistant', '/dashboard/recently-viewed', '/dashboard/contacts', '/dashboard/contacts?tab=ai', '/dashboard/review-insights', '/dashboard/profile', '/dashboard/settings'];

// Anything that sticks out past the right edge of the viewport (ignoring fixed overlays and aria-hidden skeletons).
const overflowing = (page) => page.evaluate(() => {
  const vw = document.documentElement.clientWidth;
  const bad = [...document.querySelectorAll('#root *')].filter((e) => {
    if (e.closest('[aria-hidden="true"], .sr-only, .overflow-x-auto') || getComputedStyle(e).position === 'fixed') return false;
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.right > vw + 1;
  });
  return { horizontalScroll: document.documentElement.scrollWidth > vw + 1, bad: bad.slice(0, 3).map((e) => `${e.tagName}.${String(e.className).slice(0, 50)}`) };
});

for (const [name, size] of SIZES) {
  test(`every page fits and runs without errors on ${name} (${size.width}px)`, async ({ page }) => {
    test.setTimeout(120_000);
    const errors = [];
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`); });
    await page.setViewportSize(size);
    await login(page, DEMO.emma);

    const thread = (await api(page, 'GET', '/api/conversations')).body.data[0]._id;
    const pro = (await api(page, 'GET', '/api/professionals?limit=1&sort=reviews')).body.data[0]._id;
    const two = (await api(page, 'GET', '/api/professionals?limit=2')).body.data.map((p) => p._id).join(',');
    const pages = [...DASHBOARD, `/dashboard/contacts/${thread}`, '/', '/professionals', '/professionals?category=legal-professionals', `/professionals/${pro}`, `/compare?ids=${two}`];

    for (const path of pages) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      await expect(page.locator('main, #root').first()).toBeVisible();
      const o = await overflowing(page);
      expect(o, `${name} ${path} has content outside the screen`).toEqual({ horizontalScroll: false, bad: [] });
    }
    expect(errors).toEqual([]);

    // navigation works at this size: the sidebar on desktop, the drawer on smaller screens
    await page.goto('/dashboard');
    if (size.width < 1024) {
      await page.getByRole('button', { name: 'Open navigation' }).click();
      await expect(page.getByRole('dialog', { name: 'Navigation' })).toBeVisible();
      await page.getByRole('dialog', { name: 'Navigation' }).getByRole('link', { name: /^Saved Professionals/ }).click();
      await expect(page).toHaveURL(/\/dashboard\/saved/);
      await expect(page.getByRole('dialog', { name: 'Navigation' })).toHaveCount(0); // closes after navigating
    } else {
      await page.locator('nav[aria-label="Dashboard"]').getByRole('link', { name: /^Saved Professionals/ }).click();
      await expect(page).toHaveURL(/\/dashboard\/saved/);
    }
  });
}
