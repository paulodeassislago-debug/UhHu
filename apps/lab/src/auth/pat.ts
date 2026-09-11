// apps/lab — fluxo PAT nativo por device (UI-07, 06-03 task 2, D-01/D-02).
//
// Primeiro PAT via login email+senha in-app → POST /api/v1/auth/token → guarda
// em secure storage. Sem fluxo via web/QR (D-01); deviceName automático (D-02).
// - `nativeLogin(email,password)`: valida com patCreateSchema + deviceName
//   automático, emite o PAT, guarda o raw em SecureStore UMA vez e resolve o
//   user via GET /me com Bearer (o POST /token devolve só { token, ...info }).
// - `nativeLogout()`: POST /api/v1/auth/logout com Bearer (servidor revoga o
//   PAT atual via request.patId) E apaga o SecureStore local mesmo se a rede
//   falhar (logout local garantido).
// - GET /api/v1/auth/tokens e DELETE /tokens/:id NÃO são expostos na UI da
//   fase 6 (revogação pela web é fase futura per D-02 — sem tela).
// Erros 401/429 repassados verbatim (genérico sem distinguir email/senha;
// lockout "tente em 15 min"); client nunca faz retry automático (T-06-03-01).

import { patCreateSchema } from '@uhhu/contracts';
import type { PublicUser } from '@uhhu/contracts';
import { authApi } from '../api/auth';
import { getDeviceName } from './deviceName';
import { clearToken, getToken, setToken } from './secureToken';

export async function nativeLogin(email: string, password: string): Promise<PublicUser> {
  const deviceName = getDeviceName();
  const parsed = patCreateSchema.parse({ email, password, deviceName });
  // Emissão: POST /api/v1/auth/token → 201 { token: rawUMAvez, ...info }.
  const created = await authApi.issuePat(parsed);
  const raw: string = created.token;
  await setToken(raw);
  // Raw sai de escopo aqui (sem log/bundle); sessão resolve via Bearer.
  const me: PublicUser | null = await authApi.me({ getToken });
  if (me === null) {
    await clearToken();
    throw new Error('Autenticação necessária.');
  }
  return me;
}

export async function nativeLogout(): Promise<void> {
  try {
    await authApi.logout({ getToken });
  } finally {
    await clearToken();
  }
}
