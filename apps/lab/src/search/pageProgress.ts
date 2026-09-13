// apps/lab — linha de progresso por fonte da tela de execução (08-06, UI-14).
//
// Pura (sem react-native): testável no vitest node. A tela run.tsx só monta o
// JSX com a string daqui. skipped→pulada, failed→falhou, ok + run em
// andamento→buscando… (ou "buscando página X de ~Y" com métricas de páginas),
// ok + terminal→contagem real (com nº de páginas quando houver métricas).
// Guards são UX; autorização real continua no CORE (AGENTS.md).

import type { ExecutableSource, SearchRunDTO } from '@uhhu/contracts';
import { formatPageProgress, isTerminalStatus } from './useRunPolling';

export function sourceProgressLine(source: ExecutableSource, run: SearchRunDTO): string {
  const metrics = run.metrics.perSource[source];
  if (metrics.status === 'skipped') {
    return 'pulada';
  }
  if (metrics.status === 'failed') {
    return 'falhou';
  }
  const pageProgress: string | null = formatPageProgress(
    metrics.pagesFetched,
    metrics.pagesTotal,
  );
  if (!isTerminalStatus(run.status)) {
    return pageProgress ?? 'buscando…';
  }
  const base: string = `${metrics.returned} itens · ${metrics.durationMs}ms`;
  if (typeof metrics.pagesFetched === 'number' && metrics.pagesFetched > 0) {
    return `${base} · ${metrics.pagesFetched} página(s)`;
  }
  return base;
}
