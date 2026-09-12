// apps/lab — testes do helper searchTerm (07-02 task 1, sem rede).
//
// buildSearchTerm compõe linhas AND/OR/NOT no termo pass-through do contrato;
// splitSearchTerm faz o inverso aproximado para edição. Cada termo composto é
// validado com `searchTermSchema.parse` (aspas balanceadas, 1..500) — o mesmo
// schema que o servidor aplica. Sem `any` (string + narrowing); sem segredo.

import { describe, expect, it } from 'vitest';
import { searchTermSchema } from '@uhhu/contracts';
import { buildSearchTerm, splitSearchTerm } from '../searchTerm';
import type { TermRow } from '../searchTerm';

describe('buildSearchTerm (linhas → termo do contrato)', () => {
  it('1 linha simples passa verbatim', () => {
    const term: string = buildSearchTerm([{ text: 'química', op: 'AND' }]);
    expect(term).toBe('química');
    expect(searchTermSchema.parse(term)).toBe('química');
  });

  it('2 linhas com espaço: primeira entre aspas, junção AND', () => {
    const term: string = buildSearchTerm([
      { text: 'ensino de química', op: 'AND' },
      { text: 'gamificação', op: 'AND' },
    ]);
    expect(term).toBe('"ensino de química" AND gamificação');
    expect(searchTermSchema.parse(term)).toBe(term);
  });

  it('operador NOT antes da 2ª linha', () => {
    const term: string = buildSearchTerm([
      { text: 'química', op: 'AND' },
      { text: 'orgânica', op: 'NOT' },
    ]);
    expect(term).toBe('química NOT orgânica');
    expect(searchTermSchema.parse(term)).toBe(term);
  });

  it('linha vazia é descartada; op da primeira é ignorado', () => {
    const term: string = buildSearchTerm([
      { text: '   ', op: 'OR' },
      { text: 'química', op: 'NOT' },
      { text: 'ensino médio', op: 'OR' },
    ]);
    expect(term).toBe('química OR "ensino médio"');
    expect(searchTermSchema.parse(term)).toBe(term);
  });

  it('texto já entre aspas não é re-envolvido; aspas seguem balanceadas', () => {
    const term: string = buildSearchTerm([{ text: '"ensino de química"', op: 'AND' }]);
    expect(term).toBe('"ensino de química"');
    expect(searchTermSchema.parse(term)).toBe(term);
  });

  it('OR entre linhas compõe com OR', () => {
    const term: string = buildSearchTerm([
      { text: 'TDIC', op: 'AND' },
      { text: 'formação de professores', op: 'OR' },
    ]);
    expect(term).toBe('TDIC OR "formação de professores"');
    expect(searchTermSchema.parse(term)).toBe(term);
  });
});

describe('splitSearchTerm (termo → linhas para edição)', () => {
  it('round-trip build → split → build preserva o termo', () => {
    const original: string = buildSearchTerm([
      { text: 'ensino de química', op: 'AND' },
      { text: 'gamificação', op: 'AND' },
    ]);
    const rows: TermRow[] = splitSearchTerm(original);
    expect(rows.length).toBe(2);
    expect(buildSearchTerm(rows)).toBe(original);
  });

  it('recupera o operador OR da 2ª linha', () => {
    const rows: TermRow[] = splitSearchTerm('TDIC OR "formação de professores"');
    expect(rows.length).toBe(2);
    const second: TermRow | undefined = rows[1];
    expect(second?.op).toBe('OR');
    expect(buildSearchTerm(rows)).toBe('TDIC OR "formação de professores"');
  });

  it('não divide AND dentro de frase exata entre aspas', () => {
    const rows: TermRow[] = splitSearchTerm('"A AND B" AND C');
    expect(rows.length).toBe(2);
    const first: TermRow | undefined = rows[0];
    expect(first?.text).toBe('"A AND B"');
    expect(buildSearchTerm(rows)).toBe('"A AND B" AND C');
  });

  it('termo de linha única vira uma linha; vazio vira linha vazia', () => {
    const single: TermRow[] = splitSearchTerm('química');
    expect(single.length).toBe(1);
    expect(single[0]?.text).toBe('química');
    const empty: TermRow[] = splitSearchTerm('   ');
    expect(empty.length).toBe(1);
    expect(empty[0]?.text).toBe('');
  });
});
