// packages/contracts — schemas e DTOs de auth/platform (D-15..D-21, D-26).
//
// Unica definicao de tipos de auth: nenhum outro pacote duplica estes tipos.
// PublicUser NUNCA expoe passwordHash. Emails sempre normalizados (lowercase).

import { z } from 'zod';

const emailSchema = z.string().trim().toLowerCase().email().max(254);

export const registerSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: emailSchema,
  password: z.string().min(12).max(128),
  inviteToken: z.string().min(32).max(256),
});

export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
  rememberMe: z.boolean().optional().default(true),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const resetRequestSchema = z.object({
  email: emailSchema,
});

export type ResetRequestInput = z.infer<typeof resetRequestSchema>;

export const resetConfirmSchema = z.object({
  token: z.string().min(32).max(256),
  newPassword: z.string().min(12).max(128),
});

export type ResetConfirmInput = z.infer<typeof resetConfirmSchema>;

export type UserRole = 'admin' | 'member';

// DTO publico do usuario. NUNCA inclui passwordHash/token.
export interface PublicUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  createdAt: string;
}

// Informacao de sessao para listagem de dispositivos (D-20).
export interface SessionInfo {
  id: string;
  createdAt: string;
  lastSeenAt: string;
  userAgent: string | null;
  ip: string | null;
  current: boolean;
}
