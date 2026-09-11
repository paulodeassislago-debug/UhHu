// packages/contracts — catalogo estavel de erros PT-BR (D-25).
//
// Fonte unica do envelope publico { error: { code, message, details, requestId } }.
// Rotas/plugins NUNCA montam mensagem inline: usam buildEnvelope(code, ...).
// Mensagens sao PT-BR, i18n-ready (codes estaveis para outros idiomas no futuro).

export type ErrorCode =
  | 'INVALID_CREDENTIALS'
  | 'ACCOUNT_LOCKED'
  | 'INVITE_INVALID'
  | 'INVITE_REVOKED'
  | 'SESSION_EXPIRED'
  | 'UNAUTHENTICATED'
  | 'NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'CONFIRMATION_REQUIRED'
  | 'RATE_LIMITED'
  | 'SOURCE_DISABLED'
  | 'SOURCE_UNAVAILABLE'
  | 'IDEMPOTENCY_CONFLICT'
  | 'PASSWORD_RESET_SENT'
  | 'INTERNAL_ERROR';

export const ERROR_CATALOG: Record<ErrorCode, string> = {
  INVALID_CREDENTIALS: 'E-mail ou senha inválidos.',
  ACCOUNT_LOCKED:
    'Conta temporariamente bloqueada. Tente novamente em 15 minutos ou redefina a senha.',
  INVITE_INVALID: 'Convite inválido ou expirado.',
  INVITE_REVOKED: 'Convite revogado.',
  SESSION_EXPIRED: 'Sessão expirada. Entre novamente.',
  UNAUTHENTICATED: 'Autenticação necessária.',
  NOT_FOUND: 'Recurso não encontrado.',
  VALIDATION_ERROR: 'Dados inválidos.',
  CONFIRMATION_REQUIRED: 'Confirme a exclusão passando ?confirm=true.',
  RATE_LIMITED: 'Muitas tentativas. Tente novamente em instantes.',
  SOURCE_DISABLED: 'Fonte desabilitada nesta instalação.',
  SOURCE_UNAVAILABLE: 'Fonte temporariamente indisponível. Resultados parciais foram preservados.',
  IDEMPOTENCY_CONFLICT: 'Chave de idempotência reutilizada com corpo diferente.',
  PASSWORD_RESET_SENT: 'Se o e-mail estiver cadastrado, enviamos o link.',
  INTERNAL_ERROR: 'Erro interno. Tente novamente.',
};

export interface ErrorEnvelope {
  error: {
    code: ErrorCode;
    message: string;
    details: unknown;
    requestId: string;
  };
}

// Monta o envelope a partir do catalogo. Nunca recebe mensagem inline:
// a mensagem vem sempre de ERROR_CATALOG[code].
export function buildEnvelope(
  code: ErrorCode,
  requestId: string,
  details?: unknown,
): ErrorEnvelope {
  const message: string = ERROR_CATALOG[code];
  return {
    error: {
      code,
      message,
      details: details === undefined ? {} : details,
      requestId,
    },
  };
}
