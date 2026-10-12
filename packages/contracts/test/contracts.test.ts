import { describe, expect, it } from 'vitest';
import {
  contactsSchema,
  isAllowedMessengerUrl,
  normalizeName,
  normalizePhMobile,
  registrationCreateSchema,
} from '../src/index.js';

describe('normalizePhMobile', () => {
  it.each([
    ['0917 123 4567', '+639171234567'],
    ['+63 917-123-4567', '+639171234567'],
    ['639171234567', '+639171234567'],
    ['9171234567', '+639171234567'],
  ])('%s -> %s', (input, out) => expect(normalizePhMobile(input)).toBe(out));
  it.each(['12345', '0817 123 4567', '+1 917 123 4567', 'abc'])('rejects %s', (input) =>
    expect(normalizePhMobile(input)).toBeNull(),
  );
});

describe('normalizeName', () => {
  it('folds case, accents and punctuation', () => {
    expect(normalizeName('  José  Dela-Cruz Jr. ')).toBe('jose dela cruz jr');
  });
});

describe('isAllowedMessengerUrl', () => {
  it('allows facebook and m.me https links', () => {
    expect(isAllowedMessengerUrl('https://m.me/someone')).toBe(true);
    expect(isAllowedMessengerUrl('https://www.facebook.com/someone')).toBe(true);
  });
  it('rejects javascript, http and other hosts', () => {
    expect(isAllowedMessengerUrl('javascript:alert(1)')).toBe(false);
    expect(isAllowedMessengerUrl('http://facebook.com/x')).toBe(false);
    expect(isAllowedMessengerUrl('https://facebook.com.evil.com/x')).toBe(false);
  });
});

describe('contactsSchema', () => {
  it('requires at least one contact', () => {
    const r = contactsSchema.safeParse({ preferred: 'email' });
    expect(r.success).toBe(false);
  });
  it('says "provide a contact" (not "choose preferred") when everything is empty', () => {
    const r = contactsSchema.safeParse({ email: '', mobile: '' });
    expect(r.success).toBe(false);
    expect(r.error!.issues.map((i) => i.message)).toEqual(['Provide at least one way to contact you: email, mobile or Messenger']);
  });
  it('requires a preferred method when a contact is given', () => {
    const r = contactsSchema.safeParse({ mobile: '09171234567' });
    expect(r.error!.issues[0]!.path).toEqual(['preferred']);
  });
  it('accepts messenger-only', () => {
    const r = contactsSchema.safeParse({ messengerDisplayName: 'Juan D.', preferred: 'messenger' });
    expect(r.success).toBe(true);
  });
  it('requires preferred to be a supplied method', () => {
    const r = contactsSchema.safeParse({ mobile: '09171234567', preferred: 'email' });
    expect(r.success).toBe(false);
  });
  it('treats empty strings as absent', () => {
    const r = contactsSchema.safeParse({ email: '', mobile: '09171234567', preferred: 'mobile' });
    expect(r.success && r.data.email).toBe(undefined);
  });
});

const base = {
  representative: { name: 'Example Rep', contacts: { email: 'rep@example.com', preferred: 'email' } },
  attendees: [{ fullName: 'Example One', ageCategory: 'adult', rsvp: 'confirmed' }],
  acceptedPrivacy: true,
  consentVersion: '2026-10-v2',
};

describe('registrationCreateSchema', () => {
  it('accepts a valid payload', () => {
    expect(registrationCreateSchema.safeParse(base).success).toBe(true);
  });
  it('accepts 20 and rejects 21 attendees', () => {
    const a = Array.from({ length: 20 }, (_, i) => ({ fullName: `Person ${i} X`, ageCategory: 'adult', rsvp: 'confirmed' }));
    expect(registrationCreateSchema.safeParse({ ...base, attendees: a }).success).toBe(true);
    expect(registrationCreateSchema.safeParse({ ...base, attendees: [...a, a[0]] }).success).toBe(false);
  });
  it('rejects zero attendees without a reason, accepts with reason', () => {
    expect(registrationCreateSchema.safeParse({ ...base, attendees: [] }).success).toBe(false);
    expect(
      registrationCreateSchema.safeParse({ ...base, attendees: [], noAttendeesReason: 'Abroad this year' }).success,
    ).toBe(true);
  });
  it('requires privacy acceptance', () => {
    expect(registrationCreateSchema.safeParse({ ...base, acceptedPrivacy: false }).success).toBe(false);
  });
});
