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
  const [qrUrl, setQrUrl] = useState('');
  const [qrError, setQrError] = useState(false);
  const [message, setMessage] = useState('');
  const publicUrl = eventUrl(slug);

  useEffect(() => {
    let current = true;
    void QRCode.toDataURL(publicUrl, {
      width: 1024,
      margin: 4,
      errorCorrectionLevel: 'H',
      color: { dark: '#205477', light: '#ffffff' },
    })
      .then((url) => {
        if (current) setQrUrl(url);
      })
      .catch(() => {
        if (current) setQrError(true);
      });
    return () => {
      current = false;
    };
  }, [publicUrl]);

  const copy = async () => {
    try {
      await copyText(publicUrl);
      setMessage('Public event link copied.');
    } catch {
      setMessage('Could not copy the link. Select the address and copy it manually.');
    }
  };

  return (
    <Card as="section" className="no-print">
      <div className="grid items-center gap-6 sm:grid-cols-[minmax(0,1fr)_12rem]">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">Share this event</h2>
          <p className="mt-1 text-sm text-ink-muted">Send the public page to family members or print its QR code on invitations and posters.</p>
          <p className="mt-4 break-words rounded-[8px] bg-canvas p-3 font-mono text-sm text-ink">{publicUrl}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => void copy()}>
              <Copy className="size-4" aria-hidden /> Copy event link
            </Button>
            <a
              href={publicUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-[10px] px-3 text-sm font-semibold no-underline hover:bg-brand-ice hover:no-underline"
            >
              <ExternalLink className="size-4" aria-hidden /> Open public page
            </a>
          </div>
          <p aria-live="polite" className="mt-2 min-h-5 text-sm text-ink-muted">{message}</p>
        </div>

        <div className="flex flex-col items-center gap-3">
          {qrUrl ? (
            <img src={qrUrl} alt={`QR code for ${title}`} className="size-48 rounded-[8px] bg-white" width={192} height={192} />
          ) : qrError ? (
            <div role="alert" className="flex size-48 items-center justify-center rounded-[8px] bg-danger-bg p-4 text-center text-sm text-danger">Could not create the QR code. Use the event link instead.</div>
          ) : (
            <div role="status" className="flex size-48 items-center justify-center rounded-[8px] bg-canvas text-sm text-ink-muted">Creating QR code…</div>
          )}
          {qrUrl && (
            <a
              href={qrUrl}
              download={`${slug}-qr.png`}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-[10px] border border-line px-3 text-sm font-semibold no-underline hover:bg-brand-ice hover:no-underline"
            >
              <Download className="size-4" aria-hidden /> Download QR code
            </a>
          )}
        </div>
      </div>
    </Card>
  );
}
