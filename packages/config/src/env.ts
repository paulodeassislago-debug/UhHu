// packages/config — validacao Zod do ambiente por NODE_ENV (D-05/D-07).
//
// Duas connection strings separadas, nunca intercambiaveis:
// - APP_DATABASE_URL: role de runtime (uhhu_app, DML apenas).
// - MIGRATION_DATABASE_URL: role de migrations (uhhu_migrate, DDL).
//
// DEPURAÇÃO: nunca logar os valores parseados (URLs contêm senha).

import { z } from 'zod';

const postgresUrlSchema = z
  .string()
  .min(1, 'connection string is required')
  .refine((value) => value.startsWith('postgresql://') || value.startsWith('postgres://'), {
    message: 'must be a postgresql:// connection string',
  });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production']).default('development'),
  APP_DATABASE_URL: postgresUrlSchema,
  MIGRATION_DATABASE_URL: postgresUrlSchema,
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  COOKIE_SECRET: z.string().min(32).optional(),
  SMTP_HOST: z.string().min(1).optional(),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).optional(),
  SMTP_USER: z.string().min(1).optional(),
  SMTP_PASS: z.string().min(1).optional(),
  SMTP_FROM: z.string().max(254).optional(),
});

export type AppEnv = z.infer<typeof envSchema>;

// Falha dura no boot quando o ambiente esta incompleto (fail-closed).
// ZodError nao inclui valores — seguro para logs de inicializacao.
export const env: AppEnv = envSchema.parse(process.env);
