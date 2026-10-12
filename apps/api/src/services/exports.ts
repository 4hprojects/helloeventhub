import type { Writable } from 'node:stream';
import ExcelJS from 'exceljs';
import type { Types } from 'mongoose';
import { formatPhMobile, UNCATEGORIZED_LABEL, type ExportView } from '@heh/contracts';
import { Attendee, EventCategory, Registration, type EventDoc } from '../db/models.js';
import { computeHeadcount } from './headcount.js';

/**
 * Neutralize spreadsheet formula injection: cells beginning with = + - @ or a
 * tab/CR are prefixed with an apostrophe. Stored data is never modified.
 */
export function defang(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}

export function csvCell(value: unknown): string {
  const s = defang(value);
  return /[",\r\n]|^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const csvLine = (cells: unknown[]) => `${cells.map(csvCell).join(',')}\r\n`;

export interface ExportFilters {
  categoryId?: string; // public id, or 'none'
  rsvp?: 'confirmed' | 'tentative' | 'declined';
  includeCancelled: boolean;
}

const RSVP_LABEL = { confirmed: 'Attending', tentative: 'Maybe', declined: 'Not attending' } as const;

function zoned(d: Date | undefined | null, tz: string) {
  if (!d) return '';
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}

async function loadData(event: EventDoc, f: ExportFilters) {
  const categories = await EventCategory.find({ eventId: event._id }).sort({ sortOrder: 1 }).lean();
  const catLabel = new Map(categories.map((c) => [String(c._id), c.label]));
  const catByPublic = new Map(categories.map((c) => [c.publicId, c._id]));
  const regFilter: Record<string, unknown> = { eventId: event._id };
  if (!f.includeCancelled) regFilter.status = 'active';
  const regs = await Registration.find(regFilter).sort({ createdAt: 1 }).lean();
  const regById = new Map(regs.map((r) => [String(r._id), r]));
  const attendees = await Attendee.find({ eventId: event._id, status: 'active', registrationId: { $in: regs.map((r) => r._id) } })
    .sort({ registrationId: 1, sortOrder: 1 })
    .lean();
  const wantCat = f.categoryId === 'none' ? null : f.categoryId ? String(catByPublic.get(f.categoryId) ?? 'missing') : undefined;
  const effectiveCat = (a: (typeof attendees)[number]) => {
    const c = a.categoryId ?? regById.get(String(a.registrationId))?.eventCategoryId;
    return c ? String(c) : null;
  };
  const att = attendees.filter((a) => (f.rsvp ? a.rsvp === f.rsvp : true) && (wantCat === undefined ? true : effectiveCat(a) === wantCat));
  const regsFiltered = regs.filter((r) => {
    if (wantCat !== undefined && (r.eventCategoryId ? String(r.eventCategoryId) : null) !== wantCat) return false;
    if (f.rsvp && !attendees.some((a) => String(a.registrationId) === String(r._id) && a.rsvp === f.rsvp)) return false;
    return true;
  });
  const byReg = new Map<string, typeof attendees>();
  for (const a of attendees) byReg.set(String(a.registrationId), [...(byReg.get(String(a.registrationId)) ?? []), a]);
  return { categories, catLabel, regById, attendees: att, registrations: regsFiltered, byReg, effectiveCat };
}

type Data = Awaited<ReturnType<typeof loadData>>;

const ATTENDEE_COLS = ['Attendee ID', 'Reference', 'Full name', 'Age group', 'RSVP', 'Branch', 'Representative', 'Registration status', 'Late', 'Source', 'Registered at'];
function attendeeRow(a: Data['attendees'][number], d: Data, tz: string) {
  const r = d.regById.get(String(a.registrationId))!;
  const cat = d.effectiveCat(a);
  return [a.publicId, r.reference, a.fullName, a.ageCategory === 'child' ? 'Child' : 'Adult', RSVP_LABEL[a.rsvp], cat ? d.catLabel.get(cat) : UNCATEGORIZED_LABEL, r.representativeName, r.status, r.lateRegistration ? 'Yes' : 'No', r.source, zoned(r.createdAt, tz)];
}

const REG_COLS = ['Reference', 'Representative', 'Email', 'Mobile', 'Messenger name', 'Messenger link', 'Preferred contact', 'Branch', 'Attending', 'Maybe', 'Not attending', 'Total listed', 'Status', 'Late', 'Source', 'Registered at', 'Updated at', 'No-attendee reason', 'Notes'];
function regRow(r: Data['registrations'][number], d: Data, tz: string) {
  const list = d.byReg.get(String(r._id)) ?? [];
  const n = (x: string) => list.filter((a) => a.rsvp === x).length;
  return [
    r.reference,
    r.representativeName,
    r.contacts?.email ?? '',
    r.contacts?.mobile ? formatPhMobile(r.contacts.mobile) : '',
    r.contacts?.messengerDisplayName ?? '',
    r.contacts?.messengerProfileUrl ?? '',
    r.contacts?.preferred ?? '',
    r.eventCategoryId ? d.catLabel.get(String(r.eventCategoryId)) : UNCATEGORIZED_LABEL,
    n('confirmed'),
    n('tentative'),
    n('declined'),
    list.length,
    r.status,
    r.lateRegistration ? 'Yes' : 'No',
    r.source,
    zoned(r.createdAt, tz),
    zoned(r.updatedAt, tz),
    r.noAttendeesReason ?? '',
    r.notes ?? '',
  ];
}

const VENUE_COLS = ['Attendee ID', 'Reference', 'Full name', 'Age group', 'Branch', 'RSVP', 'Status'];

function countDefinitions(): string[][] {
  return [
    ['Counts include only people listed as attendees on active (not cancelled) registrations.'],
    ['A representative is counted only if they are listed as an attendee.'],
    ['Potential = Attending + Maybe. Not attending is excluded from Potential.'],
    [`Branch uses the attendee's own branch if set, otherwise the household branch, otherwise "${UNCATEGORIZED_LABEL}".`],
  ];
}

export interface ExportResult {
  filename: string;
  contentType: string;
  rows: number;
}

export async function writeCsv(out: Writable, event: EventDoc, view: ExportView, f: ExportFilters, now: Date): Promise<number> {
  const tz = event.timezone;
  out.write('﻿');
  if (view === 'summary') {
    const { totals, byCategory } = await computeHeadcount(event._id as Types.ObjectId);
    out.write(csvLine(['Event', event.title]));
    out.write(csvLine(['Generated', `${zoned(now, tz)} (${tz})`]));
    out.write(csvLine(['Metric', 'Value']));
    for (const [k, v] of Object.entries(totals)) out.write(csvLine([k, v]));
    out.write(csvLine([]));
    out.write(csvLine(['Branch', 'Attending', 'Maybe', 'Not attending', 'Potential']));
    for (const c of byCategory) out.write(csvLine([c.label, c.confirmed, c.tentative, c.declined, c.potential]));
    return Object.keys(totals).length + byCategory.length;
  }
  const d = await loadData(event, f);
  if (view === 'registrations') {
    out.write(csvLine(REG_COLS));
    for (const r of d.registrations) out.write(csvLine(regRow(r, d, tz)));
    return d.registrations.length;
  }
  if (view === 'venue') {
    out.write(csvLine(VENUE_COLS));
    const rows = d.attendees.filter((a) => d.regById.get(String(a.registrationId))?.status === 'active');
    for (const a of rows) {
      const r = attendeeRow(a, d, tz);
      out.write(csvLine([r[0], r[1], r[2], r[3], r[5], r[4], 'active']));
    }
    return rows.length;
  }
  out.write(csvLine(ATTENDEE_COLS));
  for (const a of d.attendees) out.write(csvLine(attendeeRow(a, d, tz)));
  return d.attendees.length;
}

function styleSheet(ws: ExcelJS.Worksheet, headerRow: number, widths: number[]) {
  ws.views = [{ state: 'frozen', ySplit: headerRow }];
  ws.getRow(headerRow).font = { bold: true };
  ws.getRow(headerRow).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F3FA' } };
  widths.forEach((w, i) => (ws.getColumn(i + 1).width = w));
}

function addTable(ws: ExcelJS.Worksheet, headerRow: number, cols: string[], rows: unknown[][]) {
  ws.getRow(headerRow).values = cols;
  for (const r of rows) ws.addRow(r.map((v) => (typeof v === 'number' ? v : defang(v))));
  ws.autoFilter = { from: { row: headerRow, column: 1 }, to: { row: headerRow, column: cols.length } };
}

/** Five-sheet workbook (doc 06). The venue view produces a single roster sheet without contacts. */
export async function writeXlsx(out: Writable, event: EventDoc, view: ExportView, f: ExportFilters, now: Date, filterLabel: string): Promise<number> {
  const tz = event.timezone;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'HelloEventHub';
  wb.created = now;
  const d = await loadData(event, f);

  if (view === 'venue') {
    const ws = wb.addWorksheet('Venue roster');
    const rows = d.attendees.filter((a) => d.regById.get(String(a.registrationId))?.status === 'active').map((a) => {
      const r = attendeeRow(a, d, tz);
      return [r[0], r[1], r[2], r[3], r[5], r[4], 'active'];
    });
    ws.addRow([event.title]);
    ws.addRow([`Generated ${zoned(now, tz)} (${tz}) · contains no contact details`]);
    addTable(ws, 3, VENUE_COLS, rows);
    styleSheet(ws, 3, [28, 16, 32, 10, 18, 14, 10]);
    await wb.xlsx.write(out);
    return rows.length;
  }

  const { totals, byCategory } = await computeHeadcount(event._id as Types.ObjectId);

  const summary = wb.addWorksheet('Summary');
  summary.addRow([event.title]).font = { bold: true, size: 14 };
  summary.addRow(['Generated', `${zoned(now, tz)} (${tz})`]);
  summary.addRow(['Event date', zoned(event.startsAt, tz)]);
  summary.addRow(['Filters (Registrations/Attendees sheets)', filterLabel]);
  summary.addRow([]);
  const labels: Record<string, string> = {
    activeRegistrations: 'Active household registrations',
    confirmed: 'Attending',
    tentative: 'Maybe',
    declined: 'Not attending',
    potential: 'Potential (attending + maybe)',
    confirmedAdults: 'Attending adults',
    confirmedChildren: 'Attending children',
    tentativeAdults: 'Maybe adults',
    tentativeChildren: 'Maybe children',
  };
  const h = summary.addRow(['Live totals (all active registrations)', 'Count']);
  h.font = { bold: true };
  for (const [k, v] of Object.entries(totals)) summary.addRow([labels[k] ?? k, v]);
  summary.addRow([]);
  summary.addRow(['Count definitions']).font = { bold: true };
  for (const line of countDefinitions()) summary.addRow(line);
  summary.getColumn(1).width = 48;
  summary.getColumn(2).width = 24;

  const regs = wb.addWorksheet('Registrations');
  addTable(regs, 1, REG_COLS, d.registrations.map((r) => regRow(r, d, tz)));
  styleSheet(regs, 1, [16, 28, 28, 16, 20, 30, 12, 16, 10, 8, 12, 10, 10, 6, 10, 18, 18, 30, 30]);

  const att = wb.addWorksheet('Attendees');
  addTable(att, 1, ATTENDEE_COLS, d.attendees.map((a) => attendeeRow(a, d, tz)));
  styleSheet(att, 1, [28, 16, 30, 10, 14, 18, 28, 12, 6, 10, 18]);

  const br = wb.addWorksheet('Branches');
  addTable(br, 1, ['Branch', 'Attending', 'Maybe', 'Not attending', 'Potential'], byCategory.map((c) => [c.label, c.confirmed, c.tentative, c.declined, c.potential]));
  br.addRow(['Total', totals.confirmed, totals.tentative, totals.declined, totals.potential]).font = { bold: true };
  styleSheet(br, 1, [24, 12, 10, 14, 12]);

  const rs = wb.addWorksheet('RSVP Statistics');
  addTable(rs, 1, ['Response', 'Adults', 'Children', 'Total'], [
    ['Attending', totals.confirmedAdults, totals.confirmedChildren, totals.confirmed],
    ['Maybe', totals.tentativeAdults, totals.tentativeChildren, totals.tentative],
    ['Not attending', '', '', totals.declined],
    ['Potential (attending + maybe)', totals.confirmedAdults + totals.tentativeAdults, totals.confirmedChildren + totals.tentativeChildren, totals.potential],
  ]);
  styleSheet(rs, 1, [30, 10, 10, 10]);

  await wb.xlsx.write(out);
  return d.attendees.length;
}
