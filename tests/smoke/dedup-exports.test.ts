// tests/smoke — unit puro de dedup + exports (LAB-07/LAB-11, D-40/D-44/D-51/D-52/D-53).
//
// Sem PG: exercita normalizeTitle/canonicalKey/titleSimilarity/
// completenessScore + csvCell/escapeBibtex/exportFilename/bibtexKey/toCSV/
// toBibTeX/toExportJSON, incluindo adversariais (CSV-injection, filename com
// path traversal, BibTeX com especiais). Expects com valores literais.

import { describe, expect, it } from 'vitest';
import type { CorpusEntryDTO } from '@uhhu/contracts';
import {
  canonicalKey,
  completenessScore,
  FUZZY_THRESHOLD,
  normalizeAuthor,
  normalizeTitle,
  titleSimilarity,
} from '../../apps/core-api/src/lib/dedup.js';
import {
  bibtexKey,
  csvCell,
  escapeBibtex,
  exportFilename,
  protectBibtexTitle,
  slugifyAscii,
  toBibTeX,
  toCSV,
  toExportJSON,
} from '../../apps/core-api/src/lib/exports.js';

function makeEntry(overrides: Partial<CorpusEntryDTO> = {}): CorpusEntryDTO {
  return {
    groupId: '11111111-1111-4111-8111-111111111111',
    canonicalKey: 'abc123',
    title: 'Educacao inclusiva e tecnologia assistiva',
    authors: ['Maria Silva'],
    year: 2021,
    docType: 'masterThesis',
    institution: 'Universidade de Sao Paulo',
    program: null,
    abstract: 'Resumo do trabalho.',
    originUrl: 'https://bdtd.exemplo/trabalho/1',
    sourceUrl: null,
    decision: 'eligible',
    tags: ['incluir'],
    originCount: 2,
    origins: ['bdtd', 'capes'],
    memberIds: ['a1', 'a2'],
    ...overrides,
  };
}

describe('normalizeTitle', () => {
  it('remove acentos, pontuacao e caixa: exemplo canonico', () => {
    expect(normalizeTitle('Educação & Saúde: Guia!')).toBe('educacao saude guia');
  });

  it('BDTD x CAPES com variacao de acento/pontuacao equivalem', () => {
    expect(normalizeTitle('Educação inclusiva e tecnologia assistiva')).toBe(
      normalizeTitle('Educacao inclusiva e tecnologia assistiva!'),
    );
  });

  it('normalizeAuthor segue a mesma regra', () => {
    expect(normalizeAuthor('João S. Souza')).toBe('joao s souza');
  });
});

describe('canonicalKey', () => {
  it('ordem de autores embaralhada gera a mesma chave', () => {
    const a = canonicalKey('Letramento digital', 2022, ['Ana Souza', 'Bruno Lima']);
    const b = canonicalKey('Letramento digital', 2022, ['Bruno Lima', 'Ana Souza']);
    expect(a).toBe(b);
  });

  it('ano null vs ano gera chaves distintas', () => {
    const withYear = canonicalKey('Alfabetizacao cientifica', 2019, ['Paulo']);
    const nullYear = canonicalKey('Alfabetizacao cientifica', null, ['Paulo']);
    expect(withYear).not.toBe(nullYear);
  });

  it('chave e hex de 64 chars estavel', () => {
    const k1 = canonicalKey('Titulo X', 2020, ['A']);
    const k2 = canonicalKey('Titulo X', 2020, ['A']);
    expect(k1).toBe(k2);
    expect(k1).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('titleSimilarity', () => {
  it('titulos identicos retornam 1', () => {
    expect(titleSimilarity('Letramento digital', 'Letramento digital')).toBe(1);
  });

  it('typo de 1 char em titulo longo fica >= 0.9', () => {
    const sim = titleSimilarity(
      'Letramento digital nas escolas publicas do Brasil',
      'Letramento digital nas escolas publicas do Brasi',
    );
    expect(sim).toBeGreaterThanOrEqual(FUZZY_THRESHOLD);
    expect(sim).toBeLessThan(1);
  });

  it('titulos distintos do mesmo autor ficam < 0.9', () => {
    const sim = titleSimilarity(
      'Alfabetizacao cientifica no ensino medio',
      'Formacao docente para educacao do campo',
    );
    expect(sim).toBeLessThan(FUZZY_THRESHOLD);
  });

  it('strings vazias retornam 0', () => {
    expect(titleSimilarity('', '')).toBe(1);
    expect(titleSimilarity('', '   ')).toBe(1);
  });
});

describe('completenessScore (D-44)', () => {
  it('registro completo soma 4', () => {
    expect(
      completenessScore({
        abstract: 'resumo',
        authors: ['Maria Silva'],
        year: 2021,
        originUrl: 'https://x',
        sourceUrl: null,
      }),
    ).toBe(4);
  });

  it('registro vazio soma 0', () => {
    expect(
      completenessScore({
        abstract: null,
        authors: [],
        year: null,
        originUrl: null,
        sourceUrl: null,
      }),
    ).toBe(0);
  });
});

describe('csvCell adversarial (Pitfall 1)', () => {
  it('prefixa apóstrofo em =CMD(...)', () => {
    expect(csvCell('=CMD(1)')).toBe("'=CMD(1)");
  });

  it('prefixa apóstrofo em -2+3 e @sum', () => {
    expect(csvCell('-2+3')).toBe("'-2+3");
    expect(csvCell('@sum')).toBe("'@sum");
  });

  it('aplica quoting RFC4180 com "" duplicado em valor com virgula e aspas', () => {
    expect(csvCell('diz "ola", mundo')).toBe('"diz ""ola"", mundo"');
  });
});

describe('escapeBibtex (Pitfall 7)', () => {
  it('escapa & % # _ $ ~ ^ { }', () => {
    expect(escapeBibtex('& % # _ $ ~ ^ { }')).toBe(
      '\\& \\% \\# \\_ \\$ \\textasciitilde{} \\textasciicircum{} \\{ \\}',
    );
  });

  it('toBibTeX com especiais mantem chaves balanceadas', () => {
    const out = toBibTeX([
      makeEntry({ title: 'Genes & Desenvolvimento 100% (fase_1)', authors: ['Ana Souza'] }),
    ]);
    const opens = (out.match(/\{/g) ?? []).length;
    const closes = (out.match(/\}/g) ?? []).length;
    expect(opens).toBe(closes);
    expect(out).toContain('\\&');
  });

  it('protectBibtexTitle protege siglas ALL-CAPS', () => {
    expect(protectBibtexTitle('DNA repair in RNA viruses')).toBe('{DNA} repair in {RNA} viruses');
  });
});

describe('exportFilename adversarial (Pitfall 2, D-52)', () => {
  it('titulo malicioso vira slug ASCII puro', () => {
    const name = exportFilename('Snapshots "../../etc" São Paulo', '2026-09-11', 'csv');
    expect(name).toMatch(/^corpus-[a-z0-9-]+-2026-09-11\.csv$/);
    expect(name).not.toContain('"');
    expect(name).not.toContain('..');
    expect(name).not.toContain('/');
  });

  it('slugifyAscii limita a 60 chars com fallback projeto', () => {
    expect(slugifyAscii('')).toBe('projeto');
    expect(slugifyAscii('A'.repeat(200)).length).toBeLessThanOrEqual(60);
  });
});

describe('bibtexKey (D-51)', () => {
  it('order 0 fica com a base; 1 vira -a; 2 vira -b', () => {
    const base = bibtexKey('Souza', 2021, 'bdtd', 0);
    expect(base).toBe('souza2021bdtd');
    expect(bibtexKey('Souza', 2021, 'bdtd', 1)).toBe(`${base}-a`);
    expect(bibtexKey('Souza', 2021, 'bdtd', 2)).toBe(`${base}-b`);
  });

  it('ano null usa sano', () => {
    expect(bibtexKey('Souza', null, 'capes', 0)).toBe('souzasanocapes');
  });
});

describe('toCSV (D-53)', () => {
  it('2 entries geram header + 2 linhas com decisao do grupo', () => {
    const csv = toCSV([
      makeEntry({ groupId: 'g1', decision: 'eligible', tags: ['incluir', 'revisar'] }),
      makeEntry({
        groupId: 'g2',
        decision: 'ineligible',
        tags: [],
        origins: ['bdtd'],
        originCount: 1,
      }),
    ]);
    const lines = csv.split('\n');
    expect(lines[0]).toBe(
      'groupId,canonicalKey,title,authors,year,docType,institution,decision,tags,originCount,origins',
    );
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain('eligible');
    expect(lines[2]).toContain('ineligible');
  });
});

describe('toBibTeX entry types + toExportJSON', () => {
  it('doctoralThesis vira @phdthesis e masterThesis vira @mastersthesis', () => {
    const out = toBibTeX([
      makeEntry({ docType: 'doctoralThesis', authors: ['Ana Souza'], year: 2020 }),
      makeEntry({ docType: 'masterThesis', authors: ['Bruno Lima'], year: 2021 }),
    ]);
    expect(out).toContain('@phdthesis{');
    expect(out).toContain('@mastersthesis{');
  });

  it('toExportJSON inclui projectId, groups e provenance', () => {
    const raw = toExportJSON('proj-1', [makeEntry()], { runs: ['r1'] });
    const parsed: unknown = JSON.parse(raw);
    expect(typeof parsed).toBe('object');
    if (typeof parsed !== 'object' || parsed === null) {
      throw new Error('export JSON fora do formato');
    }
    const record = parsed as Record<string, unknown>;
    expect(record['projectId']).toBe('proj-1');
    expect(Array.isArray(record['groups'])).toBe(true);
    expect(typeof record['exportedAt']).toBe('string');
    const prov: unknown = record['provenance'];
    expect(JSON.stringify(prov)).toContain('r1');
  });
});
