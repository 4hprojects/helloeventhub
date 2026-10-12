export type BotCheckResult = 'passed' | 'failed' | 'unavailable' | 'disabled';

export interface TurnstileVerifier {
  verify(token: string | undefined, remoteIp: string | undefined): Promise<BotCheckResult>;
}

export function createTurnstileVerifier(opts: { secret: string; disabled: boolean; timeoutMs?: number }): TurnstileVerifier {
  return {
    async verify(token, remoteIp) {
      if (opts.disabled) return 'disabled';
      if (!token) return 'failed';
      try {
        const body = new URLSearchParams({ secret: opts.secret, response: token });
        if (remoteIp) body.set('remoteip', remoteIp);
        const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
          method: 'POST',
          body,
          signal: AbortSignal.timeout(opts.timeoutMs ?? 5000),
        });
        if (!res.ok) return 'unavailable';
        const json = (await res.json()) as { success?: boolean };
        return json.success ? 'passed' : 'failed';
      } catch {
        return 'unavailable';
      }
    },
  };
}
