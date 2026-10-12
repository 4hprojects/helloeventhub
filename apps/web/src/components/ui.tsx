import { AlertCircle, AlertTriangle, CheckCircle2, Info, Loader2 } from 'lucide-react';
import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';

export function cx(...c: Array<string | false | null | undefined>) {
  return c.filter(Boolean).join(' ');
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
const variants: Record<Variant, string> = {
  primary: 'bg-brand-strong text-white hover:bg-brand-deep disabled:bg-brand-strong/60',
  secondary: 'bg-white text-brand-deep border border-line hover:bg-brand-ice disabled:opacity-60',
  ghost: 'bg-transparent text-brand-deep hover:bg-brand-ice disabled:opacity-60',
  danger: 'bg-danger text-white hover:bg-[#912018] disabled:opacity-60',
};

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean; size?: 'md' | 'sm' }>(
  function Button({ variant = 'primary', loading, size = 'md', className, children, disabled, ...rest }, ref) {
    return (
      <button
        ref={ref}
        className={cx(
          'inline-flex items-center justify-center gap-2 rounded-[10px] font-semibold transition-colors disabled:cursor-not-allowed',
          size === 'md' ? 'min-h-12 px-5 text-base' : 'min-h-10 px-3 text-sm',
          variants[variant],
          className,
        )}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...rest}
      >
        {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
        {children}
      </button>
    );
  },
);

export function Card({ children, className, as: As = 'section' }: { children: ReactNode; className?: string; as?: 'section' | 'div' | 'article' }) {
  return <As className={cx('rounded-[var(--radius-card)] border border-line bg-white p-4 sm:p-6 shadow-[0_1px_2px_rgba(36,51,72,0.06)]', className)}>{children}</As>;
}

const alertStyles = {
  info: { cls: 'bg-brand-ice border-brand-sky text-brand-deep', Icon: Info },
  success: { cls: 'bg-success-bg border-success/40 text-success', Icon: CheckCircle2 },
  warning: { cls: 'bg-warning-bg border-warning/40 text-warning', Icon: AlertTriangle },
  error: { cls: 'bg-danger-bg border-danger/40 text-danger', Icon: AlertCircle },
};

export function Alert({ tone = 'info', title, children, className }: { tone?: keyof typeof alertStyles; title?: string; children?: ReactNode; className?: string }) {
  const { cls, Icon } = alertStyles[tone];
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={cx('flex gap-3 rounded-[10px] border p-3 sm:p-4', cls, className)}>
      <Icon className="mt-0.5 size-5 shrink-0" aria-hidden />
      <div className="min-w-0 text-sm text-ink">
        {title && <p className="font-semibold">{title}</p>}
        {children}
      </div>
    </div>
  );
}

interface FieldProps {
  label: string;
  hint?: ReactNode;
  error?: string;
  required?: boolean;
  /** Show "(optional)" after the label. Off by default: only useful in public forms. */
  optional?: boolean;
  id?: string;
}

function FieldShell({ label, hint, error, required, optional, id, children }: FieldProps & { id: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold text-ink">
        {label}
        {required ? <span className="text-danger"> *</span> : optional ? <span className="font-normal text-ink-muted"> (optional)</span> : null}
      </label>
      {hint && (
        <p id={`${id}-hint`} className="text-sm text-ink-muted">
          {hint}
        </p>
      )}
      {children}
      {error && (
        <p id={`${id}-error`} className="flex items-start gap-1 text-sm font-medium text-danger">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {error}
        </p>
      )}
    </div>
  );
}

const inputCls = (error?: string) =>
  cx(
    'w-full min-h-12 rounded-[10px] border bg-white px-3 text-base text-ink placeholder:text-ink-muted/70',
    error ? 'border-danger ring-1 ring-danger' : 'border-[#A9BCCB] hover:border-brand-strong',
  );

function describedBy(id: string, hint?: ReactNode, error?: string) {
  return [hint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined;
}

export function TextField({ label, hint, error, required, optional, id, className, ...rest }: FieldProps & InputHTMLAttributes<HTMLInputElement>) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <FieldShell label={label} hint={hint} error={error} required={required} optional={optional} id={fid}>
      <input id={fid} className={cx(inputCls(error), className)} aria-invalid={!!error || undefined} aria-describedby={describedBy(fid, hint, error)} required={required} {...rest} />
    </FieldShell>
  );
}

export function TextArea({ label, hint, error, required, optional, id, ...rest }: FieldProps & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <FieldShell label={label} hint={hint} error={error} required={required} optional={optional} id={fid}>
      <textarea id={fid} className={cx(inputCls(error), 'min-h-24 py-2')} aria-invalid={!!error || undefined} aria-describedby={describedBy(fid, hint, error)} required={required} {...rest} />
    </FieldShell>
  );
}

export function SelectField({ label, hint, error, required, optional, id, children, ...rest }: FieldProps & SelectHTMLAttributes<HTMLSelectElement>) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <FieldShell label={label} hint={hint} error={error} required={required} optional={optional} id={fid}>
      <select id={fid} className={inputCls(error)} aria-invalid={!!error || undefined} aria-describedby={describedBy(fid, hint, error)} required={required} {...rest}>
        {children}
      </select>
    </FieldShell>
  );
}

export function Checkbox({ label, hint, error, id, ...rest }: { label: ReactNode; hint?: ReactNode; error?: string } & InputHTMLAttributes<HTMLInputElement>) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-start gap-3">
        <input id={fid} type="checkbox" className="mt-1 size-5 shrink-0 accent-[var(--color-brand-strong)]" aria-invalid={!!error || undefined} aria-describedby={describedBy(fid, hint, error)} {...rest} />
        <label htmlFor={fid} className="text-base text-ink">
          {label}
        </label>
      </div>
      {hint && (
        <p id={`${fid}-hint`} className="ml-8 text-sm text-ink-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${fid}-error`} className="ml-8 text-sm font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

/** Segmented radio group with visible text labels (status is never color-only). */
export function RadioGroup<T extends string>({
  legend,
  name,
  value,
  options,
  onChange,
  error,
  id,
}: {
  legend: string;
  name: string;
  value: T | '';
  options: Array<{ value: T; label: string }>;
  onChange: (v: T) => void;
  error?: string;
  id?: string;
}) {
  return (
    <fieldset id={id} className="min-w-0">
      <legend className="mb-1.5 text-sm font-semibold text-ink">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const checked = value === o.value;
          return (
            <label
              key={o.value}
              className={cx(
                'flex min-h-11 cursor-pointer items-center gap-2 rounded-[10px] border px-3 text-sm font-medium',
                checked ? 'border-brand-strong bg-brand-ice text-brand-deep ring-1 ring-brand-strong' : 'border-[#A9BCCB] bg-white text-ink hover:border-brand-strong',
              )}
            >
              <input type="radio" className="size-4 accent-[var(--color-brand-strong)]" name={name} value={o.value} checked={checked} onChange={() => onChange(o.value)} />
              {o.label}
            </label>
          );
        })}
      </div>
      {error && <p className="mt-1 text-sm font-medium text-danger">{error}</p>}
    </fieldset>
  );
}

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <p role="status" className="flex items-center gap-2 py-6 text-ink-muted">
      <Loader2 className="size-5 animate-spin" aria-hidden /> {label}
    </p>
  );
}

const badgeTones = {
  neutral: 'bg-[#EEF2F6] text-ink',
  brand: 'bg-brand-ice text-brand-deep',
  success: 'bg-success-bg text-success',
  warning: 'bg-warning-bg text-warning',
  danger: 'bg-danger-bg text-danger',
};
export function Badge({ tone = 'neutral', children }: { tone?: keyof typeof badgeTones; children: ReactNode }) {
  return <span className={cx('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold', badgeTones[tone])}>{children}</span>;
}

export const RSVP_LABEL = { confirmed: 'Attending', tentative: 'Maybe', declined: 'Not attending' } as const;
export const RSVP_TONE = { confirmed: 'success', tentative: 'warning', declined: 'neutral' } as const;
export function RsvpBadge({ rsvp }: { rsvp: keyof typeof RSVP_LABEL }) {
  return <Badge tone={RSVP_TONE[rsvp]}>{RSVP_LABEL[rsvp]}</Badge>;
}

/** Screen-reader friendly error summary that receives focus when shown. */
export function ErrorSummary({ errors, title = 'Please fix the following:' }: { errors: Array<{ id: string; message: string }>; title?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const key = errors.map((e) => e.id + e.message).join('|');
  useEffect(() => {
    if (errors.length) ref.current?.focus();
  }, [key, errors.length]);
  if (!errors.length) return null;
  return (
    <div ref={ref} tabIndex={-1} role="alert" className="rounded-[10px] border border-danger/40 bg-danger-bg p-4">
      <p className="flex items-center gap-2 font-semibold text-danger">
        <AlertCircle className="size-5" aria-hidden /> {title}
      </p>
      <ul className="mt-2 list-disc pl-6 text-sm text-ink">
        {errors.map((e) => (
          <li key={e.id + e.message}>
            <a href={`#${e.id}`} onClick={(ev) => { ev.preventDefault(); const el = document.getElementById(e.id); el?.focus(); el?.scrollIntoView({ block: 'center' }); }}>
              {e.message}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Stat({ label, value, hint, tone = 'neutral' }: { label: string; value: number | string; hint?: string; tone?: 'neutral' | 'brand' }) {
  return (
    <div className={cx('rounded-[var(--radius-card)] border border-line p-4', tone === 'brand' ? 'bg-brand-ice' : 'bg-white')}>
      <p className="text-sm font-medium text-ink-muted">{label}</p>
      <p className="mt-1 font-display text-3xl font-bold tabular-nums text-ink">{value}</p>
      {hint && <p className="mt-1 text-xs text-ink-muted">{hint}</p>}
    </div>
  );
}

export function PageTitle({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-4">
      <h1 className="text-2xl font-bold sm:text-3xl">{children}</h1>
      {sub && <p className="mt-1 text-ink-muted">{sub}</p>}
    </div>
  );
}
