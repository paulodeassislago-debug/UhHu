// packages/contracts — paginacao cursor limit+cursor (D-27).
//
// Convencao: `limit` default 20, maximo 100; cursor opaco base64url de
// `${createdAt}|${id}` com ordenacao estavel (created_at DESC, id DESC).
// Resposta informa { limit, nextCursor, hasMore }.

import { z } from 'zod';

export const paginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().max(512).optional(),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export interface PageInfo {
  limit: number;
  nextCursor: string | null;
  hasMore: boolean;
}

// Codifica o cursor como base64url de `${createdAt}|${id}`.
export function encodeCursor(createdAt: string, id: string): string {
  return Buffer.from(`${createdAt}|${id}`, 'utf8').toString('base64url');
}

const CURSOR_SPLIT_INDEX = 0;

// Decodifica o cursor. Retorna null em cursor malformado — nunca lanca.
export function decodeCursor(cursor: string): { createdAt: string; id: string } | null {
  try {
    if (cursor.length === 0 || cursor.length > 512) {
      return null;
    }
    const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
    const sep = decoded.indexOf('|');
    if (sep <= CURSOR_SPLIT_INDEX) {
      return null;
    }
    const createdAt = decoded.slice(0, sep);
    const id = decoded.slice(sep + 1);
    if (createdAt.length === 0 || id.length === 0) {
      return null;
    }
    return { createdAt, id };
  } catch {
    return null;
  }
}
