// apps/lab — testes do join results↔groups + filtros (08-02 task 1, puros).
//
// Cobre: join por memberIds (2 grupos + órfão→null), filtro por cada dimensão
// isolada e combinada, untriaged distingue decidedAt null de undecided
// explícito, year setado exclui year null, formatProvenance contém BDTD/CAPES
// + run curto. Sem rede/timers/`any`.

import { describe, expect, it } from 'vitest';
import type { DedupGroupDTO, ResultDTO } from '@uhhu/contracts';
import {
  applyResultFilters,
  buildResultGroupIndex,
  formatProvenance,
  mergeResultsWithGroups,
} from '../triage';
import type { GroupFilter, TriagedItem } from '../triage';

const PROJECT_ID = '33333333-3333-4333-8333-333333333333';
const RUN_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

function makeResult(overrides?: Partial<ResultDTO> & { id: string }): ResultDTO {
  return {
    id: overrides?.id ?? '00000000-0000-4000-8000-000000000000',
    runId: overrides?.runId ?? RUN_ID,
    source: overrides?.source ?? 'bdtd',
    sourceId: overrides?.sourceId ?? 'src-1',
    title: overrides?.title ?? 'Título',
    authors: overrides?.authors ?? ['Autora'],
    year: overrides?.year !== undefined ? overrides.year : 2023,
    isNew: overrides?.isNew ?? false,
    docType: overrides?.docType !== undefined ? overrides.docType : 'doctoralThesis',
    institution: overrides?.institution !== undefined ? overrides.institution : null,
    program: overrides?.program !== undefined ? overrides.program : null,
    abstract: overrides?.abstract !== undefined ? overrides.abstract : null,
    originUrl: overrides?.originUrl !== undefined ? overrides.originUrl : null,
    sourceUrl: overrides?.sourceUrl !== undefined ? overrides.sourceUrl : null,
    rawMetadata: overrides?.rawMetadata ?? {},
    retrievedAt: overrides?.retrievedAt ?? '2026-09-10T10:00:00Z',
  };
}

function makeGroup(overrides?: Partial<DedupGroupDTO> & { id: string }): DedupGroupDTO {
  return {
    id: overrides?.id ?? '11111111-1111-4111-8111-111111111111',
    projectId: overrides?.projectId ?? PROJECT_ID,
    canonicalKey: overrides?.canonicalKey ?? 'key-1',
    confidence: overrides?.confidence ?? 'exact',
    status: overrides?.status ?? 'confirmed',
    canonicalResultId: overrides?.canonicalResultId ?? 'r1',
    memberIds: overrides?.memberIds ?? [],
    decision: overrides?.decision ?? 'undecided',
    originCount: overrides?.originCount ?? 1,
    origins: overrides?.origins ?? ['bdtd'],
    tags: overrides?.tags ?? [],
    divergences: overrides?.divergences ?? [],
    decidedAt: overrides?.decidedAt !== undefined ? overrides.decidedAt : null,
  };
}

const ALL: GroupFilter = { decision: 'all', tag: null, source: 'all', year: null };

function buildScenario(): TriagedItem[] {
  const groupA: DedupGroupDTO = makeGroup({
    id: '11111111-1111-4111-8111-111111111111',
    canonicalKey: 'key-a',
    canonicalResultId: 'r-a1',
    memberIds: ['r-a1', 'r-a2'],
    decision: 'eligible',
    originCount: 2,
    origins: ['bdtd', 'capes'],
    tags: ['revisar'],
    decidedAt: '2026-09-11T10:00:00Z',
  });
  const groupB: DedupGroupDTO = makeGroup({
    id: '22222222-2222-4222-8222-222222222222',
    canonicalKey: 'key-b',
    canonicalResultId: 'r-b1',
    memberIds: ['r-b1'],
    decision: 'undecided',
    originCount: 1,
    origins: ['capes'],
    tags: [],
    decidedAt: null,
  });
  const results: ResultDTO[] = [
    makeResult({ id: 'r-a1', source: 'bdtd', year: 2023, title: 'A1' }),
    makeResult({ id: 'r-a2', source: 'capes', year: 2021, title: 'A2' }),
    makeResult({ id: 'r-b1', source: 'capes', year: 2023, title: 'B1' }),
    makeResult({ id: 'r-orphan', source: 'bdtd', year: 2020, title: 'Órfão' }),
  ];
  const index = buildResultGroupIndex([groupA, groupB]);
  return mergeResultsWithGroups(results, index);
}

describe('join results↔groups por memberIds', () => {
  it('2 grupos resolvem + órfão vira group null', () => {
    const items: TriagedItem[] = buildScenario();
    expect(items).toHaveLength(4);
    const byId = new Map<string, TriagedItem>();
    for (const item of items) {
      byId.set(item.result.id, item);
    }
    expect(byId.get('r-a1')?.group?.id).toBe('11111111-1111-4111-8111-111111111111');
    expect(byId.get('r-a2')?.group?.id).toBe('11111111-1111-4111-8111-111111111111');
    expect(byId.get('r-b1')?.group?.id).toBe('22222222-2222-4222-8222-222222222222');
    expect(byId.get('r-orphan')?.group).toBeNull();
  });
});

describe('applyResultFilters por dimensão isolada', () => {
  it('decision eligible filtra só o grupo A', () => {
    const items: TriagedItem[] = buildScenario();
    const out: TriagedItem[] = applyResultFilters(items, { ...ALL, decision: 'eligible' });
    const ids: string[] = [];
    for (const item of out) {
      ids.push(item.result.id);
    }
    expect(ids.sort()).toEqual(['r-a1', 'r-a2']);
  });

  it('tag revisa filtra só o grupo A', () => {
    const items: TriagedItem[] = buildScenario();
    const out: TriagedItem[] = applyResultFilters(items, { ...ALL, tag: 'revisar' });
    const ids: string[] = [];
    for (const item of out) {
      ids.push(item.result.id);
    }
    expect(ids.sort()).toEqual(['r-a1', 'r-a2']);
  });

  it('source capes filtra só itens CAPES', () => {
    const items: TriagedItem[] = buildScenario();
    const out: TriagedItem[] = applyResultFilters(items, { ...ALL, source: 'capes' });
    const ids: string[] = [];
    for (const item of out) {
      ids.push(item.result.id);
    }
    expect(ids.sort()).toEqual(['r-a2', 'r-b1']);
  });

  it('year 2023 filtra só itens de 2023', () => {
    const items: TriagedItem[] = buildScenario();
    const out: TriagedItem[] = applyResultFilters(items, { ...ALL, year: 2023 });
    const ids: string[] = [];
    for (const item of out) {
      ids.push(item.result.id);
    }
    expect(ids.sort()).toEqual(['r-a1', 'r-b1']);
  });
});

describe('applyResultFilters combinada (AND)', () => {
  it('decision+tag+source+year combinam', () => {
    const items: TriagedItem[] = buildScenario();
    const out: TriagedItem[] = applyResultFilters(items, {
      decision: 'eligible',
      tag: 'revisar',
      source: 'bdtd',
      year: 2023,
    });
    const ids: string[] = [];
    for (const item of out) {
      ids.push(item.result.id);
    }
    expect(ids).toEqual(['r-a1']);
  });
});

describe('untriaged distingue decidedAt null de undecided explícito', () => {
  it('untriaged pega órfão + grupo nunca decidido, mas não o indeciso explícito', () => {
    const decided: DedupGroupDTO = makeGroup({
      id: '33333333-3333-4333-8333-333333333333',
      canonicalKey: 'key-c',
      canonicalResultId: 'r-c1',
      memberIds: ['r-c1'],
      decision: 'undecided',
      decidedAt: '2026-09-11T12:00:00Z',
    });
    const undecided: DedupGroupDTO = makeGroup({
      id: '44444444-4444-4444-8444-444444444444',
      canonicalKey: 'key-d',
      canonicalResultId: 'r-d1',
      memberIds: ['r-d1'],
      decision: 'undecided',
      decidedAt: null,
    });
    const results: ResultDTO[] = [
      makeResult({ id: 'r-c1', title: 'C1' }),
      makeResult({ id: 'r-d1', title: 'D1' }),
      makeResult({ id: 'r-orphan', title: 'Órfão' }),
    ];
    const index = buildResultGroupIndex([decided, undecided]);
    const items: TriagedItem[] = mergeResultsWithGroups(results, index);
    const untriaged: TriagedItem[] = applyResultFilters(items, { ...ALL, decision: 'untriaged' });
    const untriagedIds: string[] = [];
    for (const item of untriaged) {
      untriagedIds.push(item.result.id);
    }
    expect(untriagedIds.sort()).toEqual(['r-d1', 'r-orphan']);
    const undecidedOnly: TriagedItem[] = applyResultFilters(items, {
      ...ALL,
      decision: 'undecided',
    });
    const undecidedIds: string[] = [];
    for (const item of undecidedOnly) {
      undecidedIds.push(item.result.id);
    }
    // group null conta como 'undecided' no filtro de decisão (null→undecided)
    expect(undecidedIds.sort()).toEqual(['r-c1', 'r-d1', 'r-orphan']);
  });
});

describe('year setado exclui year null', () => {
  it('resultado sem ano nunca casa com filtro de ano', () => {
    const items: TriagedItem[] = [
      { result: makeResult({ id: 'r-noyear', year: null }), group: null },
      { result: makeResult({ id: 'r-2023', year: 2023 }), group: null },
    ];
    const out: TriagedItem[] = applyResultFilters(items, { ...ALL, year: 2023 });
    const ids: string[] = [];
    for (const item of out) {
      ids.push(item.result.id);
    }
    expect(ids).toEqual(['r-2023']);
  });
});

describe('formatProvenance', () => {
  it('contém BDTD + run curto', () => {
    const line: string = formatProvenance(
      makeResult({ id: 'r-x', source: 'bdtd', runId: `${RUN_ID}` }),
    );
    expect(line).toContain('BDTD');
    expect(line).toContain(RUN_ID.slice(0, 8));
  });

  it('contém CAPES + run curto', () => {
    const line: string = formatProvenance(
      makeResult({ id: 'r-y', source: 'capes', runId: `${RUN_ID}` }),
    );
    expect(line).toContain('CAPES');
    expect(line).toContain(RUN_ID.slice(0, 8));
  });
});
