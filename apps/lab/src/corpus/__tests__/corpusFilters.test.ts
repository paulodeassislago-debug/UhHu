// apps/lab — testes do filtro puro do corpus (09-02 task 1, UI-24).
//
// Cobre: filtro vazio devolve tudo na mesma ordem; só-tag; só-fonte; só-ano;
// combinação AND que zera; year null nunca casa com número; array vazio
// devolve vazio. Sem rede e sem tipo proibido; fixtures montadas com helper local.

import { describe, expect, it } from 'vitest';
import type { CorpusEntryDTO } from '@uhhu/contracts';
import { filterCorpus } from '../corpusFilters';

function makeEntry(overrides?: Partial<CorpusEntryDTO> & { groupId: string }): CorpusEntryDTO {
  return {
    groupId: overrides?.groupId ?? '00000000-0000-4000-8000-000000000000',
    canonicalKey: overrides?.canonicalKey ?? 'key-1',
    title: overrides?.title ?? 'Título',
    authors: overrides?.authors ?? ['Autora'],
    year: overrides?.year !== undefined ? overrides.year : 2023,
    docType: overrides?.docType !== undefined ? overrides.docType : 'doctoralThesis',
    institution: overrides?.institution !== undefined ? overrides.institution : 'USP',
    program: overrides?.program !== undefined ? overrides.program : null,
    abstract: overrides?.abstract !== undefined ? overrides.abstract : null,
    originUrl: overrides?.originUrl !== undefined ? overrides.originUrl : null,
    sourceUrl: overrides?.sourceUrl !== undefined ? overrides.sourceUrl : null,
    decision: overrides?.decision ?? 'eligible',
    tags: overrides?.tags ?? [],
    originCount: overrides?.originCount ?? 1,
    origins: overrides?.origins ?? ['bdtd'],
    memberIds: overrides?.memberIds ?? ['m1'],
  };
}

function buildEntries(): CorpusEntryDTO[] {
  return [
    makeEntry({
      groupId: '11111111-1111-4111-8111-111111111111',
      title: 'A sobre química',
      year: 2023,
      tags: ['revisar'],
      origins: ['bdtd'],
      originCount: 1,
    }),
    makeEntry({
      groupId: '22222222-2222-4222-8222-222222222222',
      title: 'B sobre física',
      year: 2021,
      tags: [],
      origins: ['capes'],
      originCount: 1,
    }),
    makeEntry({
      groupId: '33333333-3333-4333-8333-333333333333',
      title: 'C sobre química',
      year: 2023,
      tags: ['revisar'],
      origins: ['bdtd', 'capes'],
      originCount: 2,
    }),
  ];
}

function groupIds(entries: CorpusEntryDTO[]): string[] {
  const ids: string[] = [];
  for (const entry of entries) {
    ids.push(entry.groupId);
  }
  return ids;
}

describe('filterCorpus vazio e vazio de entrada', () => {
  it('filtro vazio devolve tudo na mesma ordem', () => {
    const entries: CorpusEntryDTO[] = buildEntries();
    const out: CorpusEntryDTO[] = filterCorpus(entries, {});
    expect(groupIds(out)).toEqual([
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      '33333333-3333-4333-8333-333333333333',
    ]);
    expect(out).not.toBe(entries);
  });

  it('array vazio devolve vazio', () => {
    const out: CorpusEntryDTO[] = filterCorpus([], { tag: 'revisar' });
    expect(out).toEqual([]);
    const outEmpty: CorpusEntryDTO[] = filterCorpus([], {});
    expect(outEmpty).toEqual([]);
  });
});

describe('filterCorpus por dimensão isolada', () => {
  it('só-tag filtra por presença em tags', () => {
    const out: CorpusEntryDTO[] = filterCorpus(buildEntries(), { tag: 'revisar' });
    expect(groupIds(out)).toEqual([
      '11111111-1111-4111-8111-111111111111',
      '33333333-3333-4333-8333-333333333333',
    ]);
  });

  it('só-fonte filtra por presença em origins', () => {
    const out: CorpusEntryDTO[] = filterCorpus(buildEntries(), { source: 'capes' });
    expect(groupIds(out)).toEqual([
      '22222222-2222-4222-8222-222222222222',
      '33333333-3333-4333-8333-333333333333',
    ]);
  });

  it('só-ano filtra por igualdade de year', () => {
    const out: CorpusEntryDTO[] = filterCorpus(buildEntries(), { year: 2021 });
    expect(groupIds(out)).toEqual(['22222222-2222-4222-8222-222222222222']);
  });
});

describe('filterCorpus combinação AND', () => {
  it('combinação tag+fonte+ano que não casa zera', () => {
    const out: CorpusEntryDTO[] = filterCorpus(buildEntries(), {
      tag: 'revisar',
      source: 'capes',
      year: 2021,
    });
    expect(out).toEqual([]);
  });

  it('year numérico nunca casa com entry de year null', () => {
    const entries: CorpusEntryDTO[] = [
      makeEntry({ groupId: 'aaaaaaaa-0000-4000-8000-000000000001', year: null }),
      makeEntry({ groupId: 'aaaaaaaa-0000-4000-8000-000000000002', year: 2023 }),
    ];
    const out: CorpusEntryDTO[] = filterCorpus(entries, { year: 2023 });
    expect(groupIds(out)).toEqual(['aaaaaaaa-0000-4000-8000-000000000002']);
  });
});
