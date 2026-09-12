// apps/lab — testes dos helpers de polling (07-03 task 1, puros, sem rede).
//
// isTerminalStatus cobre os 6 status do contrato; runStatusLabel cobre os 6
// rótulos PT da tela; formatDurationMs cobre duração fechada, em andamento e
// sem início. Sem timers, sem rede, sem `any` (string + narrowing).

import { describe, expect, it } from 'vitest';
import type { RunStatus } from '@uhhu/contracts';
import { formatDurationMs, isTerminalStatus, runStatusLabel } from '../useRunPolling';

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
