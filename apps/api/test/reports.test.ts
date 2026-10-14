import ExcelJS from 'exceljs';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AuditLog, EmailJob, Event, HeadcountSnapshot, RateLimit } from '../src/db/models.js';
import { createLogger } from '../src/lib/logger.js';
import { csvCell, defang } from '../src/services/exports.js';
import { runAutoSnapshots } from '../src/services/scheduler.js';
import { agent, registrationPayload, setupTestApp, submit, teardownTestApp, type TestCtx } from './helpers.js';

let ctx: TestCtx;
let admin: Awaited<ReturnType<typeof agent>>;
const binaryParser = (res: request.Response, cb: (err: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on('data', (c: Buffer) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};

beforeAll(async () => {
  ctx = await setupTestApp();
  const [albina] = ctx.categoryIds;
  await submit(
    ctx,
    registrationPayload({
      eventCategoryId: albina,
      representative: { name: '=HYPERLINK("http://evil","x")', contacts: { email: 'f1@example.test', preferred: 'email' } },
      attendees: [
        { fullName: '+Cmd Injection', ageCategory: 'adult', rsvp: 'confirmed' },
        { fullName: 'Normal, "Quoted" Name', ageCategory: 'child', rsvp: 'tentative' },
      ],
    }),
  ).expect(201);
  await submit(ctx, registrationPayload({ attendees: [{ fullName: 'Third Person', ageCategory: 'adult', rsvp: 'declined' }] })).expect(201);
  admin = await agent(ctx, 'admin@example.test');
});
afterAll(teardownTestApp);
beforeEach(async () => {
  await RateLimit.deleteMany({});
});

const exp = (q: Record<string, string>) => admin.a.get(`/api/v1/admin/events/${ctx.eventId}/exports`).query(q);

describe('spreadsheet safety', () => {
  it('defangs formula-leading cells and quotes CSV correctly', () => {
    expect(defang('=1+1')).toBe("'=1+1");
    expect(defang('+63')).toBe("'+63");
    expect(defang('-x')).toBe("'-x");
    expect(defang('@SUM')).toBe("'@SUM");
    expect(defang('\tx')).toBe("'\tx");
    expect(defang('Juan')).toBe('Juan');
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('line\nbreak')).toBe('"line\nbreak"');
  });
});

describe('exports', () => {
  it('attendee CSV has BOM, defanged cells and reconciles with the dashboard', async () => {
    const res = await exp({ format: 'csv', view: 'attendees' }).expect(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toMatch(/attachment; filename="mb-wa-reunion-2026-attendees-\d+\.csv"/);
    expect(res.text.charCodeAt(0)).toBe(0xfeff);
    expect(res.text).toContain("'+Cmd Injection");
    expect(res.text).toContain('"Normal, ""Quoted"" Name"');
    expect(res.text).toContain(`"'=HYPERLINK(""http://evil"",""x"")"`);
    const rows = res.text.trim().split('\r\n').length - 1;
    const dash = (await admin.a.get(`/api/v1/admin/events/${ctx.eventId}/dashboard`).expect(200)).body;
    expect(rows).toBe(dash.confirmed + dash.tentative + dash.declined);
  });

  it('registrations CSV includes contacts; venue CSV excludes them', async () => {
    const regs = await exp({ format: 'csv', view: 'registrations' }).expect(200);
    expect(regs.text).toContain('f1@example.test');
    const venue = await exp({ format: 'csv', view: 'venue' }).expect(200);
    expect(venue.text).not.toContain('@example.test');
    expect(venue.text.split('\r\n')[0]).toBe('﻿Attendee ID,Reference,Full name,Age group,Branch,RSVP,Status');
  });

  it('applies branch and RSVP filters', async () => {
    const res = await exp({ format: 'csv', view: 'attendees', categoryId: ctx.categoryIds[0]!, rsvp: 'confirmed' }).expect(200);
    const lines = res.text.trim().split('\r\n');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('Cmd Injection');
  });

  it('XLSX has the five sheets and totals match the dashboard', async () => {
    const res = await exp({ format: 'xlsx' }).buffer(true).parse(binaryParser).expect(200);
    expect(res.headers['content-type']).toContain('spreadsheetml');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.body as never); // ExcelJS ships an older Buffer typing
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Summary', 'Registrations', 'Attendees', 'Branches', 'RSVP Statistics']);
    const dash = (await admin.a.get(`/api/v1/admin/events/${ctx.eventId}/dashboard`).expect(200)).body;
    const branches = wb.getWorksheet('Branches')!;
    const totalRow = branches.getRow(branches.rowCount);
    expect(totalRow.getCell(1).value).toBe('Total');
    expect(totalRow.getCell(5).value).toBe(dash.potential);
    expect(wb.getWorksheet('Attendees')!.rowCount - 1).toBe(dash.confirmed + dash.tentative + dash.declined);
    expect(wb.getWorksheet('Registrations')!.rowCount - 1).toBe(dash.activeRegistrations);
    const regSheet = wb.getWorksheet('Registrations')!;
    const repCell = regSheet.getRow(2).getCell(2).value;
    expect(String(repCell).startsWith("'=")).toBe(true);
    expect(wb.getWorksheet('Attendees')!.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 });
  });

  it('records who exported what', async () => {
    expect(await AuditLog.countDocuments({ action: 'export.downloaded' })).toBeGreaterThanOrEqual(4);
    const last = await AuditLog.findOne({ action: 'export.downloaded' }).sort({ timestamp: -1 }).lean();
    expect(last?.metadata).toMatchObject({ format: 'xlsx' });
  });

  it('is restricted to event admins', async () => {
    const committee = await agent(ctx, 'committee@example.test');
    await committee.a.get(`/api/v1/admin/events/${ctx.eventId}/exports?format=csv`).expect(403);
    await committee.a.get(`/api/v1/admin/events/${ctx.eventId}/snapshots`).expect(403);
    await committee.a.get(`/api/v1/admin/events/${ctx.eventId}/duplicate-flags`).expect(403);
    await request(ctx.app).get(`/api/v1/admin/events/${ctx.eventId}/exports?format=csv`).expect(401);
    const outsider = await agent(ctx, 'outsider@example.test');
    await outsider.a.get(`/api/v1/admin/events/${ctx.eventId}/exports?format=csv`).expect(404);
  });
});

describe('headcount snapshots', () => {
  // Registrations get real createdAt timestamps, so snapshot times must be relative to the real clock
  // (a hard-coded cutoff silently turns into "the past" and breaks the test on a later day).
  beforeAll(() => ctx.setNow(new Date(Date.now() + 60 * 60 * 1000)));
  afterAll(() => ctx.setNow(new Date('2026-10-12T10:00:00+08:00')));

  it('captures point-in-time totals that later changes do not alter', async () => {
    const cutoffAt = new Date().toISOString(); // after the two registrations created in beforeAll
    const body = { cutoffAt, idempotencyKey: 'oct20-planning-1', label: 'Oct 20 planning' };
    const first = await admin.a.post(`/api/v1/admin/events/${ctx.eventId}/snapshots`).set('X-CSRF-Token', admin.csrf).send(body).expect(201);
    const before = first.body.totals;
    expect(before.potential).toBe(2);
    // Replay returns the same snapshot
    const replay = await admin.a.post(`/api/v1/admin/events/${ctx.eventId}/snapshots`).set('X-CSRF-Token', admin.csrf).send(body).expect(200);
    expect(replay.body.id).toBe(first.body.id);
    // Late registration
    await submit(ctx, registrationPayload({ attendees: [{ fullName: 'After Snapshot', ageCategory: 'adult', rsvp: 'confirmed' }] })).expect(201);
    const list = await admin.a.get(`/api/v1/admin/events/${ctx.eventId}/snapshots`).expect(200);
    expect(list.body.items.find((s: { id: string }) => s.id === first.body.id).totals).toEqual(before);
    expect(list.body.items[0].policy).toContain('v1');
  });

  it('excludes registrations created after the cutoff', async () => {
    const cutoffAt = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // before any test registration
    const snap = await admin.a.post(`/api/v1/admin/events/${ctx.eventId}/snapshots`).set('X-CSRF-Token', admin.csrf).send({ cutoffAt, idempotencyKey: 'early-cutoff-1' }).expect(201);
    expect(snap.body.totals.potential).toBe(0);
  });

  it('refuses future cutoffs and amendments without reason; amendments append', async () => {
    const future = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(); // beyond the test clock
    const fut = await admin.a.post(`/api/v1/admin/events/${ctx.eventId}/snapshots`).set('X-CSRF-Token', admin.csrf).send({ cutoffAt: future, idempotencyKey: 'future-key-1' }).expect(422);
    expect(fut.body.error.fieldErrors.cutoffAt).toBeDefined();
    const list = (await admin.a.get(`/api/v1/admin/events/${ctx.eventId}/snapshots`).expect(200)).body.items;
    const original = list[list.length - 1];
    const noReason = await admin.a.post(`/api/v1/admin/events/${ctx.eventId}/snapshots`).set('X-CSRF-Token', admin.csrf).send({ cutoffAt: original.cutoffAt, idempotencyKey: 'amendment-key-1', amendsSnapshotId: original.id }).expect(422);
    expect(noReason.body.error.fieldErrors.amendmentReason).toBeDefined();
    const amended = await admin.a
      .post(`/api/v1/admin/events/${ctx.eventId}/snapshots`)
      .set('X-CSRF-Token', admin.csrf)
      .send({ cutoffAt: original.cutoffAt, idempotencyKey: 'amendment-key-2', amendsSnapshotId: original.id, amendmentReason: 'Duplicate household removed' });
    expect(amended.status, JSON.stringify(amended.body)).toBe(201);
    expect(amended.body.amendsSnapshotId).toBe(original.id);
    const after = (await admin.a.get(`/api/v1/admin/events/${ctx.eventId}/snapshots`).expect(200)).body.items;
    expect(after.find((s: { id: string }) => s.id === original.id)).toEqual(original);
  });

  it('blocks updates and deletes at the model layer', async () => {
    await expect(HeadcountSnapshot.updateOne({}, { $set: { label: 'x' } })).rejects.toThrow(/append-only/);
    await expect(HeadcountSnapshot.deleteMany({})).rejects.toThrow(/append-only/);
  });

  it('auto-captures once when the configured cutoff passes', async () => {
    const event = await Event.findOne({ publicId: ctx.eventId }).lean();
    const logger = createLogger('silent');
    expect(await runAutoSnapshots({ logger, now: () => new Date('2026-10-20T12:00:00+08:00') })).toBe(0);
    const after = new Date(event!.preregSnapshotAt!.getTime() + 60_000);
    expect(await runAutoSnapshots({ logger, now: () => after })).toBe(1);
    expect(await runAutoSnapshots({ logger, now: () => after })).toBe(0);
    const auto = await HeadcountSnapshot.findOne({ capturedBy: 'system' }).lean();
    expect(auto?.cutoffAt.toISOString()).toBe(event!.preregSnapshotAt!.toISOString());
  });
});

describe('duplicate review', () => {
  it('lists open flags and lets an admin resolve without merging', async () => {
    await submit(ctx, registrationPayload({ attendees: [{ fullName: 'Same Name Person', ageCategory: 'adult', rsvp: 'confirmed' }] })).expect(201);
    await submit(ctx, registrationPayload({ attendees: [{ fullName: 'same name  person', ageCategory: 'adult', rsvp: 'confirmed' }] })).expect(201);
    await new Promise((r) => setTimeout(r, 200));
    const list = await admin.a.get(`/api/v1/admin/events/${ctx.eventId}/duplicate-flags`).expect(200);
    const flag = list.body.items.find((f: { reason: string; attendees: unknown[] }) => f.reason === 'same_attendee_name' && f.attendees.length === 2);
    expect(flag).toBeTruthy();
    await admin.a.patch(`/api/v1/admin/events/${ctx.eventId}/duplicate-flags/${flag.id}`).set('X-CSRF-Token', admin.csrf).send({ status: 'open', resolution: 'x' }).expect(422);
    await admin.a.patch(`/api/v1/admin/events/${ctx.eventId}/duplicate-flags/${flag.id}`).set('X-CSRF-Token', admin.csrf).send({ status: 'not_duplicate', resolution: 'Two different cousins' }).expect(200);
    const open = await admin.a.get(`/api/v1/admin/events/${ctx.eventId}/duplicate-flags`).expect(200);
    expect(open.body.items.find((f: { id: string }) => f.id === flag.id)).toBeUndefined();
    const dash = (await admin.a.get(`/api/v1/admin/events/${ctx.eventId}/dashboard`).expect(200)).body;
    expect(dash.confirmed).toBeGreaterThanOrEqual(2);
  });
});

describe('email delivery admin', () => {
  it('lists jobs with masked recipients, throttles resends and retries failures', async () => {
    const reg = await submit(ctx, registrationPayload({ representative: { name: 'Resend Me', contacts: { email: 'resend@example.test', preferred: 'email' } } })).expect(201);
    await EmailJob.updateMany({}, { $set: { status: 'failed', lastErrorCode: 'resend_422' } });
    const list = await admin.a.get(`/api/v1/admin/events/${ctx.eventId}/email-jobs`).expect(200);
    expect(list.body.items.length).toBeGreaterThan(0);
    expect(JSON.stringify(list.body)).not.toContain('resend@example.test');
    expect(list.body.items.some((j: { recipientMasked: string }) => j.recipientMasked === 're***@example.test')).toBe(true);

    const url = `/api/v1/admin/events/${ctx.eventId}/registrations/${reg.body.registrationPublicId}/email/resend`;
    for (let i = 0; i < 3; i++) await admin.a.post(url).set('X-CSRF-Token', admin.csrf).expect(202);
    await admin.a.post(url).set('X-CSRF-Token', admin.csrf).expect(429);

    const failed = list.body.items[0];
    await admin.a.post(`/api/v1/admin/events/${ctx.eventId}/email-jobs/${failed.id}/retry`).set('X-CSRF-Token', admin.csrf).expect(202);
    expect((await EmailJob.findOne({ publicId: failed.id }).lean())?.status).toBe('queued');
  });
});

describe('operations status', () => {
  it('reports email backlog and health to event admins only', async () => {
    const res = await admin.a.get(`/api/v1/admin/events/${ctx.eventId}/ops`).expect(200);
    expect(res.body).toMatchObject({ db: 'connected', email: { configured: true, queued: expect.any(Number), failed: expect.any(Number) }, scheduler: expect.any(Object) });
    const committee = await agent(ctx, 'committee@example.test');
    await committee.a.get(`/api/v1/admin/events/${ctx.eventId}/ops`).expect(403);
    await request(ctx.app).get(`/api/v1/admin/events/${ctx.eventId}/ops`).expect(401);
  });
});
