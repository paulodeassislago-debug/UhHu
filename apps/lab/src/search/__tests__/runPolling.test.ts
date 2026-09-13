// apps/lab — testes dos helpers de polling (07-03 task 1, puros, sem rede).
//
// isTerminalStatus cobre os 6 status do contrato; runStatusLabel cobre os 6
// rótulos PT da tela; formatDurationMs cobre duração fechada, em andamento e
// sem início. Sem timers, sem rede, sem `any` (string + narrowing).

import { describe, expect, it } from 'vitest';
import type { RunStatus, SearchRunDTO } from '@uhhu/contracts';
import { sourceProgressLine } from '../pageProgress';
import {
  RUN_POLL_INTERVAL_MS,
  RUN_POLL_MAX_POLLS,
  formatDurationMs,
  formatPageProgress,
  isTerminalStatus,
  runStatusLabel,
} from '../useRunPolling';

describe('isTerminalStatus (queued/running seguem; demais param)', () => {
  it('queued e running não são terminais', () => {
    const live: RunStatus[] = ['queued', 'running'];
    for (const status of live) {
      expect(isTerminalStatus(status)).toBe(false);
    }
  });

  it('succeeded, partial, failed e cancelled são terminais', () => {
    const terminal: RunStatus[] = ['succeeded', 'partial', 'failed', 'cancelled'];
    for (const status of terminal) {
      expect(isTerminalStatus(status)).toBe(true);
    }
  });
});

describe('runStatusLabel (rótulos PT da tela)', () => {
  it('cobre os 6 status do contrato', () => {
    const expected: Array<{ status: RunStatus; label: string }> = [
      { status: 'queued', label: 'na fila' },
      { status: 'running', label: 'executando' },
      { status: 'succeeded', label: 'ok' },
      { status: 'partial', label: 'parcial' },
      { status: 'failed', label: 'falha' },
      { status: 'cancelled', label: 'cancelada' },
    ];
    for (const entry of expected) {
      expect(runStatusLabel(entry.status)).toBe(entry.label);
    }
  });
});

describe('formatDurationMs (duração do cabeçalho)', () => {
  it('início e fim presentes → segundos arredondados', () => {
    const out: string = formatDurationMs(
      '2026-09-11T10:00:00Z',
      '2026-09-11T10:00:42Z',
      Date.parse('2026-09-11T10:00:42Z'),
    );
    expect(out).toBe('42s');
  });

  it('sem início → travessão', () => {
    expect(formatDurationMs(null, null, Date.parse('2026-09-11T10:00:42Z'))).toBe('—');
    expect(formatDurationMs(null, '2026-09-11T10:00:42Z', Date.parse('2026-09-11T10:00:42Z'))).toBe(
      '—',
    );
  });

  it('run em andamento mede até now', () => {
    const out: string = formatDurationMs(
      '2026-09-11T10:00:00Z',
      null,
      Date.parse('2026-09-11T10:00:05Z'),
    );
    expect(out).toBe('5s');
  });
});

describe('RUN_POLL_MAX_POLLS (teto 10min da 08-07, runs curtos de novo)', () => {
  it('240 polls × 2.5s = 10min (cobre os lotes de 60s com folga)', () => {
    expect(RUN_POLL_MAX_POLLS).toBe(240);
    expect(RUN_POLL_INTERVAL_MS * RUN_POLL_MAX_POLLS).toBe(10 * 60_000);
  });

  it('voltou aos 240 (o eager 08-06 de 720 foi substituído pelo lote 08-07)', () => {
    expect(RUN_POLL_MAX_POLLS).toBeLessThanOrEqual(240);
  });
});

describe('formatPageProgress (página X de ~Y, 08-06)', () => {
  it('com páginas e total → "buscando página X de ~Y"', () => {
    expect(formatPageProgress(2, 3)).toBe('buscando página 3 de ~3');
  });

  it('sem total declarado → só a página corrente', () => {
    expect(formatPageProgress(1, null)).toBe('buscando página 2');
    expect(formatPageProgress(1, undefined)).toBe('buscando página 2');
  });

  it('sem páginas ou sem métricas → null (tela mantém "buscando…")', () => {
    expect(formatPageProgress(0, 3)).toBeNull();
    expect(formatPageProgress(undefined, undefined)).toBeNull();
    expect(formatPageProgress(undefined, 3)).toBeNull();
  });
});

function testRun(status: SearchRunDTO['status'], bdtdPages: number | undefined): SearchRunDTO {
  const base = {
    status: 'skipped' as const,
    total: 0,
    returned: 0,
    durationMs: 0,
  };
  return {
    id: 'run-teste',
    searchId: 'search-teste',
    status,
    termSnapshot: '"teste"',
    filtersSnapshot: {},
    sourcesSnapshot: ['bdtd'],
    executedAt: '2026-09-12T10:00:00Z',
    startedAt: '2026-09-12T10:00:00Z',
    finishedAt: null,
    metrics: {
      perSource: {
        bdtd: {
          status: 'ok' as const,
          total: 120,
          returned: 120,
          durationMs: 5,
          ...(bdtdPages !== undefined ? { pagesFetched: bdtdPages, pagesTotal: 3 } : {}),
        },
        capes: base,
      },
      newCount: 120,
      coverage: { bdtd: 120, capes: 0 },
    },
    error: null,
  };
}

describe('sourceProgressLine (progresso por fonte na tela, 08-06)', () => {
  it('pulada/falhou conforme a fonte', () => {
    const skipped: SearchRunDTO = {
      ...testRun('running', undefined),
      metrics: {
        ...testRun('running', undefined).metrics,
        perSource: {
          bdtd: { status: 'skipped', total: 0, returned: 0, durationMs: 0 },
          capes: { status: 'failed', total: 0, returned: 0, durationMs: 1 },
        },
      },
    };
    expect(sourceProgressLine('bdtd', skipped)).toBe('pulada');
    expect(sourceProgressLine('capes', skipped)).toBe('falhou');
  });

  it('run em andamento sem métricas → "buscando…" (comportamento anterior)', () => {
    expect(sourceProgressLine('bdtd', testRun('running', undefined))).toBe('buscando…');
  });

  it('run em andamento com métricas → "buscando página X de ~Y"', () => {
    expect(sourceProgressLine('bdtd', testRun('running', 2))).toBe('buscando página 3 de ~3');
  });

  it('terminal com métricas → contagem + páginas; sem → só contagem', () => {
    expect(sourceProgressLine('bdtd', testRun('succeeded', 3))).toBe(
      '120 itens · 5ms · 3 página(s)',
    );
    expect(sourceProgressLine('bdtd', testRun('succeeded', undefined))).toBe('120 itens · 5ms');
  });
});
