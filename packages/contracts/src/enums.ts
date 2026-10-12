export const RSVP_VALUES = ['confirmed', 'tentative', 'declined'] as const;
export type Rsvp = (typeof RSVP_VALUES)[number];

export const AGE_CATEGORIES = ['adult', 'child'] as const;
export type AgeCategory = (typeof AGE_CATEGORIES)[number];

export const CONTACT_METHODS = ['email', 'mobile', 'messenger'] as const;
export type ContactMethod = (typeof CONTACT_METHODS)[number];

export const ROLES = ['platform_admin', 'event_admin', 'committee'] as const;
export type Role = (typeof ROLES)[number];

export const REGISTRATION_STATUSES = ['active', 'cancelled'] as const;
export type RegistrationStatus = (typeof REGISTRATION_STATUSES)[number];

export const REGISTRATION_SOURCES = ['public', 'committee', 'venue'] as const;
export type RegistrationSource = (typeof REGISTRATION_SOURCES)[number];

export const ATTENDEE_STATUSES = ['active', 'removed'] as const;

export const EVENT_REGISTRATION_STATUSES = ['draft', 'open', 'closed'] as const;
export type EventRegistrationStatus = (typeof EVENT_REGISTRATION_STATUSES)[number];

export const EMAIL_JOB_STATUSES = ['queued', 'sending', 'sent', 'failed', 'suppressed'] as const;
export type EmailJobStatus = (typeof EMAIL_JOB_STATUSES)[number];

export const EMAIL_JOB_TYPES = [
  'registration_confirmation',
  'registration_updated',
  'registration_cancelled',
  'access_link',
] as const;
export type EmailJobType = (typeof EMAIL_JOB_TYPES)[number];

export const DUPLICATE_FLAG_STATUSES = ['open', 'not_duplicate', 'resolved'] as const;
export type DuplicateFlagStatus = (typeof DUPLICATE_FLAG_STATUSES)[number];

export const EXPORT_FORMATS = ['csv', 'xlsx'] as const;
export const EXPORT_VIEWS = ['attendees', 'registrations', 'summary', 'venue'] as const;
export type ExportView = (typeof EXPORT_VIEWS)[number];

/** Upper bound on attendees in a single household registration. */
export const MAX_ATTENDEES = 20;

/** Category label used when an attendee has no branch assigned. */
export const UNCATEGORIZED_LABEL = 'Not specified';
