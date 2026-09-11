// packages/integrations — tipos compartilhados das fontes (fronteira integrations).
//
// DEFINICAO UNICA destes tipos de adapter: adapters (bdtd/capes, 03-03) e o
// executor (03-04) importam daqui; DTOs publicos continuam em `@uhhu/contracts`.
// Nenhum tipo aqui carrega segredo: o jar vive dentro do SourceClient e nunca
// atravessa estas interfaces. `fetchFn` injetavel = testes sem rede.

/** Fontes conhecidas pelo registry (dev-docs/04 §4). */
export type SourceName = 'bdtd' | 'capes' | 'oasisbr';

/** Nivel da fonte perante o provedor (v1: tudo nao-oficial, com cortesia). */
export type SourceLevel = 'official' | 'unofficial';

/** Resultado de uma pagina numa fonte: ok, falha, ou challenge anti-bot. */
export type SourceStatus = 'ok' | 'failed' | 'challenge';

/** Item normalizado: lingua comum entre adapters e o executor. */
export interface NormalizedItem {
  sourceId: string;
  title: string;
  authors: string[];
  year: number | null;
  docType: string | null;
  institution: string | null;
  program: string | null;
  abstract: string | null;
  originUrl: string | null;
  sourceUrl: string | null;
  rawMetadata: Record<string, unknown>;
}

/** Pagina de busca de uma fonte (total pode ser desconhecido: null). */
export interface SourcePage {
  total: number | null;
  items: NormalizedItem[];
  sourceStatus: SourceStatus;
}

/** Busca declarativa repassada ao adapter (filtros honrados conforme a fonte). */
export interface SearchDef {
  term: string;
  yearFrom?: number;
  yearTo?: number;
  docTypes?: string[];
  area?: string;
  institution?: string;
  program?: string;
}

/** Contexto de fetch: signal do chamador + fetch injetavel para testes. */
export interface SourceClientContext {
  signal: AbortSignal;
  fetchFn?: typeof fetch;
}

/** Contrato que todo adapter de fonte implementa (dev-docs/07 §15.1). */
export interface SourceAdapter {
  name: SourceName;
  level: SourceLevel;
  enabled: boolean;
  search(def: SearchDef, page: number, ctx: SourceClientContext): Promise<SourcePage>;
  enrich(sourceId: string, ctx: SourceClientContext): Promise<NormalizedItem>;
}
