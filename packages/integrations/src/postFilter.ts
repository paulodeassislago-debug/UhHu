// packages/integrations — pós-filtro local do Core (fronteira integrations).
//
// Redundância fonte+Core desejada (D-32): cada fonte honra o que sua API
// permite; este filtro aplica TODOS os filtros da SearchDef sobre CADA item,
// mesmo que a fonte já tenha filtrado (idempotente por construção). Garante o
// contrato declarado ao usuário independente da fonte.
//
// Puro e síncrono: sem I/O, sem rede, sem relógio. `year` ausente (null) NUNCA
// descarta o item (falta de dado não é mismatch). `source` não filtra aqui —
// a separação por fonte já ocorre no nível do adapter.

import type { NormalizedItem, SearchDef } from './types.js';

/** Resultado do pós-filtro: itens mantidos + contagem de descartados. */
export interface PostFilterResult {
  kept: NormalizedItem[];
  dropped: number;
}

/** Lowercase + sem diacríticos para substring insensível a acento/caixa. */
function norm(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/** docType do item ou do filtro → canônico; desconhecido → null. */
function canonicalDocType(value: string | null): string | null {
  if (value === null) {
    return null;
  }
  const normalized = norm(value);
  if (
    normalized === 'masterthesis' ||
    normalized === 'mestrado' ||
    normalized === 'dissertacao' ||
    normalized === 'dissertation' ||
    normalized === 'master'
  ) {
    return 'masterThesis';
  }
  if (
    normalized === 'doctoralthesis' ||
    normalized === 'doutorado' ||
    normalized === 'tese' ||
    normalized === 'doutor' ||
    normalized === 'phdthesis' ||
    normalized === 'phd' ||
    normalized === 'doctoral' ||
    normalized === 'doctorate'
  ) {
    return 'doctoralThesis';
  }
  return null;
}

/** Substring case/diacritic-insensitive; filtro vazio = sem restrição. */
function matchesText(field: string | null, filter: string | undefined): boolean {
  if (filter === undefined) {
    return true;
  }
  const needle = norm(filter);
  if (needle.length === 0) {
    return true;
  }
  if (field === null) {
    return false;
  }
  return norm(field).includes(needle);
}

function keepItem(item: NormalizedItem, def: SearchDef): boolean {
  if (def.yearFrom !== undefined && item.year !== null && item.year < def.yearFrom) {
    return false;
  }
  if (def.yearTo !== undefined && item.year !== null && item.year > def.yearTo) {
    return false;
  }
  if (def.docTypes !== undefined && def.docTypes.length > 0) {
    const allowed = new Set<string>();
    for (const raw of def.docTypes) {
      const mapped = canonicalDocType(raw);
      if (mapped !== null) {
        allowed.add(mapped);
      }
    }
    const itemType = canonicalDocType(item.docType);
    if (itemType === null || !allowed.has(itemType)) {
      return false;
    }
  }
  if (!matchesText(item.institution, def.institution)) {
    return false;
  }
  if (!matchesText(item.program, def.program)) {
    return false;
  }
  if (def.area !== undefined && norm(def.area).length > 0) {
    const needle = norm(def.area);
    const haystacks = [item.institution, item.program];
    const hit = haystacks.some((field) => field !== null && norm(field).includes(needle));
    if (!hit) {
      return false;
    }
  }
  return true;
}

/**
 * Aplica todos os filtros de `def` sobre `items` (redundância D-32).
 * Nunca lança para item malformado: item sem os campos esperados só falha nos
 * predicados que exigem o campo (ano null é mantido).
 */
export function postFilter(items: NormalizedItem[], def: SearchDef): PostFilterResult {
  const kept: NormalizedItem[] = [];
  let dropped = 0;
  for (const item of items) {
    if (keepItem(item, def)) {
      kept.push(item);
    } else {
      dropped += 1;
    }
  }
  return { kept, dropped };
}

function describeYear(def: SearchDef): string | null {
  if (def.yearFrom !== undefined && def.yearTo !== undefined) {
    return `ano ${String(def.yearFrom)}–${String(def.yearTo)}`;
  }
  if (def.yearFrom !== undefined) {
    return `ano a partir de ${String(def.yearFrom)}`;
  }
  if (def.yearTo !== undefined) {
    return `ano até ${String(def.yearTo)}`;
  }
  return null;
}

function describeDocTypes(docTypes: string[] | undefined): string | null {
  if (docTypes === undefined || docTypes.length === 0) {
    return null;
  }
  const labels: string[] = [];
  for (const raw of docTypes) {
    const mapped = canonicalDocType(raw);
    const label =
      mapped === 'masterThesis' ? 'Mestrado' : mapped === 'doctoralThesis' ? 'Doutorado' : null;
    if (label !== null && !labels.includes(label)) {
      labels.push(label);
    }
  }
  if (labels.length === 0) {
    return null;
  }
  return `tipo ${labels.join('/')}`;
}

function shortValue(value: string, max = 60): string {
  const trimmed = value.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
}

/** Descrição PT-BR do pós-filtro aplicado (métricas/logs do run). */
export function describePostFilter(def: SearchDef): string {
  const parts: string[] = [];
  const year = describeYear(def);
  if (year !== null) {
    parts.push(year);
  }
  const docTypes = describeDocTypes(def.docTypes);
  if (docTypes !== null) {
    parts.push(docTypes);
  }
  if (def.area !== undefined && def.area.trim().length > 0) {
    parts.push(`área ${shortValue(def.area)}`);
  }
  if (def.institution !== undefined && def.institution.trim().length > 0) {
    parts.push(`instituição ${shortValue(def.institution)}`);
  }
  if (def.program !== undefined && def.program.trim().length > 0) {
    parts.push(`programa ${shortValue(def.program)}`);
  }
  if (parts.length === 0) {
    return 'pós-filtro: sem filtros';
  }
  return `pós-filtro: ${parts.join(', ')}`;
}
