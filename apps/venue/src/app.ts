import express, { type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import {
  addToHousehold,
  addWalkins,
  branches,
  branchStats,
  checkIn,
  household,
  reviewItems,
  rosterForPrint,
  search,
  stats,
  undoCheckin,
  updateAttendee,
  VenueError,
} from './checkin.js';
import type { DB } from './db.js';
import { listOperatorNames, login, logout, sessionFor } from './operators.js';
import type { SyncLoop } from './sync.js';

const COOKIE = 'venue.sid';
const opId = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/);

function cookie(req: Request, name: string): string | undefined {
  const raw = req.headers.cookie ?? '';
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return undefined;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function createVenueApp(opts: { db: DB; sync: SyncLoop; webDir?: string; secure?: boolean; now?: () => Date }) {
  const { db, sync } = opts;
  const now = opts.now ?? (() => new Date());
  const app = express();
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
    next();
  });
  app.use('/api', express.json({ limit: '32kb' }));
  app.use('/api', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    // CSRF: SameSite=Strict cookie plus a custom header that cross-site forms cannot send.
    if (req.method !== 'GET' && req.get('x-venue-request') !== '1') return void res.status(403).json({ error: 'missing_header' });
    next();
  });

  const auth = (role?: 'lead') => (req: Request, res: Response, next: NextFunction) => {
    const s = sessionFor(db, cookie(req, COOKIE), now());
    if (!s) return void res.status(401).json({ error: 'unauthenticated' });
    if (role === 'lead' && s.role !== 'lead') return void res.status(403).json({ error: 'forbidden' });
    res.locals.op = s;
    next();
  };

  app.get('/api/health', (_req, res) => {
    const s = stats(db);
    res.json({ ok: true, rosterSize: s.rosterSize, pendingSync: s.pendingSync, sync: sync.status() });
  });

  app.get('/api/operators', (_req, res) => res.json({ names: listOperatorNames(db) }));

  app.post('/api/login', (req, res) => {
    const body = z.object({ name: z.string().min(1).max(60), pin: z.string().min(1).max(20), station: z.string().trim().min(1).max(40) }).safeParse(req.body);
    if (!body.success) return void res.status(422).json({ error: 'invalid' });
    const r = login(db, body.data.name, body.data.pin, body.data.station, now());
    if (!r.ok) return void res.status(r.reason === 'locked' ? 429 : 401).json({ error: r.reason });
    res.setHeader('Set-Cookie', `${COOKIE}=${r.token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${opts.secure ? '; Secure' : ''}`);
    res.json({ operator: r.operator, station: body.data.station });
  });

  app.post('/api/logout', (req, res) => {
    logout(db, cookie(req, COOKIE));
    res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`);
    res.status(204).end();
  });

  app.get('/api/me', auth(), (_req, res) => res.json({ operator: res.locals.op }));

  app.get('/api/status', auth(), (_req, res) => res.json({ stats: stats(db), sync: sync.status(), branches: branches(db) }));

  app.get('/api/search', auth(), (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q.slice(0, 80) : '';
    res.json({ items: search(db, q) });
  });

  app.get('/api/households/:registrationId', auth(), (req, res) => res.json({ items: household(db, String(req.params.registrationId)) }));

  app.post('/api/checkins', auth(), (req, res) => {
    const body = z.object({ opId, attendeeId: z.string().min(1).max(64) }).safeParse(req.body);
    if (!body.success) return void res.status(422).json({ error: 'invalid' });
    const op = res.locals.op as { id: string; station: string };
    const out = checkIn(db, { opId: body.data.opId, attendeeId: body.data.attendeeId, operatorId: op.id, station: op.station }, now());
    res.status(out.status === 'not_found' ? 404 : 200).json(out);
  });

  app.post('/api/walkins', auth(), (req, res) => {
    const body = z
      .object({
        groupName: z.string().trim().min(2).max(120),
        branch: z.string().trim().max(80).optional(),
        contact: z.string().trim().max(120).optional(),
        checkIn: z.boolean().default(true),
        members: z.array(z.object({ opId, fullName: z.string().trim().min(2).max(120), ageCategory: z.enum(['adult', 'child']) })).min(1).max(20),
      })
      .safeParse(req.body);
    if (!body.success) return void res.status(422).json({ error: 'invalid', issues: body.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) });
    const op = res.locals.op as { id: string; station: string };
    res.status(201).json({ items: addWalkins(db, { ...body.data, operatorId: op.id, station: op.station }, now()) });
  });

  const fail = (res: Response, err: unknown) => {
    if (err instanceof VenueError) return void res.status(err.status).json({ error: err.code });
    throw err;
  };
  const member = z.object({ opId, fullName: z.string().trim().min(2).max(120), ageCategory: z.enum(['adult', 'child']) });

  app.patch('/api/attendees/:attendeeId', auth(), (req, res) => {
    const body = z
      .object({
        opId,
        fullName: z.string().trim().min(2).max(120).optional(),
        ageCategory: z.enum(['adult', 'child']).optional(),
        rsvp: z.enum(['confirmed', 'tentative', 'declined']).optional(),
      })
      .refine((b) => b.fullName || b.ageCategory || b.rsvp, 'Nothing to change')
      .safeParse(req.body);
    if (!body.success) return void res.status(422).json({ error: 'invalid' });
    const op = res.locals.op as { id: string; station: string };
    const { opId: id, ...edit } = body.data;
    try {
      res.json({ attendee: updateAttendee(db, { opId: id, attendeeId: String(req.params.attendeeId), edit, operatorId: op.id, station: op.station }, now()) });
    } catch (err) {
      fail(res, err);
    }
  });

  app.post('/api/households/:registrationId/members', auth(), (req, res) => {
    const body = z.object({ checkIn: z.boolean().default(true), members: z.array(member).min(1).max(20) }).safeParse(req.body);
    if (!body.success) return void res.status(422).json({ error: 'invalid' });
    const op = res.locals.op as { id: string; station: string };
    try {
      res.status(201).json({ items: addToHousehold(db, { registrationId: String(req.params.registrationId), ...body.data, operatorId: op.id, station: op.station }, now()) });
    } catch (err) {
      fail(res, err);
    }
  });

  app.post('/api/attendees/:attendeeId/undo-checkin', auth('lead'), (req, res) => {
    const body = z.object({ opId, reason: z.string().trim().max(200).optional() }).safeParse(req.body);
    if (!body.success) return void res.status(422).json({ error: 'invalid' });
    const op = res.locals.op as { id: string; station: string };
    try {
      res.json({ attendee: undoCheckin(db, { opId: body.data.opId, attendeeId: String(req.params.attendeeId), reason: body.data.reason, operatorId: op.id, station: op.station }, now()) });
    } catch (err) {
      fail(res, err);
    }
  });

  app.get('/api/branch-stats', auth(), (_req, res) => res.json({ items: branchStats(db) }));

  app.get('/api/review', auth('lead'), (_req, res) => res.json({ items: reviewItems(db) }));

  app.post('/api/sync', auth('lead'), async (_req, res) => {
    const r = await sync.runOnce();
    res.json({ ...r, sync: sync.status(), stats: stats(db) });
  });

  // Printable fallback list (no contact details).
  app.get('/print', auth(), (_req, res) => {
    const rows = rosterForPrint(db);
    const body = rows
      .map(
        (r) =>
          `<tr><td>${esc(r.branch)}</td><td>${esc(r.representativeName)}</td><td>${esc(r.fullName)}</td><td>${r.ageCategory === 'child' ? 'Child' : 'Adult'}</td><td>${esc(r.rsvp)}</td><td>${esc(r.reference)}</td><td>${r.checkedIn ? 'Yes' : '&#9744;'}</td></tr>`,
      )
      .join('');
    res
      .type('html')
      .send(
        `<!doctype html><meta charset="utf-8"><title>Venue roster</title><style>body{font:12px system-ui;margin:16px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #999;padding:4px;text-align:left}th{background:#e8f3fa}@media print{a{display:none}}</style><h1>Check-in roster</h1><p>Printed ${esc(now().toISOString())} · ${rows.length} people · <a href="javascript:print()">Print</a></p><table><thead><tr><th>Branch</th><th>Household</th><th>Name</th><th>Age</th><th>RSVP</th><th>Reference</th><th>Arrived</th></tr></thead><tbody>${body}</tbody></table>`,
      );
  });

  if (opts.webDir) {
    app.use(express.static(opts.webDir, { index: 'index.html' }));
    app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile('index.html', { root: opts.webDir }));
  }

  app.use((err: Error & { type?: string }, _req: Request, res: Response, _next: NextFunction) => {
    if (err.type === 'entity.parse.failed') return void res.status(400).json({ error: 'bad_json' });
    console.error('venue error', err.message);
    res.status(500).json({ error: 'internal_error' });
  });
  return app;
}
