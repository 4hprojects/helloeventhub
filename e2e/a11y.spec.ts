import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { ADMIN, fillRepName, SLUG } from './helpers';

/** WCAG 2.0/2.1 A + AA automated rules. Manual keyboard/screen-reader checks still apply (doc 05). */
async function expectNoViolations(page: Page, label: string) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const summary = results.violations.map(
    (v) =>
      `${v.id} (${v.impact}): ${v.help} — ${v.nodes
        .map((n) => n.target.join(' '))
        .slice(0, 3)
        .join(' | ')}`,
  );
  expect(summary, `${label} accessibility violations`).toEqual([]);
}

test('public pages pass automated WCAG AA checks', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expectNoViolations(page, 'landing');
  await page.goto(`/events/${SLUG}`);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expectNoViolations(page, 'event page');
  await page.goto(`/events/${SLUG}/register`);
  await expectNoViolations(page, 'step 1');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expectNoViolations(page, 'step 1 with errors');
  await fillRepName(page, 'Axe Tester');
  await page.locator('#rep-email').fill('axe@example.test');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expectNoViolations(page, 'step 2');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('radio', { name: /Yes, count me/ }).check();
  await page.getByRole('button', { name: /Add another person/ }).click();
  await expectNoViolations(page, 'step 3');
  for (const path of ['/privacy', '/contact', '/registration/manage']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expectNoViolations(page, path);
  }
});

test('admin pages pass automated WCAG AA checks', async ({ page }) => {
  await page.goto('/admin/login');
  await expectNoViolations(page, 'admin login');
  await page.getByLabel('Email').fill(ADMIN.email);
  await page.getByRole('textbox', { name: 'Password', exact: true }).fill(ADMIN.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Headcount' })).toBeVisible();
  await expectNoViolations(page, 'dashboard');
  for (const [link, heading] of [
    ['Registrations', 'Registrations'],
    ['Staff', 'Staff access'],
    ['Emails', 'Email delivery'],
    ['Settings', 'Event settings'],
  ] as const) {
    await page.getByRole('link', { name: link, exact: true }).click();
    await expect(page.getByRole('heading', { name: heading })).toBeVisible();
    await expectNoViolations(page, link);
  }
});
