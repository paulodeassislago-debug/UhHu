// apps/lab — join results↔groups + filtros client-side (08-02, D-16/D-17/UI-17/UI-21).
//
// Contrato puro para as telas 08-03/08-04 — SEM fetch aqui:
// - buildResultGroupIndex(groups): Map<resultId, grupo> por memberIds
// - mergeResultsWithGroups(results, index): TriagedItem[] (sem grupo → null)
// - applyResultFilters(items, filter): pós-filtro client-side combinável por AND
// - formatProvenance(result): origem + run curto + data
// - docTypeLabel(docType): mapa único tese/dissertação (SearchCard não exporta)
// - formatResultWhen(iso): hoje HH:MM senão DD/MM HH:MM, fallback ISO
//
// Regras D-17: decision usa group.decision (null→'undecided'); 'untriaged' =
// group null OU decidedAt null; tag usa group.tags; year usa result.year
// (year null nunca casa com filtro setado). Tipos via `import type` de
// @uhhu/contracts; sem `any`.

import type { DedupGroupDTO, DocType, ResultDTO } from '@uhhu/contracts';

export interface TriagedItem {
  result: ResultDTO;
  group: DedupGroupDTO | null;
}

export interface GroupFilter {
  decision: 'all' | 'eligible' | 'ineligible' | 'undecided' | 'untriaged';
  tag: string | null;
  source: 'all' | 'bdtd' | 'capes';
  year: number | null;
}

export const DEFAULT_GROUP_FILTER: GroupFilter = {
  decision: 'all',
  tag: null,
  source: 'all',
  year: null,
};

// Índice resultId→grupo: para cada grupo, para cada memberId → grupo.
// Colisão (mesmo memberId em 2 grupos) fica com o último — 1:1 por desenho.
export function buildResultGroupIndex(groups: DedupGroupDTO[]): Map<string, DedupGroupDTO> {
  const index = new Map<string, DedupGroupDTO>();
  for (const group of groups) {
    for (const memberId of group.memberIds) {
      index.set(memberId, group);
    }
  }
  return index;
}

// Junta results com o índice: sem grupo → group null (card single degradado
// com decisão desabilitada e texto "grupo indisponível" — nunca decidir por
// resultId, T-08-02-03).
export function mergeResultsWithGroups(
  results: ResultDTO[],
  index: Map<string, DedupGroupDTO>,
): TriagedItem[] {
  const out: TriagedItem[] = [];
  for (const result of results) {
    const group: DedupGroupDTO | null = index.get(result.id) ?? null;
    out.push({ result, group });
  }
  return out;
}

function matchesDecision(item: TriagedItem, decision: GroupFilter['decision']): boolean {
  if (decision === 'all') {
    return true;
  }
  if (decision === 'untriaged') {
    return item.group === null || item.group.decidedAt === null;
  }
  const current: string = item.group?.decision ?? 'undecided';
  return current === decision;
}

function matchesTag(item: TriagedItem, tag: string | null): boolean {
  if (tag === null) {
    return true;
  }
  if (item.group === null) {
    return false;
  }
  return item.group.tags.includes(tag);
}

function matchesSource(item: TriagedItem, source: GroupFilter['source']): boolean {
  if (source === 'all') {
    return true;
  }
  return item.result.source === source;
}

function matchesYear(item: TriagedItem, year: number | null): boolean {
  if (year === null) {
    return true;
  }
  if (item.result.year === null) {
    return false;
  }
  return item.result.year === year;
}

// Pós-filtro client-side (D-17, sem nova rota): tudo combinável por AND.
export function applyResultFilters(items: TriagedItem[], filter: GroupFilter): TriagedItem[] {
  const out: TriagedItem[] = [];
  for (const item of items) {
    if (!matchesDecision(item, filter.decision)) {
      continue;
    }
    if (!matchesTag(item, filter.tag)) {
      continue;
    }
    if (!matchesSource(item, filter.source)) {
      continue;
    }
    if (!matchesYear(item, filter.year)) {
      continue;
    }
    out.push(item);
  }
  return out;
}

// Mapa único de tipo documental (molde SearchCard.summarizeFilters, que não é
// exportado — este é o ponto único; ResultCard importa daqui, sem duplicar).
// Decisão Paulo 12/09/2026 (08-09): MP tem rótulo próprio, nunca 'dissertação'.
export function docTypeLabel(docType: DocType | null): string | null {
  if (docType === null) {
    return null;
  }
  if (docType === 'doctoralThesis') {
    return 'tese';
  }
  if (docType === 'professionalMaster') {
    return 'mestrado profissional';
  }
  return 'dissertação';
}

// Data/hora do resultado: hoje HH:MM senão DD/MM HH:MM; vazia/inválida → ISO
// verbatim (query hostil nunca quebra a lista).
export function formatResultWhen(iso: string): string {
  if (iso.length === 0) {
    return iso;
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
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

// Linha de proveniência: origem + run curto + data (busca→run→data→fonte,
// UI-17; data no estilo formatResultWhen).
export function formatProvenance(result: ResultDTO): string {
  const origin: string = result.source === 'bdtd' ? 'BDTD' : 'CAPES';
  const runShort: string = result.runId.slice(0, 8);
  return `origem: ${origin} · run ${runShort} · ${formatResultWhen(result.retrievedAt)}`;
}
