// packages/integrations — registry de fontes (fronteira integrations).
//
// Conhece bdtd+capes habilitadas e oasisbr desabilitada (dev-docs/04 §4;
// oasisbr segue enabled:false — porta aberta pos-v1). Entrega o SourceClient
// da fonte ao executor/adapters; pedir fonte desabilitada lanca
// SourceDisabledError (a rota traduz para 400 SOURCE_DISABLED — D-33, T-03-02-04).

import { SourceClient } from './sourceClient.js';
import type { SourceLevel, SourceName } from './types.js';

export interface SourceRegistryEntry {
  name: SourceName;
  level: SourceLevel;
  enabled: boolean;
}

/** Fonte conhecida mas desabilitada (ex.: oasisbr) ou inexistente no registry. */
export class SourceDisabledError extends Error {
  readonly source: SourceName;

  constructor(source: SourceName) {
    super(`Fonte ${source} desabilitada no registry.`);
    this.name = 'SourceDisabledError';
    this.source = source;
  }
}

export const SOURCE_REGISTRY: readonly SourceRegistryEntry[] = [
  { name: 'bdtd', level: 'unofficial', enabled: true },
  { name: 'capes', level: 'unofficial', enabled: true },
  { name: 'oasisbr', level: 'unofficial', enabled: false },
];

/** Meta do registry + client compartilhado da fonte (instancia unica). */
export interface SourceHandle {
  meta: SourceRegistryEntry;
  client: SourceClient;
}

const clients = new Map<SourceName, SourceClient>();

/** Retorna client+meta da fonte; lanca SourceDisabledError se desabilitada. */
export function getAdapter(name: SourceName): SourceHandle {
  const meta = SOURCE_REGISTRY.find((entry) => entry.name === name);
  if (meta === undefined || !meta.enabled) {
    throw new SourceDisabledError(name);
  }
  let client = clients.get(name);
  if (client === undefined) {
    client = new SourceClient(name);
    clients.set(name, client);
  }
  return { meta, client };
}

/** Lista as fontes do registry (base do GET /lab/sources). */
export function listSources(): SourceRegistryEntry[] {
  return [...SOURCE_REGISTRY];
}
