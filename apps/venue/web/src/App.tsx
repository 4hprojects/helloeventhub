import { AlertTriangle, CheckCircle2, CloudOff, Cloud, LogOut, Printer, RefreshCw, Search, UserPlus, Users, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { VenueApiError} from './api';
import { opId, vapi, type Attendee, type CheckinOutcome, type Status } from './api';

const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(' ');
const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const RSVP = { confirmed: 'Attending', tentative: 'Maybe', declined: 'Declined' } as const;

type Me = { id: string; name: string; role: 'operator' | 'lead'; station: string };

export default function App() {
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  useEffect(() => {
    vapi<{ operator: Me }>('/api/me')
      .then((r) => setMe(r.operator))
      .catch(() => setMe(null));
  }, []);
  if (me === undefined) return <p className="p-6">Loading…</p>;
  if (!me) return <Login onDone={setMe} />;
  return <CheckinScreen me={me} onLogout={() => setMe(null)} />;
}

function Login({ onDone }: { onDone: (m: Me) => void }) {
  const [names, setNames] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [station, setStation] = useState(() => {
    try {
      return localStorage.getItem('venue.station') ?? '';
    } catch {
      return '';
    }
  });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    vapi<{ names: string[] }>('/api/operators').then((r) => setNames(r.names)).catch(() => undefined);
  }, []);
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-4 p-4">
      <div className="flex items-center gap-3">
        <img src="/logo-symbol.svg" alt="" className="h-12 w-12" />
        <div>
          <h1 className="text-xl font-bold">Venue check-in</h1>
          <p className="text-sm text-ink-muted">Works on the venue Wi-Fi, even without internet.</p>
        </div>
      </div>
      <form
        className="flex flex-col gap-3 rounded-xl border border-line bg-white p-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setErr(null);
          try {
            const r = await vapi<{ operator: Omit<Me, 'station'>; station: string }>('/api/login', { name, pin, station });
            try {
              localStorage.setItem('venue.station', station);
            } catch {
              /* ignore */
            }
            onDone({ ...r.operator, station: r.station });
          } catch (e2) {
            const code = (e2 as VenueApiError).code;
            setErr(code === 'locked' ? 'Too many wrong PINs. Wait 5 minutes or ask the lead.' : code === 'network' ? 'Cannot reach the venue server. Check the Wi-Fi.' : 'Name or PIN is wrong.');
          } finally {
            setBusy(false);
          }
        }}
      >
        {err && <p role="alert" className="rounded-lg bg-danger-bg p-2 text-sm font-medium text-danger">{err}</p>}
        <label className="flex flex-col gap-1 text-sm font-semibold">
          Your name
          <select className="min-h-12 rounded-lg border border-[#A9BCCB] bg-white px-3 text-base font-normal" value={name} onChange={(e) => setName(e.target.value)} required>
            <option value="">Choose…</option>
            {names.map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold">
          PIN
          <input className="min-h-12 rounded-lg border border-[#A9BCCB] px-3 text-base font-normal" type="password" inputMode="numeric" autoComplete="off" value={pin} onChange={(e) => setPin(e.target.value)} required />
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold">
          Station name
          <input className="min-h-12 rounded-lg border border-[#A9BCCB] px-3 text-base font-normal" placeholder="e.g. Table 2" value={station} onChange={(e) => setStation(e.target.value)} required maxLength={40} />
        </label>
        <button disabled={busy} className="min-h-12 rounded-lg bg-brand-strong font-semibold text-white hover:bg-brand-deep disabled:opacity-60">
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </main>
  );
}

function useStatus() {
  const [status, setStatus] = useState<Status | null>(null);
  const [lanOk, setLanOk] = useState(true);
  const refresh = useCallback(async () => {
    try {
      setStatus(await vapi<Status>('/api/status'));
      setLanOk(true);
    } catch (e) {
      if ((e as VenueApiError).status === 0) setLanOk(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
    const t = setInterval(refresh, 10_000);
    return () => clearInterval(t);
  }, [refresh]);
  return { status, lanOk, refresh, setStatus };
}

function StatusBar({ status, lanOk }: { status: Status | null; lanOk: boolean }) {
  if (!lanOk)
    return (
      <div role="alert" className="flex items-center gap-2 bg-danger px-4 py-2 font-semibold text-white">
        <AlertTriangle className="size-5" aria-hidden /> Venue server not reachable — check Wi-Fi. Use the printed list until it's back.
      </div>
    );
  if (!status) return null;
  const s = status.sync;
  const online = s.configured && s.cloudReachable;
  return (
    <div role="status" className={cx('flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 text-sm font-medium', online ? 'bg-success-bg text-success' : 'bg-warning-bg text-warning')}>
      <span className="flex items-center gap-1.5">
        {online ? <Cloud className="size-4" aria-hidden /> : <CloudOff className="size-4" aria-hidden />}
        {!s.configured ? 'Local only (cloud sync not set up)' : online ? 'Cloud connected' : 'No internet — saving locally'}
      </span>
      <span>{status.stats.pendingSync} waiting to sync</span>
      {s.lastPushAt && <span>Last sync {time(s.lastPushAt)}</span>}
      {!s.rosterVerifiedAt && s.configured && <span className="font-semibold">Roster not verified</span>}
      {status.stats.needsReview > 0 && <span className="font-semibold">{status.stats.needsReview} need review</span>}
    </div>
  );
}

function CheckinScreen({ me, onLogout }: { me: Me; onLogout: () => void }) {
  const { status, lanOk, refresh, setStatus } = useStatus();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Attendee[]>([]);
  const [searching, setSearching] = useState(false);
  const [toast, setToast] = useState<{ tone: 'ok' | 'warn' | 'err'; text: string } | null>(null);
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [walkin, setWalkin] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  /** Pending op ids per attendee so a retry after a network blip reuses the same id (no double counting). */
  const pendingOps = useRef(new Map<string, string>());

  const runSearch = useCallback(async (term: string) => {
    if (term.trim().length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      setResults((await vapi<{ items: Attendee[] }>(`/api/search?q=${encodeURIComponent(term)}`)).items);
    } catch (e) {
      if ((e as VenueApiError).status === 401) onLogout();
    } finally {
      setSearching(false);
    }
  }, [onLogout]);

  useEffect(() => {
    const t = setTimeout(() => void runSearch(q), 200);
    return () => clearTimeout(t);
  }, [q, runSearch]);

  const doCheckin = async (a: Attendee): Promise<CheckinOutcome | null> => {
    const id = pendingOps.current.get(a.attendeeId) ?? opId();
    pendingOps.current.set(a.attendeeId, id);
    try {
      const r = await vapi<CheckinOutcome>('/api/checkins', { opId: id, attendeeId: a.attendeeId });
      pendingOps.current.delete(a.attendeeId);
      if (r.status === 'checked_in') setToast({ tone: 'ok', text: `${a.fullName} checked in.` });
      else if (r.status === 'already_checked_in') setToast({ tone: 'warn', text: `${a.fullName} was already checked in at ${time(r.firstAt)}${r.station ? ` (${r.station})` : ''}. Not counted again.` });
      else if (r.status === 'not_active') setToast({ tone: 'err', text: `${a.fullName}'s registration is cancelled. Ask the lead.` });
      void runSearch(q);
      void refresh();
      return r;
    } catch (e) {
      const err = e as VenueApiError;
      if (err.status === 401) onLogout();
      setToast({ tone: 'err', text: err.status === 0 ? `Not saved — Wi-Fi problem. Tap Check in again for ${a.fullName}.` : 'Could not check in. Try again.' });
      return null;
    }
  };

  const lead = me.role === 'lead';
  const s = status?.stats;
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex flex-wrap items-center justify-between gap-2 bg-brand-deep px-4 py-2 text-white">
        <p className="font-semibold">
          Check-in · <span className="font-normal">{me.name} at {me.station}</span>
        </p>
        <div className="flex items-center gap-1">
          <a href="/print" target="_blank" className="inline-flex min-h-10 items-center gap-1 rounded px-2 text-sm text-white hover:bg-white/10">
            <Printer className="size-4" aria-hidden /> Print list
          </a>
          {lead && (
            <button
              className="inline-flex min-h-10 items-center gap-1 rounded px-2 text-sm hover:bg-white/10 disabled:opacity-60"
              disabled={syncing}
              onClick={async () => {
                setSyncing(true);
                try {
                  const r = await vapi<{ error?: string; stats: Status['stats']; sync: Status['sync'] }>('/api/sync', {});
                  setToast(r.error ? { tone: 'warn', text: `Sync: ${r.error}. Check-ins are safe on this laptop.` } : { tone: 'ok', text: 'Synced with the cloud.' });
                  setStatus((st) => (st ? { ...st, stats: r.stats, sync: r.sync } : st));
                } finally {
                  setSyncing(false);
                }
              }}
            >
              <RefreshCw className={cx('size-4', syncing && 'animate-spin')} aria-hidden /> Sync now
            </button>
          )}
          <button
            className="inline-flex min-h-10 items-center gap-1 rounded px-2 text-sm hover:bg-white/10"
            onClick={async () => {
              await vapi('/api/logout', {}).catch(() => undefined);
              onLogout();
            }}
          >
            <LogOut className="size-4" aria-hidden /> Sign out
          </button>
        </div>
      </header>
      <StatusBar status={status} lanOk={lanOk} />
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 p-4">
        {s && (
          <dl className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl border border-line bg-white p-2">
              <dt className="text-xs text-ink-muted">Arrived</dt>
              <dd className="text-2xl font-bold tabular-nums">{s.checkedIn}</dd>
            </div>
            <div className="rounded-xl border border-line bg-white p-2">
              <dt className="text-xs text-ink-muted">Expected</dt>
              <dd className="text-2xl font-bold tabular-nums">{s.expected}</dd>
            </div>
            <div className="rounded-xl border border-line bg-white p-2">
              <dt className="text-xs text-ink-muted">Walk-ins</dt>
              <dd className="text-2xl font-bold tabular-nums">{s.walkins}</dd>
            </div>
          </dl>
        )}
        {toast && (
          <div role={toast.tone === 'err' ? 'alert' : 'status'} className={cx('flex items-start justify-between gap-2 rounded-xl p-3 font-medium', toast.tone === 'ok' ? 'bg-success-bg text-success' : toast.tone === 'warn' ? 'bg-warning-bg text-warning' : 'bg-danger-bg text-danger')}>
            <span>{toast.text}</span>
            <button aria-label="Dismiss" onClick={() => setToast(null)}>
              <X className="size-4" />
            </button>
          </div>
        )}
        <div className="flex gap-2">
          <label className="relative flex-1">
            <span className="sr-only">Search by name or reference</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-ink-muted" aria-hidden />
            <input
              ref={searchRef}
              autoFocus
              type="search"
              className="min-h-14 w-full rounded-xl border border-[#A9BCCB] bg-white pl-10 pr-3 text-lg"
              placeholder="Name or HEH- reference"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </label>
          <button className="inline-flex min-h-14 items-center gap-1 rounded-xl border border-line bg-white px-3 font-semibold text-brand-deep" onClick={() => setWalkin(true)}>
            <UserPlus className="size-5" aria-hidden /> Walk-in
          </button>
        </div>
        {searching && <p className="text-sm text-ink-muted">Searching…</p>}
        {q.trim().length >= 2 && !searching && results.length === 0 && (
          <p className="rounded-xl bg-white p-3 text-ink-muted">No one found. Try another spelling, the household name, or register a walk-in.</p>
        )}
        <ul className="flex flex-col gap-2">
          {results.map((a) => (
            <PersonRow key={a.attendeeId} a={a} onCheckin={doCheckin} onHousehold={() => setHouseholdId(a.registrationId)} />
          ))}
        </ul>
        <BranchPanel refreshKey={s?.checkedIn ?? 0} />
        {lead && s && s.needsReview > 0 && <Review />}
      </main>
      {householdId && (
        <Household
          id={householdId}
          lead={lead}
          onClose={() => { setHouseholdId(null); searchRef.current?.focus(); void runSearch(q); }}
          onCheckin={doCheckin}
          onChanged={(text) => { setToast({ tone: 'ok', text }); void refresh(); }}
        />
      )}
      {walkin && (
        <WalkinForm
          branches={status?.branches ?? []}
          onClose={() => setWalkin(false)}
          onSaved={(n) => {
            setWalkin(false);
            setToast({ tone: 'ok', text: `${n} walk-in${n === 1 ? '' : 's'} registered and checked in.` });
            void refresh();
          }}
        />
      )}
    </div>
  );
}

function PersonRow({ a, onCheckin, onHousehold, extra }: { a: Attendee; onCheckin: (a: Attendee) => Promise<unknown>; onHousehold?: () => void; extra?: React.ReactNode }) {
  const [busy, setBusy] = useState(false);
  return (
    <li className={cx('flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-white p-3', a.checkedIn ? 'border-success/40' : 'border-line')}>
      <div className="min-w-0">
        <p className="text-lg font-semibold">
          {a.fullName} {a.ageCategory === 'child' && <span className="text-sm font-normal text-ink-muted">(child)</span>}
        </p>
        <p className="text-sm text-ink-muted">
          {a.branch} · {a.representativeName} · <span className="font-mono">{a.reference}</span> · {RSVP[a.rsvp]}
          {!a.active && <span className="font-semibold text-danger"> · CANCELLED</span>}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {extra}
        {onHousehold && (
          <button className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-sm text-brand-deep hover:bg-brand-ice" onClick={onHousehold}>
            <Users className="size-4" aria-hidden /> Household
          </button>
        )}
        {a.checkedIn ? (
          <span className="inline-flex min-h-11 items-center gap-1 rounded-lg bg-success-bg px-3 text-sm font-semibold text-success">
            <CheckCircle2 className="size-4" aria-hidden /> In at {time(a.checkedIn.at)}
          </span>
        ) : (
          <button
            disabled={busy || !a.active}
            className="min-h-11 rounded-lg bg-brand-strong px-4 font-semibold text-white hover:bg-brand-deep disabled:opacity-50"
            onClick={async () => {
              setBusy(true);
              await onCheckin(a);
              setBusy(false);
            }}
          >
            {busy ? 'Saving…' : 'Check in'}
          </button>
        )}
      </div>
    </li>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-4 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="min-w-0 truncate text-lg font-bold" title={title}>{title}</h2>
          <button aria-label="Close" className="rounded p-2 hover:bg-brand-ice" onClick={onClose}>
            <X className="size-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

const inputCls = 'min-h-12 w-full rounded-lg border border-[#A9BCCB] bg-white px-3 text-base';

function Household({ id, lead, onClose, onCheckin, onChanged }: { id: string; lead: boolean; onClose: () => void; onCheckin: (a: Attendee) => Promise<unknown>; onChanged: (msg: string) => void }) {
  const [items, setItems] = useState<Attendee[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(() => vapi<{ items: Attendee[] }>(`/api/households/${encodeURIComponent(id)}`).then((r) => setItems(r.items)), [id]);
  useEffect(() => {
    void load();
  }, [load]);
  const notIn = items.filter((a) => a.active && !a.checkedIn);
  const [undoing, setUndoing] = useState<string | null>(null);
  const undo = async (a: Attendee, reason: string) => {
    try {
      await vapi(`/api/attendees/${encodeURIComponent(a.attendeeId)}/undo-checkin`, { opId: opId(), reason });
      setUndoing(null);
      onChanged(`Check-in for ${a.fullName} undone.`);
      await load();
    } catch (e) {
      const code = (e as VenueApiError).code;
      setErr(code === 'checked_in_elsewhere' ? 'This check-in was made on another device or online — ask the organizers to undo it.' : 'Could not undo. Try again.');
    }
  };
  return (
    <Modal title={items[0] ? `Household of ${items[0].representativeName}` : 'Household'} onClose={onClose}>
      {items[0] && <p className="-mt-2 mb-3 font-mono text-sm text-ink-muted">{items[0].reference}</p>}
      {err && <p role="alert" className="mb-2 rounded-lg bg-danger-bg p-2 text-sm font-medium text-danger">{err}</p>}
      <ul className="flex flex-col gap-2">
        {items.map((a) =>
          undoing === a.attendeeId ? (
            <li key={a.attendeeId}>
              <UndoConfirm a={a} onCancel={() => setUndoing(null)} onConfirm={(reason) => undo(a, reason)} />
            </li>
          ) : editing === a.attendeeId ? (
            <li key={a.attendeeId}>
              <EditPerson a={a} onCancel={() => setEditing(null)} onSaved={async () => { setEditing(null); onChanged(`${a.fullName} updated.`); await load(); }} />
            </li>
          ) : (
            <PersonRow
              key={a.attendeeId}
              a={a}
              onCheckin={async (x) => { await onCheckin(x); await load(); }}
              extra={
                <>
                  {a.active && (
                    <button className="min-h-11 rounded-lg border border-line px-3 text-sm font-semibold text-brand-deep hover:bg-brand-ice" onClick={() => setEditing(a.attendeeId)}>
                      Edit
                    </button>
                  )}
                  {lead && a.checkedIn && (
                    <button className="min-h-11 rounded-lg border border-danger/40 px-3 text-sm font-semibold text-danger hover:bg-danger-bg" onClick={() => setUndoing(a.attendeeId)}>
                      Undo
                    </button>
                  )}
                </>
              }
            />
          ),
        )}
      </ul>
      {notIn.length > 1 && (
        <button
          className="mt-3 min-h-12 w-full rounded-lg bg-brand-strong font-semibold text-white"
          onClick={async () => {
            for (const a of notIn) await onCheckin(a);
            await load();
          }}
        >
          Check in all {notIn.length}
        </button>
      )}
      {adding ? (
        <AddMember registrationId={id} onCancel={() => setAdding(false)} onSaved={async (n) => { setAdding(false); onChanged(`${n} added to this household and checked in.`); await load(); }} />
      ) : (
        items.some((a) => a.active) && (
          <button className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-1 rounded-lg border border-line font-semibold text-brand-deep" onClick={() => setAdding(true)}>
            <UserPlus className="size-4" aria-hidden /> Add person to this household
          </button>
        )
      )}
    </Modal>
  );
}

function UndoConfirm({ a, onCancel, onConfirm }: { a: Attendee; onCancel: () => void; onConfirm: (reason: string) => Promise<void> }) {
  const [reason, setReason] = useState('Checked in by mistake');
  const [busy, setBusy] = useState(false);
  return (
    <div role="group" aria-label={`Undo check-in for ${a.fullName}`} className="flex flex-col gap-2 rounded-xl border border-danger/40 bg-danger-bg p-3">
      <p className="font-semibold">Undo check-in for {a.fullName}?</p>
      <p className="text-sm">They will no longer count as arrived. Use this only for mistakes.</p>
      <label className="text-sm font-semibold">
        Reason
        <select className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)}>
          <option>Checked in by mistake</option>
          <option>Wrong person selected</option>
          <option>Left before the event started</option>
          <option>Other</option>
        </select>
      </label>
      <div className="flex gap-2">
        <button
          disabled={busy}
          className="min-h-11 flex-1 rounded-lg bg-danger font-semibold text-white disabled:opacity-60"
          onClick={async () => {
            setBusy(true);
            await onConfirm(reason);
            setBusy(false);
          }}
        >
          {busy ? 'Undoing…' : 'Confirm undo'}
        </button>
        <button type="button" className="min-h-11 rounded-lg border border-line bg-white px-3" onClick={onCancel}>
          Keep check-in
        </button>
      </div>
    </div>
  );
}

function EditPerson({ a, onCancel, onSaved }: { a: Attendee; onCancel: () => void; onSaved: () => void }) {
  const [fullName, setFullName] = useState(a.fullName);
  const [age, setAge] = useState(a.ageCategory);
  const [rsvp, setRsvp] = useState(a.rsvp);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const op = useRef(opId());
  return (
    <form
      className="flex flex-col gap-2 rounded-xl border border-brand-strong bg-brand-ice p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const body = { opId: op.current, ...(fullName.trim() !== a.fullName ? { fullName: fullName.trim() } : {}), ...(age !== a.ageCategory ? { ageCategory: age } : {}), ...(rsvp !== a.rsvp ? { rsvp } : {}) };
        if (Object.keys(body).length === 1) return onCancel();
        setBusy(true);
        try {
          const res = await fetch(`/api/attendees/${encodeURIComponent(a.attendeeId)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'X-Venue-Request': '1' }, body: JSON.stringify(body) });
          if (!res.ok) throw new Error(String(res.status));
          onSaved();
        } catch {
          setErr('Not saved. Check the Wi-Fi and press Save again.');
        } finally {
          setBusy(false);
        }
      }}
    >
      {err && <p role="alert" className="text-sm font-medium text-danger">{err}</p>}
      <label className="text-sm font-semibold">
        Full name
        <input className={inputCls} value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={120} />
      </label>
      <label className="text-sm font-semibold">
        Age group
        <select className={inputCls} value={age} onChange={(e) => setAge(e.target.value as Attendee['ageCategory'])}>
          <option value="adult">Adult</option>
          <option value="child">Child</option>
        </select>
      </label>
      <label className="text-sm font-semibold">
        RSVP
        <select className={inputCls} value={rsvp} onChange={(e) => setRsvp(e.target.value as Attendee['rsvp'])}>
          <option value="confirmed">Attending</option>
          <option value="tentative">Maybe</option>
          <option value="declined">Declined</option>
        </select>
      </label>
      <p className="text-xs text-ink-muted">Saved on this laptop now; sent to the organizers when internet is back. If they changed this person online meanwhile, it goes to review.</p>
      <div className="flex gap-2">
        <button disabled={busy} className="min-h-11 flex-1 rounded-lg bg-brand-strong font-semibold text-white disabled:opacity-60">{busy ? 'Saving…' : 'Save'}</button>
        <button type="button" className="min-h-11 rounded-lg border border-line px-3" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

function AddMember({ registrationId, onCancel, onSaved }: { registrationId: string; onCancel: () => void; onSaved: (n: number) => void }) {
  const [fullName, setFullName] = useState('');
  const [age, setAge] = useState<'adult' | 'child'>('adult');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const op = useRef(opId());
  return (
    <form
      className="mt-3 flex flex-col gap-2 rounded-xl border border-line p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (fullName.trim().length < 2) return setErr('Enter a full name.');
        setBusy(true);
        setErr(null);
        try {
          await vapi(`/api/households/${encodeURIComponent(registrationId)}/members`, { checkIn: true, members: [{ opId: op.current, fullName: fullName.trim(), ageCategory: age }] });
          onSaved(1);
        } catch (e2) {
          setErr((e2 as VenueApiError).status === 0 ? 'Not saved — Wi-Fi problem. Press Add again.' : 'Could not add this person.');
        } finally {
          setBusy(false);
        }
      }}
    >
      {err && <p role="alert" className="text-sm font-medium text-danger">{err}</p>}
      <label className="text-sm font-semibold">
        Full name
        <input className={inputCls} value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={120} autoFocus />
      </label>
      <label className="text-sm font-semibold">
        Age group
        <select className={inputCls} value={age} onChange={(e) => setAge(e.target.value as 'adult' | 'child')}>
          <option value="adult">Adult</option>
          <option value="child">Child</option>
        </select>
      </label>
      <div className="flex gap-2">
        <button disabled={busy} className="min-h-11 flex-1 rounded-lg bg-brand-strong font-semibold text-white disabled:opacity-60">{busy ? 'Saving…' : 'Add and check in'}</button>
        <button type="button" className="min-h-11 rounded-lg border border-line px-3" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

function BranchPanel({ refreshKey }: { refreshKey: number }) {
  const [rows, setRows] = useState<Array<{ branch: string; expected: number; arrived: number; walkins: number }>>([]);
  useEffect(() => {
    vapi<{ items: typeof rows }>('/api/branch-stats').then((r) => setRows(r.items)).catch(() => undefined);
  }, [refreshKey]);
  if (!rows.length) return null;
  return (
    <details className="rounded-xl border border-line bg-white p-3">
      <summary className="cursor-pointer font-semibold">By branch</summary>
      <table className="mt-2 w-full text-sm">
        <thead>
          <tr className="text-left text-ink-muted">
            <th className="py-1">Branch</th>
            <th className="py-1 text-right">Arrived</th>
            <th className="py-1 text-right">Expected</th>
            <th className="py-1 text-right">Walk-ins</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.branch} className="border-t border-line">
              <td className="py-1">{r.branch}</td>
              <td className="py-1 text-right font-semibold tabular-nums">{r.arrived}</td>
              <td className="py-1 text-right tabular-nums">{r.expected}</td>
              <td className="py-1 text-right tabular-nums">{r.walkins}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

function WalkinForm({ branches, onClose, onSaved }: { branches: string[]; onClose: () => void; onSaved: (n: number) => void }) {
  const [members, setMembers] = useState([{ opId: opId(), fullName: '', ageCategory: 'adult' as 'adult' | 'child' }]);
  const [groupName, setGroupName] = useState('');
  const [branch, setBranch] = useState('');
  const [contact, setContact] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const input = 'min-h-12 w-full rounded-lg border border-[#A9BCCB] bg-white px-3 text-base';
  return (
    <Modal title="Register walk-ins" onClose={onClose}>
      <form
        className="flex flex-col gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          const filled = members.filter((m) => m.fullName.trim().length >= 2);
          if (!filled.length) return setErr('Enter at least one full name.');
          setBusy(true);
          setErr(null);
          try {
            await vapi('/api/walkins', { groupName: groupName.trim() || filled[0]!.fullName, branch: branch || undefined, contact: contact.trim() || undefined, members: filled, checkIn: true });
            onSaved(filled.length);
          } catch (e2) {
            setErr((e2 as VenueApiError).status === 0 ? 'Not saved — Wi-Fi problem. Press Save again.' : 'Could not save. Check the names.');
          } finally {
            setBusy(false);
          }
        }}
      >
        <p className="text-sm text-ink-muted">Search first to avoid duplicates. Walk-ins are marked for the organizers to review.</p>
        {err && <p role="alert" className="rounded-lg bg-danger-bg p-2 text-sm font-medium text-danger">{err}</p>}
        {members.map((m, i) => (
          <fieldset key={m.opId} className="flex flex-col gap-2 rounded-lg border border-line p-3">
            <legend className="px-1 text-sm font-semibold">Person {i + 1}</legend>
            <label className="text-sm font-semibold">
              Full name
              <input className={input} value={m.fullName} onChange={(e) => setMembers((ms) => ms.map((x) => (x.opId === m.opId ? { ...x, fullName: e.target.value } : x)))} maxLength={120} />
            </label>
            <div className="flex gap-2" role="radiogroup" aria-label={`Person ${i + 1} age group`}>
              {(['adult', 'child'] as const).map((v) => (
                <label key={v} className={cx('flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg border', m.ageCategory === v ? 'border-brand-strong bg-brand-ice' : 'border-line')}>
                  <input type="radio" name={`age-${m.opId}`} checked={m.ageCategory === v} onChange={() => setMembers((ms) => ms.map((x) => (x.opId === m.opId ? { ...x, ageCategory: v } : x)))} />
                  {v === 'adult' ? 'Adult' : 'Child'}
                </label>
              ))}
            </div>
          </fieldset>
        ))}
        {members.length < 20 && (
          <button type="button" className="min-h-11 rounded-lg border border-line font-semibold text-brand-deep" onClick={() => setMembers((ms) => [...ms, { opId: opId(), fullName: '', ageCategory: 'adult' }])}>
            + Add person
          </button>
        )}
        <label className="text-sm font-semibold">
          Household name <span className="font-normal text-ink-muted">(defaults to first person)</span>
          <input className={input} value={groupName} onChange={(e) => setGroupName(e.target.value)} maxLength={120} />
        </label>
        <label className="text-sm font-semibold">
          Family branch
          <select className={input} value={branch} onChange={(e) => setBranch(e.target.value)}>
            <option value="">Not specified</option>
            {branches.filter((b) => b !== 'Not specified').map((b) => (
              <option key={b}>{b}</option>
            ))}
          </select>
        </label>
        <label className="text-sm font-semibold">
          Contact <span className="font-normal text-ink-muted">(optional — only if the organizers need it)</span>
          <input className={input} value={contact} onChange={(e) => setContact(e.target.value)} maxLength={120} />
        </label>
        <button disabled={busy} className="min-h-12 rounded-lg bg-brand-strong font-semibold text-white disabled:opacity-60">
          {busy ? 'Saving…' : 'Save and check in'}
        </button>
      </form>
    </Modal>
  );
}

function Review() {
  const [items, setItems] = useState<Array<{ kind: string; op_id: string; full_name: string; reference: string; local_time: string; sync_status: string }>>([]);
  useEffect(() => {
    vapi<{ items: typeof items }>('/api/review').then((r) => setItems(r.items)).catch(() => undefined);
  }, []);
  return (
    <section className="rounded-xl border border-warning/40 bg-warning-bg p-3">
      <h2 className="font-semibold text-warning">Needs review after sync</h2>
      <p className="text-sm">The cloud could not accept these automatically (for example, the registration was cancelled online). Give this list to the organizers.</p>
      <ul className="mt-2 text-sm">
        {items.map((i) => (
          <li key={i.op_id}>
            {i.kind === 'walkin' ? 'Walk-in' : 'Check-in'}: {i.full_name} ({i.reference}) at {time(i.local_time)} — {i.sync_status.replace('_', ' ')}
          </li>
        ))}
      </ul>
    </section>
  );
}
