// apps/lab — testes dos helpers do histórico (07-04 task 1, puros, sem rede).
//
// formatRunWhen cobre hoje vs outra data vs inválida; summarizeRun cobre total
// = soma da cobertura e detecção de fontes faltantes (failed/skipped).
// Sem timers, sem rede, sem `any` (tipos do contrato + narrowing).

import { describe, expect, it } from 'vitest';
import type { PerSourceStatus, SearchRunDTO } from '@uhhu/contracts';
import { formatRunWhen, summarizeRun } from '../runHistory';

interface RunOverrides {
  bdtdStatus?: PerSourceStatus;
  capesStatus?: PerSourceStatus;
  bdtdCoverage?: number;
  capesCoverage?: number;
  newCount?: number;
  startedAt?: string | null;
  finishedAt?: string | null;
  executedAt?: string;
}

function makeRun(overrides?: RunOverrides): SearchRunDTO {
  const bdtdStatus: PerSourceStatus = overrides?.bdtdStatus ?? 'ok';
  const capesStatus: PerSourceStatus = overrides?.capesStatus ?? 'ok';
  return {
    id: '11111111-1111-4111-8111-111111111111',
    searchId: '22222222-2222-4222-8222-222222222222',
    status: 'succeeded',
    termSnapshot: 'termo',
    filtersSnapshot: {},
    sourcesSnapshot: ['bdtd', 'capes'],
    executedAt: overrides?.executedAt ?? '2026-09-11T10:00:00Z',
    startedAt: overrides?.startedAt !== undefined ? overrides.startedAt : '2026-09-11T10:00:00Z',
    finishedAt: overrides?.finishedAt !== undefined ? overrides.finishedAt : '2026-09-11T10:00:42Z',
    metrics: {
      perSource: {
        bdtd: { status: bdtdStatus, total: 4, returned: 4, durationMs: 1200 },
        capes: { status: capesStatus, total: 6, returned: 6, durationMs: 2300 },
      },
      newCount: overrides?.newCount ?? 5,
      coverage: {
        bdtd: overrides?.bdtdCoverage ?? 4,
        capes: overrides?.capesCoverage ?? 6,
      },
    },
    error: null,
  };
}

describe('formatRunWhen (data/hora da entrada D-12)', () => {
  it('mesmo dia → "hoje HH:MM"', () => {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    expect(formatRunWhen(now.toISOString())).toBe(`hoje ${hh}:${mm}`);
  });

  it('outra data → "DD/MM HH:MM"', () => {
    const out: string = formatRunWhen('2020-01-15T10:30:00Z');
    expect(out).toMatch(/^\d{2}\/\d{2} \d{2}:\d{2}$/);
    expect(out.startsWith('hoje')).toBe(false);
  });

  it('inválida ou vazia → travessão', () => {
    expect(formatRunWhen('nao-e-data')).toBe('—');
    expect(formatRunWhen('')).toBe('—');
  });
});

describe('summarizeRun (total + faltantes D-12)', () => {
  it('total = soma da cobertura (bdtd + capes)', () => {
    const summary = summarizeRun(makeRun({ bdtdCoverage: 3, capesCoverage: 7 }));
    expect(summary.total).toBe(10);
  });

  it('sem falha → missing vazio', () => {
    const summary = summarizeRun(makeRun());
    expect(summary.missing).toEqual([]);
  });

  it('parcial detecta fontes faltantes (failed/skipped)', () => {
    const summary = summarizeRun(makeRun({ bdtdStatus: 'failed', capesStatus: 'skipped' }));
    expect(summary.missing).toEqual(['BDTD', 'CAPES']);
  });

  it('uma fonte falhou → só ela aparece', () => {
    const summary = summarizeRun(makeRun({ bdtdStatus: 'failed' }));
    expect(summary.missing).toEqual(['BDTD']);
  });

  it('repasse de newCount e janela de duração', () => {
    const summary = summarizeRun(
      makeRun({
        newCount: 9,
        startedAt: '2026-09-11T10:00:00Z',
        finishedAt: null,
      }),
    );
    expect(summary.newCount).toBe(9);
    expect(summary.startedAt).toBe('2026-09-11T10:00:00Z');
    expect(summary.finishedAt).toBe(null);
  });
});
