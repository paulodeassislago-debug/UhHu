// tests/smoke — boot sem banco: /health degradado, nunca 500 (D-09/D-14).
//
// Sem PostgreSQL aqui: conecta contra porta fechada (ECONNREFUSED imediato)
// e prova o caminho degradado real — checkDatabase nunca lanca, o handler
// nunca responde 500 e o corpo tem EXATAMENTE as 4 chaves do contrato.

import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { createDb } from '@uhhu/db';
import { healthRoute } from '../../apps/core-api/src/health.js';
import type { HealthResponse } from '../../apps/core-api/src/health.js';

// Porta fechada: recusa imediata, sem timeout de rede.
const OFFLINE_URL = 'postgresql://uhhu_app:offline@127.0.0.1:59999/uhhu_test';

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

function expectNoSecrets(body: unknown): void {
  const text = JSON.stringify(body).toLowerCase();
  expect(text).not.toMatch(/password|database_url|secret|token/);
}

describe('boot sem banco', () => {
  it(
    'GET /health responde degraded com as 4 chaves, nunca 500, sem segredos',
    { timeout: 5000 },
    async () => {
      const app = Fastify();
      await app.register(healthRoute, { db: createDb(OFFLINE_URL) });

      const res = await app.inject({ method: 'GET', url: '/health' });
      await app.close();

      expect(res.statusCode).toBe(200);
      const body: unknown = res.json();
      expect(isHealthResponse(body)).toBe(true);
      if (!isHealthResponse(body)) {
        throw new Error('corpo do /health fora do contrato de 4 campos');
      }
      expect(Object.keys(body).sort()).toEqual(['db', 'migrationsApplied', 'status', 'version']);
      expect(body.status).toBe('degraded');
      expect(body.db).toBe('degraded');
      expect(body.migrationsApplied).toBe(0);
      expect(body.version.length).toBeGreaterThan(0);
      expectNoSecrets(body);
      expect(res.headers['x-request-id']).toBeDefined();
    },
  );

  it(
    'x-request-id valido e ecoado; invalido e substituido sem 500',
    { timeout: 5000 },
    async () => {
      const app = Fastify();
      await app.register(healthRoute, { db: createDb(OFFLINE_URL) });

      const valid = await app.inject({
        method: 'GET',
        url: '/health',
        headers: { 'x-request-id': 'smoke-probe-1' },
      });
      expect(valid.statusCode).toBe(200);
      expect(valid.headers['x-request-id']).toBe('smoke-probe-1');

      const invalid = await app.inject({
        method: 'GET',
        url: '/health',
        headers: { 'x-request-id': 'id com espacos e\nquebra' },
      });
      await app.close();
      expect(invalid.statusCode).toBe(200);
      expect(invalid.headers['x-request-id']).not.toBe('id com espacos e\nquebra');
    },
  );
});
