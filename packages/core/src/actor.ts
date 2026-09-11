// packages/core — ActorContext derivado da sessao (D-23, T-02-01-04).
//
// O servidor deriva o ator da sessao; nunca de body/query. Colaboracao e pos-v1
// (D-23: isolamento so por ownerId).

import type { ErrorCode, UserRole } from '@uhhu/contracts';

export interface ActorContext {
  userId: string;
  role: UserRole;
  requestId: string;
  // D-60–D-63: PAT espelha sessão; requireAuth deriva, nunca body.
  authMethod: 'session' | 'pat';
}

export class UnauthenticatedError extends Error {
  readonly code: ErrorCode = 'UNAUTHENTICATED';
  readonly statusCode = 401;

  constructor(message = 'Autenticação necessária.') {
    super(message);
    this.name = 'UnauthenticatedError';
  }
}

export function requireUser(actor: ActorContext | null | undefined): ActorContext {
  if (actor === null || actor === undefined) {
    throw new UnauthenticatedError();
  }
  return actor;
}

export function isAdmin(actor: ActorContext): boolean {
  return actor.role === 'admin';
}
