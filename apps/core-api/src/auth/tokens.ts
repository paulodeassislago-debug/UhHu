// apps/core-api — tokens opacos + expiracoes (D-15, D-18, D-19).
//
// Todos os segredos (convite, reset, sessao) sao opacos de 256 bits via
// gerador criptografico do Node (`randomBytes`) — nunca o PRNG inseguro
// da linguagem para tokens. No banco vai so o SHA-256 hex
// (`token_hash` UNIQUE); o raw circula UMA vez (resposta/cookie/e-mail).

import { createHash, randomBytes } from 'node:crypto';

const DAY_MS = 24 * 60 * 60 * 1000;

export function newOpaqueToken(): string {
  return randomBytes(32).toString('hex');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// Convite beta: 30 dias (D-16, escolha do usuario contra 7 recomendados).
export function inviteExpiry(from: Date = new Date()): Date {
  return new Date(from.getTime() + 30 * DAY_MS);
}

// Reset por e-mail: janela curta de 1h + uso unico (D-18).
export function resetExpiry(from: Date = new Date()): Date {
  return new Date(from.getTime() + 60 * 60 * 1000);
}

// Sessao: "manter conectado" marcado = 30d, desmarcado = 24h (D-19).
export function sessionExpiry(rememberMe: boolean, from: Date = new Date()): Date {
  return new Date(from.getTime() + (rememberMe ? 30 * DAY_MS : DAY_MS));
}

// patExpiry(): PAT 30d sliding (D-61: espelha sessão rememberMe=true, sem PAT eterno no v1).
export function patExpiry(from: Date = new Date()): Date {
  return new Date(from.getTime() + 30 * DAY_MS);
}
