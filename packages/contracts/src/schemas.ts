import { z } from 'zod';
import {
  AGE_CATEGORIES,
  CONTACT_METHODS,
  DUPLICATE_FLAG_STATUSES,
  EVENT_REGISTRATION_STATUSES,
  EXPORT_FORMATS,
  EXPORT_VIEWS,
  MAX_ATTENDEES,
  RSVP_VALUES,
} from './enums.js';
import { isAllowedMessengerUrl, normalizePhMobile } from './normalize.js';

/** Opaque public identifiers (ULID). */
export const publicIdSchema = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/, 'Invalid identifier');

const personName = z
  .string()
  .trim()
  .min(2, 'Please enter a full name')
  .max(120, 'Name is too long')
  .refine((v) => /\p{L}/u.test(v), 'Please enter a name');

const optionalTrimmed = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));

export const contactsSchema = z
  .object({
    email: z
      .string()
      .trim()
      .max(254)
      .optional()
      .transform((v) => (v ? v : undefined))
      .pipe(z.string().email('Enter a valid email address').optional()),
    mobile: z
      .string()
      .trim()
      .max(32)
      .optional()
      .transform((v) => (v ? v : undefined))
      .refine((v) => v === undefined || normalizePhMobile(v) !== null, {
        message: 'Enter a valid Philippine mobile number, e.g. 0917 123 4567',
      }),
    messengerDisplayName: optionalTrimmed(100),
    messengerProfileUrl: z
      .string()
      .trim()
      .max(300)
      .optional()
      .transform((v) => (v ? v : undefined))
      .refine((v) => v === undefined || isAllowedMessengerUrl(v), {
        message: 'Use a https://facebook.com/… or https://m.me/… link',
      }),
    preferred: z.enum(CONTACT_METHODS).optional(),
  })
  .superRefine((c, ctx) => {
    const has = {
      email: !!c.email,
      mobile: !!c.mobile,
      messenger: !!(c.messengerDisplayName || c.messengerProfileUrl),
    };
    if (!has.email && !has.mobile && !has.messenger) {
      // Group-level error: reported on the contacts fieldset, not on a single field.
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [],
        message: 'Provide at least one way to contact you: email, mobile or Messenger',
      });
      return;
    }
    if (!c.preferred) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['preferred'],
        message: 'Choose your preferred contact method',
      });
    } else if (!has[c.preferred]) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['preferred'],
        message: 'Your preferred contact method must be one you filled in',
      });
    }
  })
  .transform((c) => ({ ...c, preferred: c.preferred! }));
export type ContactsInput = z.input<typeof contactsSchema>;
export type Contacts = z.output<typeof contactsSchema>;

export const attendeeInputSchema = z.object({
  /** Present when updating an existing attendee; absent for new attendees. */
  publicId: publicIdSchema.optional(),
  fullName: personName,
  ageCategory: z.enum(AGE_CATEGORIES, { errorMap: () => ({ message: 'Choose Adult or Child' }) }),
  rsvp: z.enum(RSVP_VALUES, { errorMap: () => ({ message: 'Choose whether this person will attend' }) }),
  categoryId: publicIdSchema.optional().nullable(),
});
export type AttendeeInput = z.input<typeof attendeeInputSchema>;

const attendeesList = z
  .array(attendeeInputSchema)
  .max(MAX_ATTENDEES, `At most ${MAX_ATTENDEES} attendees per form`);

const representativeSchema = z.object({
  name: personName,
  contacts: contactsSchema,
});

/** Zero attendees is allowed only with an explicit response (whole household not attending). */
function requireAttendeesOrReason(
  v: { attendees: unknown[]; noAttendeesReason?: string | undefined },
  ctx: z.RefinementCtx,
) {
  if (v.attendees.length === 0 && !v.noAttendeesReason) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['attendees'],
      message: 'Add at least one attendee, or tell us that no one from your household can attend',
    });
  }
}

export const registrationCreateSchema = z
  .object({
    representative: representativeSchema,
    eventCategoryId: publicIdSchema.optional().nullable(),
    attendees: attendeesList,
    noAttendeesReason: optionalTrimmed(500),
    notes: optionalTrimmed(1000),
    acceptedPrivacy: z.literal(true, { errorMap: () => ({ message: 'Please accept the privacy notice' }) }),
    consentVersion: z.string().trim().min(1).max(40),
    turnstileToken: z.string().max(4096).optional(),
  })
  .superRefine(requireAttendeesOrReason);
export type RegistrationCreateInput = z.input<typeof registrationCreateSchema>;
export type RegistrationCreate = z.output<typeof registrationCreateSchema>;

/** Full-replacement update used by verified owners and staff. Revision is the optimistic-lock precondition. */
export const registrationUpdateSchema = z
  .object({
    revision: z.number().int().min(0),
    representative: representativeSchema,
    eventCategoryId: publicIdSchema.optional().nullable(),
    attendees: attendeesList,
    noAttendeesReason: optionalTrimmed(500),
    notes: optionalTrimmed(1000),
  })
  .superRefine(requireAttendeesOrReason);
export type RegistrationUpdateInput = z.input<typeof registrationUpdateSchema>;
export type RegistrationUpdate = z.output<typeof registrationUpdateSchema>;

export const registrationCancelSchema = z.object({
  revision: z.number().int().min(0),
  reason: optionalTrimmed(500),
});

/** Staff-assisted entry (no Turnstile, no consent checkbox; staff confirm consent was explained). */
export const adminRegistrationCreateSchema = z
  .object({
    representative: representativeSchema,
    eventCategoryId: publicIdSchema.optional().nullable(),
    attendees: attendeesList,
    noAttendeesReason: optionalTrimmed(500),
    notes: optionalTrimmed(1000),
    consentExplained: z.literal(true, {
      errorMap: () => ({ message: 'Confirm the privacy notice was explained to the registrant' }),
    }),
  })
  .superRefine(requireAttendeesOrReason);
export type AdminRegistrationCreateInput = z.input<typeof adminRegistrationCreateSchema>;

export const accessRequestSchema = z.object({
  eventSlug: z.string().trim().min(1).max(100),
  email: z.string().trim().max(254).email('Enter a valid email address'),
  reference: z
    .string()
    .trim()
    .toUpperCase()
    .max(20)
    .regex(/^HEH-[0-9A-Z]{8}$/, 'Reference looks like HEH-XXXXXXXX'),
});

export const manageExchangeSchema = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/, 'Invalid or expired link'),
});

export const loginSchema = z.object({
  email: z.string().trim().max(254).email(),
  password: z.string().min(1).max(256),
});

export const adminRegistrationQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  categoryId: z.union([publicIdSchema, z.literal('none')]).optional(),
  rsvp: z.enum(RSVP_VALUES).optional(),
  status: z.enum(['active', 'cancelled', 'all']).default('active'),
  createdFrom: z.string().datetime({ offset: true }).optional(),
  createdTo: z.string().datetime({ offset: true }).optional(),
  late: z.enum(['true', 'false']).optional(),
  sort: z
    .enum(['createdAt', '-createdAt', 'representativeName', '-representativeName'])
    .default('-createdAt'),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
export type AdminRegistrationQuery = z.input<typeof adminRegistrationQuerySchema>;

const isoDateTime = z.string().datetime({ offset: true });

export const eventUpdateSchema = z.object({
  revision: z.number().int().min(0),
  title: z.string().trim().min(3).max(160),
  tagline: z.string().trim().max(200).default(''),
  description: z.string().trim().max(5000).default(''),
  venueName: optionalTrimmed(200),
  venueAddress: optionalTrimmed(500),
  venueMapUrl: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((v) => (v ? v : undefined))
    .refine((v) => v === undefined || /^https:\/\//.test(v), 'Map link must start with https://'),
  startsAt: isoDateTime,
  endsAt: isoDateTime,
  onsiteRegistrationStartsAt: isoDateTime,
  registrationStatus: z.enum(EVENT_REGISTRATION_STATUSES),
  registrationClosesAt: isoDateTime.nullable().optional(),
  selfServiceEditUntil: isoDateTime.nullable().optional(),
  preregSnapshotAt: isoDateTime.nullable().optional(),
  preregistrationDeadlineDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
    .nullable()
    .optional(),
  allowLateRegistration: z.boolean(),
  capacity: z.number().int().min(1).max(100_000).nullable().optional(),
  contactInfo: z.object({
    email: z
      .string()
      .trim()
      .max(254)
      .optional()
      .transform((v) => (v ? v : undefined))
      .pipe(z.string().email().optional()),
    phone: optionalTrimmed(40),
    messenger: optionalTrimmed(300),
    note: optionalTrimmed(500),
  }),
  ageCategoryNote: z.string().trim().max(300).default(''),
  privacyNotice: z.string().trim().max(20_000).default(''),
  privacyNoticeApproved: z.boolean(),
  consentVersion: z.string().trim().min(1).max(40),
});
export type EventUpdateInput = z.input<typeof eventUpdateSchema>;

export const categoryCreateSchema = z.object({
  label: z.string().trim().min(1).max(80),
  sortOrder: z.number().int().min(0).max(1000).optional(),
});
export const categoryUpdateSchema = z.object({
  label: z.string().trim().min(1).max(80).optional(),
  sortOrder: z.number().int().min(0).max(1000).optional(),
  active: z.boolean().optional(),
});

export const snapshotCreateSchema = z.object({
  cutoffAt: isoDateTime,
  idempotencyKey: z.string().trim().min(8).max(128),
  label: z.string().trim().min(1).max(120).default('Planning headcount'),
  amendsSnapshotId: publicIdSchema.optional(),
  amendmentReason: optionalTrimmed(1000),
});

export const duplicateFlagUpdateSchema = z.object({
  status: z.enum(DUPLICATE_FLAG_STATUSES).exclude(['open']),
  resolution: z.string().trim().min(3).max(1000),
});

export const exportQuerySchema = z.object({
  format: z.enum(EXPORT_FORMATS).default('xlsx'),
  view: z.enum(EXPORT_VIEWS).default('attendees'),
  categoryId: z.union([publicIdSchema, z.literal('none')]).optional(),
  rsvp: z.enum(RSVP_VALUES).optional(),
  includeCancelled: z.enum(['true', 'false']).default('false'),
});

export const emailJobQuerySchema = z.object({
  status: z.enum(['failed', 'queued', 'sent', 'suppressed', 'sending', 'all']).default('failed'),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export const staffInviteSchema = z.object({
  email: z.string().trim().max(254).email('Enter a valid email address'),
  name: z.string().trim().min(2).max(120),
  role: z.enum(['event_admin', 'committee']),
});
export const staffRoleSchema = z.object({ role: z.enum(['event_admin', 'committee']) });
