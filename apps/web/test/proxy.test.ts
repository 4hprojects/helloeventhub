import { describe, expect, it } from 'vitest';
import { resolveApiProxyTarget } from '../vite.proxy';

describe('development API proxy target', () => {
  it('prefers an explicit API proxy target', () => {
    expect(resolveApiProxyTarget({ API_PROXY_TARGET: 'http://127.0.0.1:4321', PORT: '3009' })).toBe(
      'http://127.0.0.1:4321',
    );
  });

  it('uses the API port from the root environment', () => {
    expect(resolveApiProxyTarget({ PORT: '3009' })).toBe('http://localhost:3009');
  });

  it('falls back to the default API port', () => {
    expect(resolveApiProxyTarget({})).toBe('http://localhost:3000');
  });
});
