import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { SessionDto, SessionUser } from '@heh/contracts';
import { api, setCsrfToken } from './api';

interface SessionCtx {
  user: SessionUser | null;
  loading: boolean;
  refresh: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<SessionCtx | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const s = await api<SessionDto>('/auth/session');
      setCsrfToken(s.csrfToken);
      setUser(s.user);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(async (email: string, password: string) => {
    const s = await api<SessionDto>('/auth/login', { method: 'POST', body: { email, password } });
    setCsrfToken(s.csrfToken);
    setUser(s.user);
  }, []);

  const logout = useCallback(async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
    setUser(null);
    await refresh();
  }, [refresh]);

  return <Ctx.Provider value={{ user, loading, refresh, login, logout }}>{children}</Ctx.Provider>;
}

export function useSession() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useSession outside SessionProvider');
  return c;
}
