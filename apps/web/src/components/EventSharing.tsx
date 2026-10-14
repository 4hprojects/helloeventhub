import { useEffect, useState } from 'react';
import { Copy, Download, ExternalLink, Share2 } from 'lucide-react';
import QRCode from 'qrcode';
import { Button, Card } from './ui';

function eventUrl(slug: string) {
  return new URL(`/events/${slug}`, window.location.origin).toString();
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
      <span aria-live="polite" className="mt-1 text-xs text-ink-muted">{message}</span>
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
      <p className="mt-1 text-sm text-ink-muted">Use the event page when people need the details, or send the registration form when they are ready to respond.</p>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        {targets.map((target) => (
          <article key={target.key} className="flex min-w-0 flex-col rounded-[10px] border border-line p-4">
            <h3 className="font-semibold">{target.label}</h3>
            <p className="mt-2 break-words rounded-[8px] bg-canvas p-3 font-mono text-sm text-ink">{target.url}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={() => void copy(target.url, `${target.label} link`)}>
                <Copy className="size-4" aria-hidden /> Copy {target.label.toLowerCase()} link
              </Button>
              <a href={target.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-[10px] px-3 text-sm font-semibold no-underline hover:bg-brand-ice hover:no-underline">
                <ExternalLink className="size-4" aria-hidden /> Open {target.label.toLowerCase()}
              </a>
            </div>
            <div className="mt-4 flex flex-col items-center gap-3">
              {target.qrUrl ? (
                <img src={target.qrUrl} alt={target.alt} className="size-48 rounded-[8px] bg-white" width={192} height={192} />
              ) : qrError ? (
                <div role="alert" className="flex size-48 items-center justify-center rounded-[8px] bg-danger-bg p-4 text-center text-sm text-danger">Could not create this QR code. Use the link instead.</div>
              ) : (
                <div role="status" className="flex size-48 items-center justify-center rounded-[8px] bg-canvas text-sm text-ink-muted">Creating QR code…</div>
              )}
              {target.qrUrl && (
                <a href={target.qrUrl} download={target.file} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-[10px] border border-line px-3 text-sm font-semibold no-underline hover:bg-brand-ice hover:no-underline">
                  <Download className="size-4" aria-hidden /> Download {target.label.toLowerCase()} QR code
                </a>
              )}
            </div>
          </article>
        ))}
      </div>
      <p aria-live="polite" className="mt-3 min-h-5 text-sm text-ink-muted">{message}</p>
    </Card>
  );
}
