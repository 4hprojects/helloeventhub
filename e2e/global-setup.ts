import { request, type FullConfig } from '@playwright/test';
import { adminApi } from './helpers';

/** Ensure the local event is open for registration before the suite runs. */
export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]!.use.baseURL!;
  const ctx = await request.newContext({ baseURL });
  const { csrf, eventId } = await adminApi(ctx);
  const ev = await (await ctx.get(`/api/v1/admin/events/${eventId}`)).json();
  if (ev.registrationStatus !== 'open') {
    const body = {
      revision: ev.revision,
      title: ev.title,
      description: ev.description,
      venueName: ev.venueName ?? undefined,
      venueAddress: ev.venueAddress ?? undefined,
      venueMapUrl: ev.venueMapUrl ?? undefined,
      startsAt: ev.startsAt,
      endsAt: ev.endsAt,
      onsiteRegistrationStartsAt: ev.onsiteRegistrationStartsAt,
      registrationStatus: 'open',
      registrationClosesAt: ev.registrationClosesAt,
      selfServiceEditUntil: ev.selfServiceEditUntil,
      preregSnapshotAt: ev.preregSnapshotAt,
      allowLateRegistration: ev.allowLateRegistration,
      capacity: ev.capacity,
      contactInfo: { ...ev.contactInfo, email: 'organizer@example.test' },
      ageCategoryNote: ev.ageCategoryNote,
      privacyNotice: ev.privacyNotice,
      privacyNoticeApproved: true,
      consentVersion: ev.consentVersion,
    };
    const res = await ctx.patch(`/api/v1/admin/events/${eventId}`, { headers: { 'X-CSRF-Token': csrf }, data: body });
    if (!res.ok()) throw new Error(`could not open registration: ${res.status()} ${await res.text()}`);
  }
  await ctx.dispose();
}
