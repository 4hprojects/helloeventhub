import { expect, test } from '@playwright/test';
import { expectNoHorizontalOverflow, fillPerson, fillRepName, latestMail, SLUG } from './helpers';

test.describe('public registration (mobile)', () => {
  test('representative + 4 attendees end to end, with no horizontal overflow at 320px', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Alsem');
    await page.getByRole('link', { name: /register/i }).click();
    await expectNoHorizontalOverflow(page);
    const [ics] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Add to calendar' }).click(),
    ]);
    expect(ics.suggestedFilename()).toBe(`${SLUG}.ics`);
    await page.getByRole('link', { name: 'Register now' }).click();

    // Step 1: errors are summarized and focusable
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Please fix' })).toBeVisible();
    await expect(page.getByText('Provide at least one way to contact you').first()).toBeVisible();
    // The contact error belongs to the whole group, not to the Email box.
    await expect(page.locator('#rep-contacts')).toHaveClass(/border-danger/);
    await expect(page.locator('#rep-email')).not.toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#rep-contacts label').filter({ hasText: '(optional)' })).toHaveCount(0);
    await fillRepName(page, 'E2E Representative');
    await page.getByLabel('Email').fill('e2e-rep@example.test');
    await page.getByLabel('Philippine mobile number').fill('0917 123 4567');
    await page.getByRole('radio', { name: 'Email' }).check();
    await expectNoHorizontalOverflow(page);
    await page.getByRole('button', { name: 'Continue' }).click();

    // Step 2
    await expect(page.getByRole('heading', { name: 'Family branch' })).toBeVisible();
    await page.getByLabel('Family branch').selectOption({ label: '6. Toribio — Virginia Villanueva' });
    await page.getByRole('button', { name: 'Continue' }).click();

    // Step 3: rep not attending by default; add 4 people
    await expect(page.getByRole('heading', { name: 'Who is coming' })).toBeVisible();
    await expect(page.getByLabel(/am also attending/)).not.toBeChecked();
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByText('Add at least one attendee').first()).toBeVisible();
    for (let i = 1; i <= 4; i++) await page.getByRole('button', { name: /Add (a|another) person/ }).click();
    await fillPerson(page, 1, 'E2E Lola Uno', 'Adult', 'Yes, attending');
    await fillPerson(page, 2, 'E2E Tito Dos', 'Adult', 'Maybe');
    await fillPerson(page, 3, 'E2E Bata Tres', 'Child', 'Yes, attending');
    await fillPerson(page, 4, 'E2E Pinsan Kwatro', 'Adult', 'Not attending');
    await expectNoHorizontalOverflow(page);
    await page.getByRole('button', { name: 'Continue' }).click();

    // Step 4: review + consent
    await expect(page.getByText('2 attending · 1 maybe · 1 not attending')).toBeVisible();
    await page.getByRole('button', { name: 'Submit registration' }).click();
    await expect(page.getByText('Please accept the privacy notice').first()).toBeVisible();
    await page.getByLabel(/I have read the privacy notice/).check();
    await expectNoHorizontalOverflow(page);
    await page.getByRole('button', { name: 'Submit registration' }).click();

    await expect(page.getByRole('heading', { name: "You're registered!" })).toBeVisible();
    await expect(page.getByTestId('reference')).toHaveText(/^HEH-[0-9A-Z]{8}$/);
    await expect(page.getByText('Check your email')).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test('20 attendees do not break the layout; 21st cannot be added', async ({ page }) => {
    await page.goto(`/events/${SLUG}/register`);
    await fillRepName(page, 'Big Household Rep');
    await page.getByLabel('Facebook Messenger name').fill('Big Rep FB');
    await page.getByRole('radio', { name: 'Messenger' }).check();
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('button', { name: 'Continue' }).click();
    for (let i = 1; i <= 20; i++) {
      await page.getByRole('button', { name: /Add (a|another) person/ }).click();
      const person = page.getByRole('listitem').filter({ hasText: `Person ${i}` });
      await person.getByLabel('Last name').fill(`Member ${i}`);
      await person.getByLabel('First name').fill('Big Family');
      await person.getByRole('radio', { name: i % 4 ? 'Adult' : 'Child', exact: true }).check();
    }
    // One tap answers for everyone.
    await page
      .getByRole('group', { name: "Set everyone's answer" })
      .getByRole('button', { name: 'Yes, attending' })
      .click();
    await expect(page.getByRole('radio', { name: 'Yes, attending', exact: true, checked: true })).toHaveCount(
      20,
    );
    await expect(page.getByRole('button', { name: /Add (a|another) person/ })).toHaveCount(0);
    await expect(page.getByText('You can add up to 20 people')).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByLabel(/I have read the privacy notice/).check();
    await page.getByRole('button', { name: 'Submit registration' }).click();
    await expect(page.getByTestId('reference')).toBeVisible();
    await expect(page.getByText('No email confirmation')).toBeVisible();
  });

  test('keyboard-only: complete step 1 using Tab and Enter', async ({ page }) => {
    await page.goto(`/events/${SLUG}/register`);
    await page.getByLabel('Your last name').focus();
    await page.keyboard.type('User');
    await page.keyboard.press('Tab');
    await page.keyboard.type('Keyboard');
    await page.keyboard.press('Tab'); // middle name is optional
    await page.keyboard.press('Tab');
    await page.keyboard.type('kb@example.test');
    await expect(page.locator('#rep-email')).toHaveValue('kb@example.test');
    // Preferred radio appears once a method is entered; reach it by keyboard
    const radio = page.getByRole('radio', { name: 'Email' });
    await radio.focus();
    await page.keyboard.press('Space');
    await expect(radio).toBeChecked();
    await page.keyboard.press('Enter'); // submits the step form
    await expect(page.getByRole('heading', { name: 'Family branch' })).toBeFocused();
  });

  test('verified email link lets the owner change RSVP', async ({ page: first }) => {
    let page = first;
    const since = Date.now() - 1000;
    // Unique per run: access requests are limited to 3/hour per email by design.
    const email = `manage-${Date.now()}@example.test`;
    await page.goto(`/events/${SLUG}/register`);
    await fillRepName(page, 'Manage Owner');
    await page.locator('#rep-email').fill(email);
    await page.getByRole('radio', { name: 'Email' }).check();
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByLabel(/am also attending/).check();
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByLabel(/I have read the privacy notice/).check();
    await page.getByRole('button', { name: 'Submit registration' }).click();
    const reference = (await page.getByTestId('reference').textContent())!.trim();

    await page.goto('/registration/manage');
    await page.getByLabel('Email you registered with').fill(email);
    await page.getByLabel('Reference number').fill(reference);
    await page.getByRole('button', { name: 'Email me a link' }).click();
    await expect(page.getByText(/If the email and reference match/)).toBeVisible();

    let mail: string | null = null;
    for (let i = 0; i < 20 && !mail; i++) {
      mail = latestMail('manage your registration', since);
      if (!mail) await page.waitForTimeout(500);
    }
    expect(mail, 'manage-link email should arrive in dev mailbox').toBeTruthy();
    const link = mail!.match(/https?:\/\/\S+\/registration\/manage#t=[A-Za-z0-9_-]{43}/)![0];
    // Simulate clicking the email link: a fresh tab.
    const tab = await page.context().newPage();
    await tab.goto(link.replace(/^https?:\/\/[^/]+/, ''));
    await page.close();
    page = tab;
    await expect(page.getByRole('heading', { name: 'Your registration' })).toBeVisible();
    expect(page.url()).not.toContain('#t=');
    await expect(page.getByText(reference)).toBeVisible();
    await page.getByRole('button', { name: 'Change attendees' }).click();
    await page.getByRole('radio', { name: 'Maybe', exact: true }).check();
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('Your changes were saved.')).toBeVisible();
    await expect(page.getByText('Maybe', { exact: true })).toBeVisible();

    // Link is single-use
    await page.goto(link.replace(/^https?:\/\/[^/]+/, ''));
    await expect(page.getByText("This link can't be used")).toBeVisible();
  });
});
