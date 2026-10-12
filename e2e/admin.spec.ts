import { expect, test } from '@playwright/test';
import { ADMIN, expectNoHorizontalOverflow, SLUG } from './helpers';

const runTag = `R${Date.now().toString(36)}`;

test.beforeAll(async ({ request }) => {
  // Self-contained data so this spec doesn't depend on test ordering.
  const ev = await (await request.get(`/api/v1/events/${SLUG}`)).json();
  const res = await request.post(`/api/v1/events/${ev.id}/registrations`, {
    headers: { 'Idempotency-Key': `e2e-admin-${runTag}-0000` },
    data: {
      representative: { name: `Admin Spec Rep ${runTag}`, contacts: { mobile: '09170000000', preferred: 'mobile' } },
      attendees: [
        { fullName: `Lola ${runTag}`, ageCategory: 'adult', rsvp: 'confirmed' },
        { fullName: `Apo ${runTag}`, ageCategory: 'child', rsvp: 'tentative' },
      ],
      acceptedPrivacy: true,
      consentVersion: ev.consentVersion,
    },
  });
  expect(res.status()).toBe(201);
});

test('admin signs in, sees headcount, finds and opens a registration', async ({ page }) => {
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/admin\/login/);
  await page.getByLabel('Email').fill(ADMIN.email);
  await page.getByLabel('Password').fill('wrong-password-x');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('Email or password is incorrect.')).toBeVisible();
  await page.getByLabel('Password').fill(ADMIN.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Headcount' })).toBeVisible();
  await expect(page.getByText('Potential (attending + maybe)')).toBeVisible();
  await expect(page.getByRole('table', { name: /by family branch/i })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Event day' })).toBeVisible();
  await expect(page.getByText('Checked in', { exact: true })).toBeVisible();
  await expect(page.getByText('Walk-ins', { exact: true })).toBeVisible();

  await page.getByRole('link', { name: 'Registrations', exact: true }).click();
  await page.getByLabel('Search').fill(`lola ${runTag}`);
  await page.getByRole('button', { name: 'Search' }).click();
  // Desktop shows a table and phones show cards; exactly one of them is visible.
  await expect(page.getByText(`Matches: Lola ${runTag}`).filter({ visible: true })).toBeVisible();
  await page.getByRole('link', { name: `Admin Spec Rep ${runTag}` }).click();
  await expect(page.getByRole('heading', { name: `Admin Spec Rep ${runTag}` })).toBeVisible();
  await expect(page.getByText(`Apo ${runTag}`)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'History' })).toBeVisible();
});

test('admin layout has no horizontal overflow on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto('/admin/login');
  await page.getByLabel('Email').fill(ADMIN.email);
  await page.getByLabel('Password').fill(ADMIN.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Headcount' })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test('event admin downloads exports and captures a snapshot', async ({ page }) => {
  await page.goto('/admin/login');
  await page.getByLabel('Email').fill(ADMIN.email);
  await page.getByLabel('Password').fill(ADMIN.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Headcount' })).toBeVisible();

  await page.getByRole('link', { name: 'Exports' }).click();
  const [xlsx] = await Promise.all([page.waitForEvent('download'), page.getByRole('listitem').filter({ hasText: 'Full report (Excel)' }).getByRole('link').click()]);
  expect(xlsx.suggestedFilename()).toMatch(/-report-\d+\.xlsx$/);
  const [csv] = await Promise.all([page.waitForEvent('download'), page.getByRole('listitem').filter({ hasText: /^Attendees/ }).getByRole('link').click()]);
  expect(csv.suggestedFilename()).toMatch(/-attendees-\d+\.csv$/);

  await page.getByRole('link', { name: 'Snapshots' }).click();
  await page.getByLabel('Label').fill(`E2E snapshot ${runTag}`);
  await page.getByRole('button', { name: 'Capture snapshot' }).click();
  await expect(page.getByText('Snapshot saved.')).toBeVisible();
  await expect(page.getByRole('heading', { name: `E2E snapshot ${runTag}` })).toBeVisible();

  await page.getByRole('link', { name: 'Duplicates' }).click();
  await expect(page.getByRole('heading', { name: 'Duplicate review' })).toBeVisible();
  await page.getByRole('link', { name: 'Emails' }).click();
  await expect(page.getByRole('heading', { name: 'Email delivery' })).toBeVisible();
});
