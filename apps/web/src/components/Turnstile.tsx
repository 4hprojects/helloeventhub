import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      reset: (id?: string) => void;
      remove: (id: string) => void;
    };
  }
}

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
let loader: Promise<void> | undefined;
function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  loader ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SCRIPT_SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      loader = undefined;
      reject(new Error('turnstile load failed'));
    };
    document.head.appendChild(s);
  });
  return loader;
}

export interface TurnstileHandle {
  reset: () => void;
}

/**
 * Cloudflare Turnstile widget. If the script can't load (network/adblock), we report
 * an empty token; the server applies its documented fail-open/fail-closed policy.
 */
export const Turnstile = forwardRef<TurnstileHandle, { siteKey: string; onToken: (t: string | null) => void; onLoadError?: () => void }>(function Turnstile(
  { siteKey, onToken, onLoadError },
  ref,
) {
  const el = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const cb = useRef({ onToken, onLoadError });
  cb.current = { onToken, onLoadError };

  useImperativeHandle(ref, () => ({
    reset: () => {
      if (widgetId.current && window.turnstile) window.turnstile.reset(widgetId.current);
      cb.current.onToken(null);
    },
  }));

  useEffect(() => {
    let cancelled = false;
    loadScript()
      .then(() => {
        if (cancelled || !el.current || !window.turnstile) return;
        widgetId.current = window.turnstile.render(el.current, {
          sitekey: siteKey,
          theme: 'light',
          size: 'flexible',
          callback: (t: string) => cb.current.onToken(t),
          'expired-callback': () => cb.current.onToken(null),
          'error-callback': () => cb.current.onToken(null),
        });
      })
      .catch(() => cb.current.onLoadError?.());
    return () => {
      cancelled = true;
      if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current);
      widgetId.current = null;
    };
  }, [siteKey]);

  return <div ref={el} className="min-h-[65px]" />;
});
