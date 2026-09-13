// apps/lab — helpers puros do histórico de runs (D-12, UI-16, 07-04 task 1).
//
// Módulo puro (sem react-native/expo-router) para os helpers serem testáveis
// no vitest — que não coleta arquivos com imports nativos. O componente
// RunHistory.tsx importa daqui; a tela nunca duplica estas regras.
// - formatRunWhen(iso): mesmo dia → "hoje HH:MM", senão "DD/MM HH:MM",
//   string vazia ou inválida → "—" (query hostil nunca quebra a lista).
// - summarizeRun(run): total = soma da cobertura (bdtd + capes); missing =
//   rótulos das fontes com status failed/skipped (blocos explícitos, sem
//   iteração genérica — mesmo padrão dos blocos por fonte da tela do run).
// Tipos em definição única via `import type` de @uhhu/contracts; sem `any`.

import type { SearchRunDTO } from '@uhhu/contracts';

export interface RunSummary {
  total: number;
  newCount: number;
  missing: string[];
  startedAt: string | null;
  finishedAt: string | null;
}

// Data/hora da entrada D-12: mesmo dia → "hoje HH:MM", senão "DD/MM HH:MM";
// string vazia ou inválida → "—".
export function formatRunWhen(iso: string): string {
  if (iso.length === 0) {
    return '—';
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  if (sameDay) {
    return `hoje ${hh}:${mm}`;
  }
  const dd = String(date.getDate()).padStart(2, '0');
  const mo = String(date.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mo} ${hh}:${mm}`;
}

// Resumo puro de uma entrada D-12: total = soma da cobertura;
// missing = fontes com status failed/skipped.
export function summarizeRun(run: SearchRunDTO): RunSummary {
  const missing: string[] = [];
  if (run.metrics.perSource.bdtd.status !== 'ok') {
    missing.push('BDTD');
  }
  if (run.metrics.perSource.capes.status !== 'ok') {
    missing.push('CAPES');
  }
  return {
    total: run.metrics.coverage.bdtd + run.metrics.coverage.capes,
    newCount: run.metrics.newCount,
    missing,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
  };
}
