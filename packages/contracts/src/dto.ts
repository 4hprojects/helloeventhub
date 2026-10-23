import type { NameParts } from './normalize.js';
import type {
  AgeCategory,
  ContactMethod,
  DuplicateFlagStatus,
  EmailJobStatus,
  EmailJobType,
  EventRegistrationStatus,
  RegistrationSource,
  RegistrationStatus,
  Role,
  Rsvp,
} from './enums.js';

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    requestId: string;
    fieldErrors?: Record<string, string[]>;
  };
}

export interface PublicConfig {
  appName: string;
  turnstileSiteKey: string | null;
  timezone: string;
  primaryEventSlug: string;
}

export interface PublicCategory {
  id: string;
  label: string;
}

export interface PublicEvent {
  id: string;
  slug: string;
  title: string;
  tagline: string;
  description: string;
  venueName: string | null;
  venueAddress: string | null;
  venueMapUrl: string | null;
  startsAt: string;
  endsAt: string;
  onsiteRegistrationStartsAt: string;
  timezone: string;
  preregistrationDeadlineDate: string | null;
  registrationOpen: boolean;
  registrationMessage: string | null;
  lateRegistration: boolean;
  contactInfo: { email?: string; phone?: string; messenger?: string; note?: string };
  ageCategoryNote: string;
  consentVersion: string;
  privacyNotice: string;
  privacyNoticeApproved: boolean;
  categories: PublicCategory[];
}

export interface CountSummary {
  confirmed: number;
  tentative: number;
  declined: number;
  total: number;
}

export interface RegistrationCreatedResponse {
  reference: string;
  registrationPublicId: string;
  countSummary: CountSummary;
  confirmationEmailQueued: boolean;
  lateRegistration: boolean;
}

export interface AttendeeDto {
  id: string;
  /** Display name, "Last, First Middle". */
  fullName: string;
  /** Present when the name was entered as separate parts. */
  nameParts: NameParts | null;
  ageCategory: AgeCategory;
  rsvp: Rsvp;
  categoryId: string | null;
  checkedInAt: string | null;
}

export interface ContactsDto {
  email?: string;
  mobile?: string;
  messengerDisplayName?: string;
  messengerProfileUrl?: string;
  preferred: ContactMethod;
}

export interface OwnerRegistrationDto {
  id: string;
  reference: string;
  status: RegistrationStatus;
  revision: number;
  representativeName: string;
  representativeNameParts: NameParts | null;
  contacts: ContactsDto;
  eventCategoryId: string | null;
  noAttendeesReason: string | null;
  notes: string | null;
  attendees: AttendeeDto[];
  createdAt: string;
  updatedAt: string;
  canEdit: boolean;
  editDeadline: string | null;
  event: { slug: string; title: string; startsAt: string; timezone: string; categories: PublicCategory[] };
}

export interface AdminRegistrationDto
  extends Omit<OwnerRegistrationDto, 'canEdit' | 'editDeadline' | 'event'> {
  source: RegistrationSource;
  lateRegistration: boolean;
  botCheck: string;
  emailVerifiedAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
}

export interface AdminRegistrationListItem {
  id: string;
  reference: string;
  status: RegistrationStatus;
  representativeName: string;
  preferredContact: ContactMethod;
  categoryLabel: string | null;
  attendeeCount: number;
  confirmed: number;
  tentative: number;
  declined: number;
  lateRegistration: boolean;
  source: RegistrationSource;
  createdAt: string;
  matchedAttendees?: string[];
  /** Everyone listed on the form, in form order. */
  people: Array<{ fullName: string; ageCategory: AgeCategory; rsvp: Rsvp }>;
}

/** Totals across every row matching the current filters, not just the current page. */
export interface SignupSummary {
  households: number;
  people: number;
  confirmed: number;
  tentative: number;
  declined: number;
  adults: number;
  children: number;
}

export interface AdminRegistrationList extends Paginated<AdminRegistrationListItem> {
  summary: SignupSummary;
}

export interface AdminAttendeeListItem {
  id: string;
  fullName: string;
  ageCategory: AgeCategory;
  rsvp: Rsvp;
  /** Attendee branch, falling back to the household branch. */
  branchLabel: string | null;
  registrationId: string;
  reference: string;
  representativeName: string;
  registrationStatus: RegistrationStatus;
  lateRegistration: boolean;
  walkIn: boolean;
  checkedInAt: string | null;
  registeredAt: string;
}

export interface AdminAttendeeList extends Paginated<AdminAttendeeListItem> {
  summary: SignupSummary;
}

export interface Paginated<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
}

export interface HeadcountTotals {
  activeRegistrations: number;
  confirmed: number;
  tentative: number;
  declined: number;
  confirmedAdults: number;
  confirmedChildren: number;
  tentativeAdults: number;
  tentativeChildren: number;
  potential: number;
}

export interface CategoryCount {
  categoryId: string | null;
  label: string;
  confirmed: number;
  tentative: number;
  declined: number;
  potential: number;
}

export interface DashboardDto extends HeadcountTotals {
  byCategory: CategoryCount[];
  lateRegistrations: number;
  openDuplicateFlags: number;
  failedEmails: number;
  checkedIn: number;
  /** People added at the venue (walk-ins and extra household members). */
  walkIns: number;
  /** Most recent sync from any active venue device, or null if none has synced. */
  venueLastSyncAt: string | null;
  recent: Array<{
    id: string;
    reference: string;
    representativeName: string;
    attendeeCount: number;
    createdAt: string;
  }>;
  asOf: string;
  timezone: string;
}

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  mustChangePassword: boolean;
  memberships: Array<{ role: Role; organizationId: string; eventId: string | null }>;
}

export interface SessionDto {
  user: SessionUser | null;
  csrfToken: string;
}

export interface AdminEventSummary {
  id: string;
  slug: string;
  title: string;
  startsAt: string;
  role: Role;
}

export interface AdminEventDto {
  id: string;
  slug: string;
  revision: number;
  title: string;
  tagline: string;
  description: string;
  venueName: string | null;
  venueAddress: string | null;
  venueMapUrl: string | null;
  startsAt: string;
  endsAt: string;
  onsiteRegistrationStartsAt: string;
  timezone: string;
  registrationStatus: EventRegistrationStatus;
  registrationClosesAt: string | null;
  selfServiceEditUntil: string | null;
  preregSnapshotAt: string | null;
  preregistrationDeadlineDate: string | null;
  allowLateRegistration: boolean;
  capacity: number | null;
  contactInfo: { email?: string; phone?: string; messenger?: string; note?: string };
  ageCategoryNote: string;
  privacyNotice: string;
  privacyNoticeApproved: boolean;
  consentVersion: string;
  role: Role;
  categories: Array<{ id: string; label: string; sortOrder: number; active: boolean; provisional: boolean }>;
}

export interface DuplicateFlagDto {
  id: string;
  reason: string;
  status: DuplicateFlagStatus;
  createdAt: string;
  reviewedBy: string | null;
  resolution: string | null;
  attendees: Array<{
    id: string;
    fullName: string;
    rsvp: Rsvp;
    registrationId: string;
    reference: string;
    representativeName: string;
  }>;
}

export interface SnapshotDto {
  id: string;
  label: string;
  cutoffAt: string;
  capturedAt: string;
  capturedBy: string;
  totals: HeadcountTotals;
  byCategory: CategoryCount[];
  unresolvedDuplicateFlags: number;
  policy: string;
  schemaVersion: number;
  amendsSnapshotId: string | null;
  amendmentReason: string | null;
}

export interface EmailJobDto {
  id: string;
  type: EmailJobType;
  status: EmailJobStatus;
  attempts: number;
  recipientMasked: string;
  registrationId: string | null;
  reference: string | null;
  lastErrorCode: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StaffMemberDto {
  id: string;
  name: string;
  email: string;
  role: 'event_admin' | 'committee';
  scope: 'event' | 'organization';
  status: 'active' | 'disabled';
  lastLoginAt: string | null;
  mustChangePassword: boolean;
  isYou: boolean;
}
