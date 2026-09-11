// packages/integrations — registry de adapters BDTD/CAPES (fronteira integrations).
//
// `getSourceAdapter('bdtd' | 'capes')` devolve `{ search, enrich, version }` para
// o executor de runs e as rotas (03-04/03-05 consomem via barrel `src/index.ts`;
// o módulo direto continua importável quando o chamador quiser evitar o barrel).
// `oasisbr` lança o mesmo SourceDisabledError do registry (D-33: a rota traduz
// para 400 SOURCE_DISABLED).
//
// Enrich sob demanda: adapters expõem `enrich`, mas o run NÃO chama enrich —
// enriquecimento em batch só para elegíveis é Phase 4 (03-lab-spec-v1 §6).

import {
  ADAPTER_VERSION as BDTD_VERSION,
  enrichBdtd,
  searchBdtd,
  type SourcePagination,
} from './bdtd.js';
import { ADAPTER_VERSION as CAPES_VERSION, enrichCapes, searchCapes } from './capes.js';
import { SourceDisabledError } from './registry.js';
import type { SourceClient } from './sourceClient.js';
import type { NormalizedItem, SearchDef, SourceClientContext, SourcePage } from './types.js';

/** Adapter executável: busca + enrich sob demanda + versão de proveniência. */
export interface LabSourceAdapter {
  name: 'bdtd' | 'capes';
  version: string;
  search(
    client: SourceClient,
    def: SearchDef,
    pagination: SourcePagination,
    ctx: SourceClientContext,
  ): Promise<SourcePage>;
  enrich(client: SourceClient, sourceId: string, ctx: SourceClientContext): Promise<NormalizedItem>;
}

/**
 * Devolve o adapter da fonte. `oasisbr` (desabilitada no registry) lança
 * SourceDisabledError; nome desconhecido lança Error (erro de programação —
 * a rota valida a fonte antes).
 */
export function getSourceAdapter(name: string): LabSourceAdapter {
  if (name === 'bdtd') {
    return { name, version: BDTD_VERSION, search: searchBdtd, enrich: enrichBdtd };
  }
  if (name === 'capes') {
    return { name, version: CAPES_VERSION, search: searchCapes, enrich: enrichCapes };
  }
  if (name === 'oasisbr') {
    throw new SourceDisabledError(name);
  }
  throw new Error(`Fonte desconhecida: ${name}.`);
}
