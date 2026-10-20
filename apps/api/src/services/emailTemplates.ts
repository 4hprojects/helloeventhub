import { formatDateInZone, formatTimeInZone, type EmailJobType } from '@heh/contracts';
import type { AttendeeDoc, EventDoc, RegistrationDoc } from '../db/models.js';

export function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}

export interface TemplateInput {
  type: EmailJobType;
  appBaseUrl: string;
  event: EventDoc;
  registration: RegistrationDoc;
  attendees: AttendeeDoc[];
  manageToken?: string;
  /** Earlier active registrations for the same event that use this email address. */
  otherReferences?: string[];
}

const BRAND = '#397FAF';
const INK = '#243348';

function rsvpLabel(r: string) {
  return r === 'confirmed' ? 'Attending' : r === 'tentative' ? 'Maybe' : 'Not attending';
}

export function renderEmail(input: TemplateInput): { subject: string; html: string; text: string } {
  const { event, registration: reg, attendees, appBaseUrl } = input;
  const tz = event.timezone;
  const when = `${formatDateInZone(event.startsAt, tz)}`;
  const onsite = formatTimeInZone(event.onsiteRegistrationStartsAt, tz);
  const program = `${formatTimeInZone(event.startsAt, tz)}–${formatTimeInZone(event.endsAt, tz)}`;
  const active = attendees.filter((a) => a.status === 'active');
  const counts = { confirmed: 0, tentative: 0, declined: 0 };
  for (const a of active) counts[a.rsvp] += 1;
  // Children are summarized by count only — no need to email their names (doc 07).
  const adults = active.filter((a) => a.ageCategory === 'adult');
  const childrenCount = active.length - adults.length;

  let subject: string;
  let intro: string;
  let showSummary = true;
  let cta: { href: string; label: string } | null = null;
  switch (input.type) {
    case 'registration_confirmation':
      subject = `Registration received – ${event.title} (${reg.reference})`;
      intro = `Thank you, ${reg.representativeName}. We received your registration.`;
      break;
    case 'registration_updated':
      subject = `Registration updated – ${event.title} (${reg.reference})`;
      intro = `Your registration was updated. Here is the latest summary.`;
      break;
    case 'registration_cancelled':
      subject = `Registration cancelled – ${event.title} (${reg.reference})`;
      intro = `Your registration has been cancelled. If this was a mistake, please contact the organizers.`;
      showSummary = false;
      break;
    case 'access_link':
      subject = `Your link to manage your registration – ${event.title}`;
      intro = `Use the button below to view or change your registration. The link works once and expires in 30 minutes. If you did not request it, you can ignore this email.`;
      showSummary = false;
      cta = {
        href: `${appBaseUrl}/registration/manage#t=${input.manageToken ?? ''}`,
        label: 'Manage my registration',
      };
      break;
  }

  const others = input.otherReferences ?? [];
  const otherNote = others.length
    ? `This email address is also on ${others.length === 1 ? 'registration' : 'registrations'} ${others.join(', ')}. If you registered twice by mistake, use "Manage registration" on the event site or contact the organizers so no one is counted twice.`
    : null;

  const contact = event.contactInfo ?? {};
  const contactLines = [
    contact.email && `Email: ${contact.email}`,
    contact.phone && `Phone: ${contact.phone}`,
    contact.messenger && `Messenger: ${contact.messenger}`,
    contact.note,
  ].filter(Boolean) as string[];

  const text = [
    event.title,
    '',
    intro,
    '',
    `Reference: ${reg.reference}`,
    `Date: ${when}`,
    `On-site registration: ${onsite} · Program: ${program}`,
    event.venueName ? `Venue: ${event.venueName}${event.venueAddress ? `, ${event.venueAddress}` : ''}` : '',
    '',
    ...(showSummary
      ? [
          `Attending: ${counts.confirmed} · Maybe: ${counts.tentative} · Not attending: ${counts.declined}`,
          ...adults.map((a) => `- ${a.fullName}: ${rsvpLabel(a.rsvp)}`),
          ...(childrenCount ? [`- Children: ${childrenCount}`] : []),
          '',
        ]
      : []),
    ...(cta ? [`${cta.label}: ${cta.href}`, ''] : []),
    ...(otherNote ? [otherNote, ''] : []),
    'Keep your reference number. It identifies your registration but is not a password.',
    ...(contactLines.length ? ['', 'Questions? Contact the organizers:', ...contactLines] : []),
    '',
    `Privacy: ${appBaseUrl}/privacy`,
    '— HelloEventHub · Plan. Register. Connect.',
  ]
    .filter((l, i, arr) => !(l === '' && arr[i - 1] === ''))
    .join('\n');

  const e = escapeHtml;
  const summaryHtml = showSummary
    ? `<table role="presentation" width="100%" style="border-collapse:collapse;margin:16px 0;font-size:14px">
        <tr><td style="padding:6px 0"><strong>Attending</strong></td><td align="right">${counts.confirmed}</td></tr>
        <tr><td style="padding:6px 0"><strong>Maybe</strong></td><td align="right">${counts.tentative}</td></tr>
        <tr><td style="padding:6px 0"><strong>Not attending</strong></td><td align="right">${counts.declined}</td></tr>
      </table>
      <ul style="padding-left:18px;margin:0 0 16px">${adults.map((a) => `<li>${e(a.fullName)} – ${rsvpLabel(a.rsvp)}</li>`).join('')}${
        childrenCount ? `<li>Children: ${childrenCount}</li>` : ''
      }</ul>`
    : '';
  const ctaHtml = cta
    ? `<p style="margin:24px 0"><a href="${e(cta.href)}" style="background:${BRAND};color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:600;display:inline-block">${e(cta.label)}</a></p>`
    : '';
  const html = `<!doctype html><html><body style="margin:0;background:#F7FAFD;font-family:Inter,Segoe UI,Arial,sans-serif;color:${INK}">
  <table role="presentation" width="100%" style="background:#F7FAFD"><tr><td align="center" style="padding:24px 12px">
  <table role="presentation" width="100%" style="max-width:560px;background:#fff;border-radius:12px;border:1px solid #D9E6F0">
    <tr><td style="background:${BRAND};border-radius:12px 12px 0 0;padding:20px 24px;color:#fff;font-size:20px;font-weight:700">HelloEventHub</td></tr>
    <tr><td style="padding:24px">
      <h1 style="font-size:20px;margin:0 0 8px">${e(event.title)}</h1>
      <p style="margin:0 0 16px">${e(intro)}</p>
      <p style="margin:0 0 4px">Reference: <strong style="font-family:monospace;font-size:16px">${e(reg.reference)}</strong></p>
      <p style="margin:0 0 4px">${e(when)}</p>
      <p style="margin:0 0 4px">On-site registration ${e(onsite)} · Program ${e(program)}</p>
      ${event.venueName ? `<p style="margin:0 0 4px">${e(event.venueName)}${event.venueAddress ? `, ${e(event.venueAddress)}` : ''}</p>` : ''}
      ${summaryHtml}${ctaHtml}
      ${otherNote ? `<p style="margin:0 0 16px;padding:12px;border-radius:10px;background:#FFF6E5">${e(otherNote)}</p>` : ''}
      <p style="font-size:13px;color:#4A5B70">Keep your reference number. It identifies your registration but is not a password.</p>
      ${contactLines.length ? `<p style="font-size:13px;color:#4A5B70">Questions? ${contactLines.map(e).join(' · ')}</p>` : ''}
      <p style="font-size:12px;color:#4A5B70"><a href="${e(appBaseUrl)}/privacy" style="color:${BRAND}">Privacy notice</a> · HelloEventHub — Plan. Register. Connect.</p>
    </td></tr></table></td></tr></table></body></html>`;
  return { subject, html, text };
}
