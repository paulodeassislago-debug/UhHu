// packages/contracts — registry de capabilities v1 (contrato §10, D-60/D-61).
//
// Definicao UNICA dos nomes de capability: nenhum outro pacote (core, api,
// cli, mcp) duplica esta lista. O formato e o ciclo do PAT tambem nascem em
// contracts (auth.ts); aqui vivem so os nomes versionados + CAPABILITY_VERSION.
// O executor em packages/core valida contra esta lista fechada (fail-closed).

import { z } from 'zod';

export const CAPABILITY_VERSION = 'v1' as const;

export const capabilityNameSchema = z.enum([
  'platform.session.get',
  'platform.project.create',
  'platform.project.list',
  'platform.project.get',
  'platform.project.update',
  'lab.search.create',
  'lab.search.list',
  'lab.search.update',
  'lab.search.delete',
  'lab.search.execute',
  'lab.search.compare',
  'lab.run.get',
  'lab.run.list',
  'lab.run.results.list',
  'lab.result.decision.update',
  'lab.result.duplicate.diverge',
  'lab.corpus.get',
  'lab.project.export',
  'lab.source.list',
  'lab.source.health',
]);

export type CapabilityName = z.infer<typeof capabilityNameSchema>;
