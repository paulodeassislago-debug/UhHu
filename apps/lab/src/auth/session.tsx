// apps/lab — sessão web por cookie httpOnly (UI-05/UI-06, parte web de 06-03).
//
// AuthProvider com estado `{ user, loading, expired }` sobre o client tipado:
// - `authApi.me()` no mount (credentials:include no web; 401 vira null sem lançar).
// - `login(email,password)` valida com loginSchema do contracts antes do fetch,
//   chama authApi.login e em sucesso set user + limpa expired.
// - `logout()` chama authApi.logout + limpa user; o redirect para /login acontece
//   via gate de rota em app/_layout.tsx (guards são UX; autorização real no CORE).
// - `expired` indica sessão expirada prévia (401 com user anterior → aviso no
//   login sem perder o projeto via param `next`; detalhe UI-08 em pat.ts/_layout).
// - NUNCA persiste user/privilégio em storage do navegador (só memória React;
//   o cookie httpOnly fica no navegador gerenciado pelo servidor). Zero
//   armazenamento web/móvel para role/owner (T-06-03-04); guards são UX.
// - Web usa SOMENTE cookie: getToken retorna null (sem Bearer). O nativo injeta
//   PAT via SecureStore em src/auth/secureToken.ts (task 2); este provider expõe
//   getToken para as telas repassarem a projectsApi/labApi sem fetch direto.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { JSX, ReactNode } from 'react';
import { loginSchema } from '@uhhu/contracts';
import type { PublicUser } from '@uhhu/contracts';
import { authApi } from '../api/auth.js';
import type { TokenProvider } from '../api/client.js';

// next restrito a rotas internas `/...` (T-06-03-05): rejeita `http`, `//`, `\`.
// Fallback do chamador: /projects.
export function isSafeNext(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }
  if (value.length === 0 || !value.startsWith('/')) {
    return false;
  }
  if (value.startsWith('//')) {
    return false;
  }
  if (value.includes('://')) {
    return false;
  }
  if (value.includes('\\')) {
    return false;
  }
  return true;
}

export interface AuthContextValue {
  user: PublicUser | null;
  loading: boolean;
  expired: boolean;
  login: (email: string, password: string) => Promise<PublicUser>;
  logout: () => Promise<void>;
  refresh: () => Promise<PublicUser | null>;
  markExpired: () => void;
  clearExpired: () => void;
  getToken: TokenProvider;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// Web: SOMENTE cookie httpOnly — nenhum Bearer injetado.
const webGetToken: TokenProvider = async () => null;

export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [expired, setExpired] = useState<boolean>(false);

  const refresh = useCallback(async (): Promise<PublicUser | null> => {
    setLoading(true);
    try {
      // authApi.me mapeia 401 → null sem lançar (sessão ausente/expirada).
      const me: PublicUser | null = await authApi.me();
      setUser(me);
      if (me !== null) {
        setExpired(false);
      }
      return me;
    } finally {
      setLoading(false);
    }
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<PublicUser> => {
    // Validação client-side com as MESMAS regras do servidor (contracts).
    const parsed = loginSchema.parse({ email, password });
    const authed: PublicUser = await authApi.login(parsed);
    setUser(authed);
    setExpired(false);
    return authed;
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    try {
      await authApi.logout();
    } finally {
      setUser(null);
      setExpired(false);
    }
  }, []);

  const markExpired = useCallback((): void => {
    setUser(null);
    setExpired(true);
  }, []);

  const clearExpired = useCallback((): void => {
    setExpired(false);
  }, []);

  useEffect(() => {
    void refresh().catch(() => {
      setUser(null);
    });
  }, [refresh]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      expired,
      login,
      logout,
      refresh,
      markExpired,
      clearExpired,
      getToken: webGetToken,
    }),
    [user, loading, expired, login, logout, refresh, markExpired, clearExpired],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx: AuthContextValue | null = useContext(AuthContext);
  if (ctx === null) {
    throw new Error('useAuth deve ser usado dentro de <AuthProvider>.');
  }
  return ctx;
}
