// apps/lab — sessão nos dois canais (06-03: web cookie + nativo PAT por device).
//
// AuthProvider com estado `{ user, loading, expired }` sobre o client tipado:
// - `authApi.me()` no mount com getToken da plataforma (web: cookie via
//   credentials:include; nativo: Bearer via SecureStore; 401 vira null).
// - `login(email,password)` web valida com loginSchema e chama authApi.login;
//   no nativo o app/login.tsx chama pat.nativeLogin (POST /api/v1/auth/token)
//   e depois refresh() — mesmo contexto, sem telas separadas por plataforma.
// - `logout()` web chama authApi.logout; no nativo chama pat.nativeLogout que
//   revoga o PAT no servidor E apaga o SecureStore mesmo sem rede. Redirect
//   para /login via gate em app/_layout.tsx (guards são UX; authZ no CORE).
// - `expired` indica sessão expirada prévia (401 com user anterior → aviso no
//   login com `next` preservando o projeto; UI-08).
// - NUNCA persiste user/privilégio em storage do navegador (só memória React;
//   o cookie httpOnly fica no navegador gerenciado pelo servidor). Zero
//   armazenamento web/móvel para role/owner (T-06-03-04); guards são UX.
// - Web usa SOMENTE cookie (getToken null); nativo injeta PAT via SecureStore
//   em src/auth/secureToken.ts. Telas repassam getToken a projectsApi/labApi.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { JSX, ReactNode } from 'react';
import { Platform } from 'react-native';
import { loginSchema } from '@uhhu/contracts';
import type { PublicUser } from '@uhhu/contracts';
import { authApi } from '../api/auth';
import type { TokenProvider } from '../api/client';
import { nativeLogout } from './pat';
import { clearToken, getToken as getStoredPat } from './secureToken';

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

// Web: SOMENTE cookie httpOnly — nenhum Bearer injetado. Nativo: PAT do
// SecureStore via getter assíncrono injetado no apiFetch.
const webGetToken: TokenProvider = async () => null;

function getPlatformToken(): TokenProvider {
  if (Platform.OS === 'web') {
    return webGetToken;
  }
  return getStoredPat;
}

export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [expired, setExpired] = useState<boolean>(false);

  const refresh = useCallback(async (): Promise<PublicUser | null> => {
    setLoading(true);
    try {
      // authApi.me mapeia 401 → null sem lançar (sessão ausente/expirada).
      // Web: cookie; nativo: Bearer do SecureStore via getToken.
      const me: PublicUser | null = await authApi.me({ getToken: getPlatformToken() });
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
    // Web (cookie). Nativo usa pat.nativeLogin direto no login.tsx + refresh().
    // Validação client-side com as MESMAS regras do servidor (contracts).
    const parsed = loginSchema.parse({ email, password });
    const authed: PublicUser = await authApi.login(parsed);
    setUser(authed);
    setExpired(false);
    return authed;
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    try {
      if (Platform.OS === 'web') {
        await authApi.logout();
      } else {
        // Revoga o PAT atual no servidor E apaga o SecureStore local.
        await nativeLogout();
      }
    } finally {
      setUser(null);
      setExpired(false);
    }
  }, []);

  const markExpired = useCallback((): void => {
    // 401 global com user prévio → expired + clear user/token, redirect com
    // aviso via _layout (UI-08). No nativo o token inválido é descartado.
    if (Platform.OS !== 'web') {
      void clearToken().catch(() => undefined);
    }
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

  const platformGetToken = useMemo<TokenProvider>(() => getPlatformToken(), []);

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
      getToken: platformGetToken,
    }),
    [user, loading, expired, login, logout, refresh, markExpired, clearExpired, platformGetToken],
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
