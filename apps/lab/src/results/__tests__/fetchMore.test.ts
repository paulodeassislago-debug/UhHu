// apps/lab — testes do BUSCAR MAIS incremental (08-07, puros, sem rede).
//
// Cobre: botão aparece com hasMore em qualquer fonte; some sem hasMore;
// Y do botão soma só fontes com hasMore; Y do "X de Y" soma executadas;
// guarda anti-double-tap; rótulo honesto. Sem `any`.

import { describe, expect, it } from 'vitest';
import type { SearchRunDTO } from '@uhhu/contracts';
import {
  fetchMoreAvailability,
  fetchMoreLabel,
  shouldStartFetchMore,
  sourceHasMore,
} from '../fetchMore';

function testRun(
  bdtd: { total: number; returned: number },
  capes: { total: number; returned: number } | null,
): SearchRunDTO {
  return {
    id: 'run-teste',
    searchId: 'search-teste',
    status: 'succeeded',
    termSnapshot: '"teste"',
    filtersSnapshot: {},
    sourcesSnapshot: capes === null ? ['bdtd'] : ['bdtd', 'capes'],
    executedAt: '2026-09-12T10:00:00Z',
    startedAt: '2026-09-12T10:00:00Z',
    finishedAt: '2026-09-12T10:00:01Z',
    metrics: {
      perSource: {
        bdtd: { status: 'ok', total: bdtd.total, returned: bdtd.returned, durationMs: 5 },
        capes:
          capes === null
            ? { status: 'skipped', total: 0, returned: 0, durationMs: 0 }
            : { status: 'ok', total: capes.total, returned: capes.returned, durationMs: 5 },
      },
      newCount: bdtd.returned + (capes === null ? 0 : capes.returned),
      coverage: { bdtd: bdtd.returned, capes: capes === null ? 0 : capes.returned },
    },
    error: null,
  };
}

describe('sourceHasMore (totalKnown vs armazenados do servidor)', () => {
  it('stored < total → true; stored == total → false', () => {
    expect(sourceHasMore(testRun({ total: 250, returned: 100 }, null), 'bdtd')).toBe(true);
    expect(sourceHasMore(testRun({ total: 250, returned: 250 }, null), 'bdtd')).toBe(false);
  });

  it('fonte fora do snapshot ou pulada → false', () => {
    expect(sourceHasMore(testRun({ total: 250, returned: 100 }, null), 'capes')).toBe(false);
    const skipped: SearchRunDTO = {
      ...testRun({ total: 250, returned: 100 }, { total: 0, returned: 0 }),
      metrics: {
        ...testRun({ total: 250, returned: 100 }, { total: 0, returned: 0 }).metrics,
        perSource: {
          bdtd: { status: 'ok', total: 250, returned: 100, durationMs: 5 },
          capes: { status: 'skipped', total: 0, returned: 0, durationMs: 0 },
        },
      },
    };
    expect(sourceHasMore(skipped, 'capes')).toBe(false);
  });
});

describe('fetchMoreAvailability (botão + contadores)', () => {
  it('hasMore em qualquer fonte mostra o botão', () => {
    const both = fetchMoreAvailability(
      testRun({ total: 250, returned: 100 }, { total: 120, returned: 100 }),
    );
    expect(both.hasMore).toBe(true);
    expect(both.hasMoreBdtd).toBe(true);
    expect(both.hasMoreCapes).toBe(true);
    const one = fetchMoreAvailability(
      testRun({ total: 250, returned: 250 }, { total: 120, returned: 100 }),
    );
    expect(one.hasMore).toBe(true);
    expect(one.hasMoreBdtd).toBe(false);
    expect(one.hasMoreCapes).toBe(true);
    const none = fetchMoreAvailability(
      testRun({ total: 250, returned: 250 }, { total: 120, returned: 120 }),
    );
    expect(none.hasMore).toBe(false);
  });

  it('totalKnown soma executadas; remaining soma só com hasMore', () => {
    const avail = fetchMoreAvailability(
      testRun({ total: 250, returned: 250 }, { total: 120, returned: 100 }),
    );
    expect(avail.totalKnown).toBe(370);
    expect(avail.remainingKnown).toBe(120);
  });
});

describe('fetchMoreLabel (rótulo honesto do botão)', () => {
  it('"BUSCAR MAIS — mais 100 de ~Y"', () => {
    expect(fetchMoreLabel(370)).toBe('BUSCAR MAIS — mais 100 de ~370');
  });
});

describe('shouldStartFetchMore (guarda anti-double-tap)', () => {
  it('em voo → false (segundo toque não duplica a chamada)', () => {
    expect(shouldStartFetchMore(true, true)).toBe(false);
  });

  it('sem hasMore → false (fim real não re-puxa)', () => {
    expect(shouldStartFetchMore(false, false)).toBe(false);
  });

  it('livre + hasMore → true', () => {
    expect(shouldStartFetchMore(false, true)).toBe(true);
  });
});
