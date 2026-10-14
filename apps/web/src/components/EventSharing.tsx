import { useEffect, useMemo, useState } from 'react';
import { Copy, Download, ExternalLink, MapPin, Share2 } from 'lucide-react';
import QRCode from 'qrcode';
import { Button, Card } from './ui';

function eventUrl(slug: string) {
  return new URL(`/events/${slug}`, window.location.origin).toString();
}

export function canonicalEventUrl(slug: string) {
  return `https://helloeventhub.online/events/${encodeURIComponent(slug)}`;
}

const qrOptions = {
  type: 'svg' as const,
  margin: 4,
  errorCorrectionLevel: 'H' as const,
  color: { dark: '#123f2a', light: '#fffdf5' },
};

export function useQrSvg(url: string) {
  const [state, setState] = useState<{ src: string; error: boolean }>({ src: '', error: false });
  useEffect(() => {
    let current = true;
    setState({ src: '', error: false });
    void QRCode.toString(url, qrOptions)
      .then((svg) => {
        if (current)
          setState({ src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`, error: false });
      })
      .catch(() => {
        if (current) setState({ src: '', error: true });
      });
    return () => {
      current = false;
    };
  }, [url]);
  return state;
}

async function copyText(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const input = document.createElement('textarea');
  input.value = text;
  input.readOnly = true;
  input.style.position = 'fixed';
  input.style.opacity = '0';
  document.body.append(input);
  input.select();
  const copied = document.execCommand('copy');
  input.remove();
  if (!copied) throw new Error('Copy failed');
}

export function ShareEventButton({ slug, title }: { slug: string; title: string }) {
  const [message, setMessage] = useState('');

  const share = async () => {
    const url = eventUrl(slug);
    setMessage('');
    if (navigator.share) {
      try {
        await navigator.share({ title, text: `View the details for ${title}.`, url });
        setMessage('Event shared.');
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
      }
    }

    try {
      await copyText(url);
      setMessage('Event link copied.');
    } catch {
      setMessage('Could not copy the link. Copy it from your browser address bar.');
    }
  };

  return (
    <span className="inline-flex flex-col items-start">
      <Button type="button" variant="secondary" size="sm" onClick={() => void share()}>
        <Share2 className="size-4" aria-hidden /> Share event
      </Button>
      <span aria-live="polite" className="mt-1 text-xs text-ink-muted">
        {message}
      </span>
    </span>
  );
}

export function OrganizerEventShare({ slug, title }: { slug: string; title: string }) {
  const [qrUrls, setQrUrls] = useState({ event: '', registration: '' });
  const [qrError, setQrError] = useState(false);
  const [message, setMessage] = useState('');
  const publicUrl = eventUrl(slug);
  const registrationUrl = new URL(`/events/${slug}/register`, window.location.origin).toString();

  useEffect(() => {
    let current = true;
    const options = {
      width: 1024,
      margin: 4,
      errorCorrectionLevel: 'H' as const,
      color: { dark: '#205477', light: '#ffffff' },
    };
    void Promise.all([QRCode.toDataURL(publicUrl, options), QRCode.toDataURL(registrationUrl, options)])
      .then(([event, registration]) => {
        if (current) setQrUrls({ event, registration });
      })
      .catch(() => {
        if (current) setQrError(true);
      });
    return () => {
      current = false;
    };
  }, [publicUrl, registrationUrl]);

  const copy = async (url: string, label: string) => {
    try {
      await copyText(url);
      setMessage(`${label} copied.`);
    } catch {
      setMessage('Could not copy the link. Select the address and copy it manually.');
    }
  };

  const targets = [
    {
      key: 'event' as const,
      label: 'Event page',
      url: publicUrl,
      qrUrl: qrUrls.event,
      file: `${slug}-event-qr.png`,
      alt: `QR code for ${title} event page`,
    },
    {
      key: 'registration' as const,
      label: 'Registration form',
      url: registrationUrl,
      qrUrl: qrUrls.registration,
      file: `${slug}-registration-qr.png`,
      alt: `QR code for ${title} registration form`,
    },
  ];

  return (
    <Card as="section" className="no-print">
      <h2 className="text-lg font-semibold">Share this event</h2>
      <p className="mt-1 text-sm text-ink-muted">
        Use the event page when people need the details, or send the registration form when they are ready to
        respond.
      </p>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        {targets.map((target) => (
          <article key={target.key} className="flex min-w-0 flex-col rounded-[10px] border border-line p-4">
            <h3 className="font-semibold">{target.label}</h3>
            <p className="mt-2 break-words rounded-[8px] bg-canvas p-3 font-mono text-sm text-ink">
              {target.url}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => void copy(target.url, `${target.label} link`)}
              >
                <Copy className="size-4" aria-hidden /> Copy {target.label.toLowerCase()} link
              </Button>
              <a
                href={target.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-[10px] px-3 text-sm font-semibold no-underline hover:bg-brand-ice hover:no-underline"
              >
                <ExternalLink className="size-4" aria-hidden /> Open {target.label.toLowerCase()}
              </a>
            </div>
            <div className="mt-4 flex flex-col items-center gap-3">
              {target.qrUrl ? (
                <img
                  src={target.qrUrl}
                  alt={target.alt}
                  className="size-48 rounded-[8px] bg-white"
                  width={192}
                  height={192}
                />
              ) : qrError ? (
                <div
                  role="alert"
                  className="flex size-48 items-center justify-center rounded-[8px] bg-danger-bg p-4 text-center text-sm text-danger"
                >
                  Could not create this QR code. Use the link instead.
                </div>
              ) : (
                <div
                  role="status"
                  className="flex size-48 items-center justify-center rounded-[8px] bg-canvas text-sm text-ink-muted"
                >
                  Creating QR code…
                </div>
              )}
              {target.qrUrl && (
                <a
                  href={target.qrUrl}
                  download={target.file}
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-[10px] border border-line px-3 text-sm font-semibold no-underline hover:bg-brand-ice hover:no-underline"
                >
                  <Download className="size-4" aria-hidden /> Download {target.label.toLowerCase()} QR code
                </a>
              )}
            </div>
          </article>
        ))}
      </div>
      <p aria-live="polite" className="mt-3 min-h-5 text-sm text-ink-muted">
        {message}
      </p>
    </Card>
  );
}

function PublicQrCard({
  title,
  label,
  url,
  alt,
  icon,
}: {
  title: string;
  label: string;
  url: string;
  alt: string;
  icon: 'event' | 'map';
}) {
  const qr = useQrSvg(url);
  const [message, setMessage] = useState('');
  const file = icon === 'event' ? 'mb-wa-reunion-2026-event-qr.svg' : 'mb-wa-reunion-2026-directions-qr.svg';
  const copy = async () => {
    try {
      await copyText(url);
      setMessage(`${title} link copied.`);
    } catch {
      setMessage('Could not copy the link. Select the address below and copy it manually.');
    }
  };
  return (
    <article className="flex min-w-0 flex-col rounded-[10px] bg-white/90 p-4 shadow-sm">
      <div className="flex items-center gap-2 text-heritage-deep">
        {icon === 'map' ? (
          <MapPin className="size-5" aria-hidden />
        ) : (
          <Share2 className="size-5" aria-hidden />
        )}
        <h3 className="font-semibold">{label}</h3>
      </div>
      <div className="mt-3 flex justify-center">
        {qr.src ? (
          <img src={qr.src} alt={alt} className="size-48 bg-cream" width={192} height={192} />
        ) : qr.error ? (
          <div
            role="alert"
            className="flex size-48 items-center justify-center bg-danger-bg p-4 text-center text-sm text-danger"
          >
            QR unavailable. Use the link below.
          </div>
        ) : (
          <div
            role="status"
            className="flex size-48 items-center justify-center bg-cream text-sm text-ink-muted"
          >
            Creating QR code…
          </div>
        )}
      </div>
      <a href={url} target="_blank" rel="noopener noreferrer" className="mt-3 break-all text-sm">
        {url}
      </a>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={() => void copy()}>
          <Copy className="size-4" aria-hidden /> Copy link
        </Button>
        {qr.src && (
          <a
            href={qr.src}
            download={file}
            className="inline-flex min-h-10 items-center gap-2 rounded-[10px] px-3 text-sm font-semibold no-underline hover:bg-cream"
          >
            <Download className="size-4" aria-hidden /> Download QR
          </a>
        )}
      </div>
      <p aria-live="polite" className="mt-2 min-h-5 text-xs text-ink-muted">
        {message}
      </p>
    </article>
  );
}

export function PublicEventShare({ slug, title, mapsUrl }: { slug: string; title: string; mapsUrl: string }) {
  const publicUrl = useMemo(() => canonicalEventUrl(slug), [slug]);
  return (
    <section
      aria-labelledby="share-event-heading"
      className="rounded-[var(--radius-card)] bg-heritage-soft p-4 sm:p-6"
    >
      <h2 id="share-event-heading" className="text-xl font-semibold text-heritage-deep">
        Share the reunion
      </h2>
      <p className="mt-2 max-w-prose text-sm text-ink-muted">
        Scan on another device, download a QR code for print, or share the selectable link.
      </p>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <PublicQrCard
          title="Event"
          label="Scan to Register & View Event Details"
          url={publicUrl}
          alt={`QR code for ${title} event and registration details`}
          icon="event"
        />
        <PublicQrCard
          title="Directions"
          label="Scan for Directions"
          url={mapsUrl}
          alt="QR code for directions to Veterans Building in Puguis, La Trinidad, Benguet"
          icon="map"
        />
      </div>
    </section>
  );
}
