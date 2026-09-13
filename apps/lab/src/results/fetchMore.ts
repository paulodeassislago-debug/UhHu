// apps/lab — disponibilidade do BUSCAR MAIS incremental (08-07, UI-14/UI-17).
//
// Puro (sem react-native/rede): testável no vitest node. A tela results.tsx só
// monta o botão com as strings daqui; o hook useResultsList decide quando
// chamar `labApi.fetchMore`. hasMore por fonte = `returned < total` nas
// métricas do próprio run (total = totalKnown da fonte, nunca contagem
// client-side). Guards são UX; autorização real continua no CORE.

import type { ExecutableSource, SearchRunDTO } from '@uhhu/contracts';

/** Tamanho do lote incremental por fonte (espelha o servidor, só display). */
export const FETCH_MORE_BATCH_SIZE = 100;

/** hasMore de UMA fonte no run (totalKnown vs armazenados do servidor). */
export function sourceHasMore(run: SearchRunDTO, source: ExecutableSource): boolean {
  if (!run.sourcesSnapshot.includes(source)) {
    return false;
  }
  const metrics = run.metrics.perSource[source];
  if (metrics.status === 'skipped') {
    return false;
  }
  return metrics.returned < metrics.total;
}

export interface FetchMoreAvailability {
  /** True quando QUALQUER fonte tem mais a puxar (mostra o botão). */
  hasMore: boolean;
  hasMoreBdtd: boolean;
  hasMoreCapes: boolean;
  /** Soma dos totalKnown das fontes executadas (Y do "X de Y"). */
  totalKnown: number;
  /** Soma dos totalKnown SÓ das fontes com hasMore (Y do botão). */
  remainingKnown: number;
}

/** Disponibilidade do BUSCAR MAIS a partir do run fresco do servidor. */
export function fetchMoreAvailability(run: SearchRunDTO): FetchMoreAvailability {
  const hasMoreBdtd = sourceHasMore(run, 'bdtd');
  const hasMoreCapes = sourceHasMore(run, 'capes');
  let totalKnown = 0;
  let remainingKnown = 0;
  const sources: ExecutableSource[] = ['bdtd', 'capes'];
  for (const source of sources) {
    if (!run.sourcesSnapshot.includes(source)) {
      continue;
    }
    const metrics = run.metrics.perSource[source];
    if (metrics.status === 'skipped') {
      continue;
    }
    totalKnown += metrics.total;
    if (sourceHasMore(run, source)) {
      remainingKnown += metrics.total;
    }
  }
  return {
    hasMore: hasMoreBdtd || hasMoreCapes,
    hasMoreBdtd,
    hasMoreCapes,
    totalKnown,
    remainingKnown,
  };
}

/** Rótulo do botão: "BUSCAR MAIS — mais 100 de ~Y" (Y = totalKnown com hasMore). */
export function fetchMoreLabel(remainingKnown: number): string {
  return `BUSCAR MAIS — mais 100 de ~${remainingKnown}`;
}

/**
 * Guarda de disparo (double-tap seguro + fim real): só inicia o fetch-more
 * quando há mais a puxar E nenhum lote em voo. O hook/tela desabilita o
 * botão durante o load; o servidor ainda protege com onConflictDoNothing.
 */
export function shouldStartFetchMore(loading: boolean, hasMore: boolean): boolean {
  if (loading) {
    return false;
  }
  return hasMore;
}
