import { describe, expect, it } from 'vitest';
import { registrationCreateSchema } from '@heh/contracts';
import { emptyForm, fieldIdFor, formFromRegistration, formToBody, type FormState } from '../src/components/RegistrationForm';
import { fromZonedInput, toZonedInput } from '../src/lib/time';

const filled = (): FormState => ({
  ...emptyForm(),
  repLastName: 'Santos',
  repFirstName: 'Maria',
  repMiddleName: 'Reyes',
  email: '',
  mobile: '0917 123 4567',
  preferred: 'mobile',
  attendees: [
    { key: 'rep', isRep: true, lastName: 'stale', firstName: 'stale', middleName: '', ageCategory: 'adult', rsvp: 'confirmed' },
    { key: 'k2', lastName: 'Santos', firstName: 'Juan', middleName: '', ageCategory: 'child', rsvp: 'tentative' },
  ],
});

describe('formToBody', () => {
  it('produces a payload the shared schema accepts; the rep row uses the current rep name', () => {
    const body = formToBody(filled());
    expect(body.attendees[0]).toMatchObject({ lastName: 'Santos', firstName: 'Maria', middleName: 'Reyes' });
    const parsed = registrationCreateSchema.safeParse({ ...body, acceptedPrivacy: true, consentVersion: 'v1' });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.representative.contacts.email).toBeUndefined();
    expect(parsed.success && parsed.data.representative.name).toBe('Santos, Maria Reyes');
    expect(parsed.success && parsed.data.attendees.map((a) => a.fullName)).toEqual(['Santos, Maria Reyes', 'Santos, Juan']);
  });

  it('requires last and first name; middle name is optional', () => {
    const s = filled();
    const body = formToBody({ ...s, repLastName: '', attendees: [{ ...s.attendees[1]!, firstName: ' ' }] });
    const parsed = registrationCreateSchema.safeParse({ ...body, acceptedPrivacy: true, consentVersion: 'v1' });
    const paths = parsed.success ? [] : parsed.error.issues.map((i) => i.path.join('.'));
    expect(paths).toEqual(expect.arrayContaining(['representative.lastName', 'attendees.0.firstName']));
    expect(paths.some((p) => p.endsWith('middleName'))).toBe(false);
  });

  it('sends no attendees when "no one can attend" is ticked', () => {
    const body = formToBody({ ...filled(), noneAttending: true, noAttendeesReason: 'Abroad' });
    expect(body.attendees).toEqual([]);
    expect(body.noAttendeesReason).toBe('Abroad');
  });

  it('round-trips an existing registration with attendee ids', () => {
    const state = formFromRegistration({
      representativeName: 'Rep',
      contacts: { email: 'a@b.test', preferred: 'email' },
      eventCategoryId: null,
      attendees: [
        { id: '01ARZ3NDEKTSV4RRFFQ69G5FAV', fullName: 'Cruz, Ana Lim', nameParts: { lastName: 'Cruz', firstName: 'Ana', middleName: 'Lim' }, ageCategory: 'adult', rsvp: 'declined', categoryId: null, checkedInAt: null },
        { id: '01ARZ3NDEKTSV4RRFFQ69G5FAW', fullName: 'Legacy Person', nameParts: null, ageCategory: 'adult', rsvp: 'confirmed', categoryId: null, checkedInAt: null },
      ],
      noAttendeesReason: null,
      notes: null,
    });
    expect(formToBody(state).attendees[0]).toMatchObject({ publicId: '01ARZ3NDEKTSV4RRFFQ69G5FAV', rsvp: 'declined', lastName: 'Cruz', firstName: 'Ana', middleName: 'Lim' });
    // Names stored as a single field are split best-effort.
    expect(formToBody(state).attendees[1]).toMatchObject({ lastName: 'Person', firstName: 'Legacy', middleName: '' });
  });
});

describe('fieldIdFor', () => {
  it('maps server error paths to focusable field ids', () => {
    const s = filled();
    expect(fieldIdFor('representative.contacts.mobile', s)).toBe('rep-mobile');
    expect(fieldIdFor('attendees.1.lastName', s)).toBe('att-k2-last');
    expect(fieldIdFor('attendees.1.firstName', s)).toBe('att-k2-first');
    expect(fieldIdFor('representative.firstName', s)).toBe('rep-first');
    expect(fieldIdFor('attendees.1.rsvp', s)).toBe('att-k2-rsvp');
    expect(fieldIdFor('somethingElse', s)).toBe('form-top');
  });
});

describe('Asia/Manila datetime inputs', () => {
  it('converts wall-clock time to UTC and back', () => {
    expect(fromZonedInput('2026-10-20T23:59', 'Asia/Manila')).toBe('2026-10-20T15:59:00.000Z');
    expect(toZonedInput('2026-10-24T01:00:00.000Z', 'Asia/Manila')).toBe('2026-10-24T09:00');
    expect(fromZonedInput('', 'Asia/Manila')).toBeNull();
  });
});
