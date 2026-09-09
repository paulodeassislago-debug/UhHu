// Vitest workspace — D-14: suite minima smoke + integracao PG.
//
// Dois projetos: `smoke` (sem banco, sempre verde) e `integration` (exige
// APP/MIGRATION_DATABASE_URL; pula com graca quando o PG esta inalcançavel).
// `pnpm test` roda tudo; `pnpm test:integration` roda so a integracao (CI com
// service postgres:16-alpine).
//
// `@uhhu/config` valida o env no import (fail-closed, D-05); sem nenhuma URL
// o proprio `import { createDb }` lancaria e o smoke nao rodaria offline.
// Por isso cada projeto preenche URLs *dummy* (porta fechada, sem segredo)
// SOMENTE quando o ambiente nao definiu as reais — nunca sobrescreve valor
// real do CI/tailnet. Com dummy, o smoke prova `degraded` e a integracao
// exercita o caminho de skip gracioso (ECONNREFUSED).

import { defineWorkspace } from 'vitest/config';

// Dummy nao-routavel: porta fechada em loopback, credencial ficticia.
const DUMMY_DATABASE_URL = 'postgresql://offline:offline@127.0.0.1:59999/offline';

function fallbackEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  // Vitest fixa NODE_ENV=test; o schema so aceita development|production.
  if (process.env['NODE_ENV'] !== 'development' && process.env['NODE_ENV'] !== 'production') {
    env['NODE_ENV'] = 'development';
  }
  if (process.env['APP_DATABASE_URL'] === undefined || process.env['APP_DATABASE_URL'] === '') {
    env['APP_DATABASE_URL'] = DUMMY_DATABASE_URL;
  }
  if (
    process.env['MIGRATION_DATABASE_URL'] === undefined ||
    process.env['MIGRATION_DATABASE_URL'] === ''
  ) {
    env['MIGRATION_DATABASE_URL'] = DUMMY_DATABASE_URL;
  }
  return env;
}

const fallback = fallbackEnv();

export default defineWorkspace([
  {
    test: {
      name: 'smoke',
      include: ['tests/smoke/**/*.test.ts'],
      testTimeout: 5000,
      env: fallback,
    },
  },
  {
    test: {
      name: 'integration',
      include: ['tests/integration/**/*.test.ts'],
      testTimeout: 15000,
      env: fallback,
    },
  },
]);
