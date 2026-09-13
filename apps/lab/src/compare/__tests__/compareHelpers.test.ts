// apps/lab — testes dos helpers puros da comparação (09-04 task 1, UI-27/UI-28).
//
// Cobre: vencedora simples; empate devolve o primeiro em order; totals vazio
// ou sem id de order devolve null; overlap nas duas ordens de chave; overlap
// ausente devolve 0; anos numéricos crescentes com `desconhecido` por último;
// histograma vazio devolve []; totals com id fora de order é ignorado.
// Sem rede e sem tipo proibido.

import { describe, expect, it } from 'vitest';
import { mostInclusive, pairOverlap, sortedYearRows } from '../compareHelpers';
import type { YearRow } from '../compareHelpers';

function buckets(rows: YearRow[]): string[] {
  const out: string[] = [];
  for (const row of rows) {
    out.push(row.bucket);
  }
  return out;
}

describe('mostInclusive vencedora e empate', () => {
  it('vencedora simples é o id com maior total', () => {
    const winner: string | null = mostInclusive({ a: 10, b: 42, c: 7 }, ['a', 'b', 'c']);
    expect(winner).toBe('b');
  });

  it('empate devolve o primeiro em order', () => {
    const winner: string | null = mostInclusive({ a: 30, b: 30, c: 5 }, ['b', 'a', 'c']);
    expect(winner).toBe('b');
    const winner2: string | null = mostInclusive({ a: 30, b: 30, c: 5 }, ['a', 'b', 'c']);
    expect(winner2).toBe('a');
  });
});

describe('mostInclusive vazio e ordem', () => {
  it('vazio ou sem id de order devolve null', () => {
    expect(mostInclusive({}, ['a', 'b'])).toBeNull();
    expect(mostInclusive({ a: 10 }, [])).toBeNull();
    expect(mostInclusive({ a: 10 }, ['x', 'y'])).toBeNull();
  });

  it('totals com id fora de order é ignorado', () => {
    const winner: string | null = mostInclusive({ outsider: 9999, a: 10, b: 20 }, ['a', 'b']);
    expect(winner).toBe('b');
  });
});

describe('pairOverlap chaves e ausência', () => {
  it('overlap nas 2 ordens de chave', () => {
    expect(pairOverlap({ 'a|b': 4 }, 'a', 'b')).toBe(4);
    expect(pairOverlap({ 'a|b': 4 }, 'b', 'a')).toBe(4);
  });

  it('overlap ausente devolve 0', () => {
    expect(pairOverlap({}, 'a', 'b')).toBe(0);
    expect(pairOverlap({ 'a|c': 3 }, 'a', 'b')).toBe(0);
  });
});

describe('sortedYearRows ordenação e vazio', () => {
  it('anos ordenados com desconhecido no fim', () => {
    const rows: YearRow[] = sortedYearRows({
      desconhecido: 2,
      '2023': 5,
      '2020': 9,
      '2021': 1,
    });
    expect(buckets(rows)).toEqual(['2020', '2021', '2023', 'desconhecido']);
    expect(rows[0]).toEqual({ bucket: '2020', count: 9 });
    expect(rows[3]).toEqual({ bucket: 'desconhecido', count: 2 });
  });

  it('histograma vazio devolve vazio', () => {
    expect(sortedYearRows({})).toEqual([]);
  });
});
