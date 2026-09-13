// apps/lab — auth via CORE (UI-02; sessão web + PAT nativo).
//
// Endpoints reais do contrato §11.1 (apps/core-api/src/routes/auth.ts):
// POST /api/v1/auth/login (200 { user }, cookie httpOnly) ·
// POST /api/v1/auth/register (201 { user }, convite) ·
// GET /api/v1/auth/me (200 { user }, 401 sem sessão) ·
// POST /api/v1/auth/logout (204, encerra aparelho atual) ·
// POST /api/v1/auth/token (201 { token, ...info }, raw UMA vez, sem logar).
// Tipos de entrada/saída SOMENTE via `import type` de @uhhu/contracts;
// bodies montados via parse dos schemas (nunca objeto à mão sem parse).

import { loginSchema, patCreateSchema, registerSchema } from '@uhhu/contracts';
import type {
  LoginInput,
  PatCreateInput,
  PersonalAccessTokenCreated,
  PublicUser,
  RegisterInput,
} from '@uhhu/contracts';
import { ApiError, apiFetch } from './client';
import type { TokenProvider } from './client';

export interface AuthRequestOptions {
  getToken?: TokenProvider;
  baseUrl?: string;
}

function toRequestOptions(opts?: AuthRequestOptions): {
  getToken?: TokenProvider;
  baseUrl?: string;
} {
  const out: { getToken?: TokenProvider; baseUrl?: string } = {};
  if (opts?.getToken !== undefined) {
    out.getToken = opts.getToken;
  }
  if (typeof opts?.baseUrl === 'string' && opts.baseUrl.length > 0) {
    out.baseUrl = opts.baseUrl;
  }
  return out;
}

export const authApi = {
  async login(input: LoginInput, opts?: AuthRequestOptions): Promise<PublicUser> {
    const body = loginSchema.parse(input);
    const data = await apiFetch<{ user: PublicUser }>('/api/v1/auth/login', {
      ...toRequestOptions(opts),
      method: 'POST',
      body,
    });
    return data.user;
  },

  async register(input: RegisterInput, opts?: AuthRequestOptions): Promise<PublicUser> {
    const body = registerSchema.parse(input);
    const data = await apiFetch<{ user: PublicUser }>('/api/v1/auth/register', {
      ...toRequestOptions(opts),
      method: 'POST',
      body,
    });
    return data.user;
  },

  // 401 → null sem lançar (sessão expirada/ausente; chamador redireciona ao
  // login com aviso em 06-03, sem perder o projeto atual).
  async me(opts?: AuthRequestOptions): Promise<PublicUser | null> {
    try {
      const data = await apiFetch<{ user: PublicUser }>('/api/v1/auth/me', {
        ...toRequestOptions(opts),
        method: 'GET',
      });
      return data.user;
    } catch (error: unknown) {
      if (error instanceof ApiError && error.status === 401) {
        return null;
      }
      throw error;
    }
  },

  async logout(opts?: AuthRequestOptions): Promise<void> {
    await apiFetch<void>('/api/v1/auth/logout', {
      ...toRequestOptions(opts),
      method: 'POST',
    });
  },

  // O raw circula UMA vez nesta resposta; repassado sem logar (T-06-02-04).
  async issuePat(
    input: PatCreateInput,
    opts?: AuthRequestOptions,
  ): Promise<PersonalAccessTokenCreated> {
    const body = patCreateSchema.parse(input);
    const data = await apiFetch<PersonalAccessTokenCreated>('/api/v1/auth/token', {
      ...toRequestOptions(opts),
      method: 'POST',
      body,
    });
    return data;
  },
};
