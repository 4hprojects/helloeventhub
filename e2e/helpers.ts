import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { expect, type APIRequestContext, type Page } from '@playwright/test';

export const ADMIN = { email: process.env.E2E_ADMIN_EMAIL ?? 'admin@local.test', password: process.env.E2E_ADMIN_PASSWORD ?? 'local-dev-password-123' };
export const SLUG = process.env.E2E_EVENT_SLUG ?? 'mb-wa-reunion-2026';

export async function adminApi(request: APIRequestContext) {
  const s = await (await request.get('/api/v1/auth/session')).json();
  const login = await request.post('/api/v1/auth/login', { headers: { 'X-CSRF-Token': s.csrfToken }, data: ADMIN });
  expect(login.ok()).toBeTruthy();
  const { csrfToken } = await login.json();
  const events = await (await request.get('/api/v1/admin/events')).json();
  const eventId: string = events.items[0].id;
  return { csrf: csrfToken as string, eventId };
}

/** Fail if the document is wider than the viewport (horizontal overflow). */
export async function expectNoHorizontalOverflow(page: Page) {
  const { sw, cw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  expect(sw, 'page should not scroll horizontally').toBeLessThanOrEqual(cw);
}

/** Latest dev-mailbox message (DEV_MAILBOX_DIR on the server) whose subject matches. */
export function latestMail(subjectIncludes: string, since: number): string | null {
  const dir = process.env.MAILBOX_DIR;
  if (!dir) throw new Error('MAILBOX_DIR not set');
  const files = readdirSync(dir)
    .map((f) => path.join(dir, f))
    .filter((f) => statSync(f).mtimeMs >= since)
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  for (const f of files) {
    const body = readFileSync(f, 'utf8');
    if (body.includes(subjectIncludes)) return body;
  }
  return null;
}

export async function fillPerson(page: Page, index: number, name: string, age: 'Adult' | 'Child', rsvp: 'Yes, attending' | 'Maybe' | 'Not attending') {
  const person = page.getByRole('listitem').filter({ hasText: `Person ${index}` });
  const words = name.split(' ');
  await person.getByLabel('Last name').fill(words.at(-1)!);
  await person.getByLabel('First name').fill(words.slice(0, -1).join(' '));
  await person.getByRole('radio', { name: age, exact: true }).check();
  await person.getByRole('radio', { name: rsvp, exact: true }).check();
}

/** Fill the representative's name fields from a "First … Last" string. */
export async function fillRepName(page: Page, name: string) {
  const words = name.split(' ');
  await page.getByLabel('Your last name').fill(words.at(-1)!);
  await page.getByLabel('Your first name').fill(words.slice(0, -1).join(' '));
}
