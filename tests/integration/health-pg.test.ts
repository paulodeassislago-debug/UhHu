// tests/integration — /health contra PG real (D-14).
//
// Aplica `db:migrate` via CLI do pacote @uhhu/db (cwd do pacote, como no CI),
// sobe o Fastify real em porta efemera e prova `db: ok` + migrations >= 1.
// SEM PG (env ausente ou inalcançavel): pula com graca, nunca falha — o CI com
// service postgres:16-alpine e a maquina tailnet e que exercem este arquivo.
// NUNCA imprime connection string: so a causa curta, ja redigida pelo migrate.

import { execFileSync } from 'node:child_process';
import Fastify from 'fastify';
import { beforeAll, describe, expect, it } from 'vitest';
import { createDb } from '@uhhu/db';
import { healthRoute } from '../../apps/core-api/src/health.js';
import type { HealthResponse } from '../../apps/core-api/src/health.js';

function readDatabaseUrl(name: 'APP_DATABASE_URL' | 'MIGRATION_DATABASE_URL'): string | undefined {
  const value = process.env[name];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

const APP_URL = readDatabaseUrl('APP_DATABASE_URL');
const MIGRATION_URL = readDatabaseUrl('MIGRATION_DATABASE_URL');

function errorText(err: unknown): string {
  const parts: string[] = [];
  parts.push(err instanceof Error ? err.message : String(err));
  if (typeof err === 'object' && err !== null) {
    const record = err as { stdout?: unknown; stderr?: unknown };
    for (const key of ['stdout', 'stderr'] as const) {
      const value: unknown = record[key];
      if (typeof value === 'string') {
        parts.push(value);
      } else if (Buffer.isBuffer(value)) {
        parts.push(value.toString('utf8'));
      }
    }
  }
  return parts.join('\n');
}

function isConnectionFailure(text: string): boolean {
  // Sinais definitivos de PG inalcançavel (porta fechada/host inexistente/rede
  // isolada). Deliberadamente SEM o termo generico "connect": queda de conexao
  // no meio do teste contra PG real e falha verdadeira (fail-closed), nao skip.
  return /ECONNREFUSED|ENOTFOUND|ETIMEDOUT|EHOSTUNREACH|ENETUNREACH|EPIPE/i.test(text);
}

function isHealthResponse(value: unknown): value is HealthResponse {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  const status = record['status'];
  const db = record['db'];
  return (
    (status === 'ok' || status === 'degraded') &&
    (db === 'ok' || db === 'degraded') &&
    typeof record['version'] === 'string' &&
    typeof record['migrationsApplied'] === 'number'
  );
}

describe.skipIf(APP_URL === undefined || MIGRATION_URL === undefined)(
  'GET /health contra PG real',
  () => {
    let pgAvailable = true;

    beforeAll(() => {
      try {
        execFileSync('pnpm', ['--filter', '@uhhu/db', 'db:migrate'], {
          stdio: 'pipe',
          timeout: 60000,
        });
      } catch (err: unknown) {
        if (isConnectionFailure(errorText(err))) {
          pgAvailable = false;
          console.warn('[health-pg] PG inalcançavel no migrate — pulando integracao (offline).');
          return;
        }
        throw err;
      }
    });

    it(
      'migrate aplicado + GET /health => db ok, migrationsApplied >= 1, sem segredos',
      { timeout: 15000 },
      async () => {
        if (!pgAvailable || APP_URL === undefined) {
          console.warn('[health-pg] PG inalcançavel — teste pulado (offline).');
          return;
        }
        const app = Fastify();
        await app.register(healthRoute, { db: createDb(APP_URL) });
        await app.listen({ port: 0, host: '127.0.0.1' });
        try {
          const address = app.server.address();
          if (address === null || typeof address === 'string') {
            throw new Error('endereco inesperado do servidor de teste');
          }
          const res = await fetch(`http://127.0.0.1:${String(address.port)}/health`, {
            signal: AbortSignal.timeout(4000),
          });
          expect(res.status).toBe(200);
          const body: unknown = await res.json();
          expect(isHealthResponse(body)).toBe(true);
          if (!isHealthResponse(body)) {
            throw new Error('corpo do /health fora do contrato de 4 campos');
          }
          expect(Object.keys(body).sort()).toEqual([
            'db',
            'migrationsApplied',
            'status',
            'version',
          ]);
          expect(body.status).toBe('ok');
          expect(body.db).toBe('ok');
          expect(body.migrationsApplied).toBeGreaterThanOrEqual(1);
          const text = JSON.stringify(body).toLowerCase();
          expect(text).not.toMatch(/password|database_url|secret|token/);
        } finally {
          await app.close();
        }
      },
    );
  },
);
