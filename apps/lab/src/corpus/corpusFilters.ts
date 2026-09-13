// apps/lab — filtro puro do corpus (09-02 task 1, UI-24, D-17/D-25).
//
// `filterCorpus(entries, filter)` é pós-filtro client-side combinável por AND:
// - tag presente exige `entry.tags` conter a tag;
// - source presente exige `entry.origins` conter a fonte;
// - year presente exige `entry.year` igual ao ano (year null nunca casa).
// Filtro vazio `{}` devolve cópia na mesma ordem. Nunca decide elegibilidade
// (o corpus real vem do servidor como elegíveis); referência nunca entra no
// filtro (D-25). Tipos via `import type` de @uhhu/contracts; sem tipo proibido.

import type { CorpusEntryDTO } from '@uhhu/contracts';

export interface CorpusFilter {
  tag?: string;
  source?: 'bdtd' | 'capes';
  year?: number;
}

function matchesTag(entry: CorpusEntryDTO, tag: string | undefined): boolean {
  if (tag === undefined) {
    return true;
  }
  return entry.tags.includes(tag);
}

function matchesSource(entry: CorpusEntryDTO, source: 'bdtd' | 'capes' | undefined): boolean {
  if (source === undefined) {
    return true;
  }
  return entry.origins.includes(source);
}

function matchesYear(entry: CorpusEntryDTO, year: number | undefined): boolean {
  if (year === undefined) {
    return true;
  }
  if (entry.year === null) {
    return false;
  }
  return entry.year === year;
}

export function filterCorpus(entries: CorpusEntryDTO[], filter: CorpusFilter): CorpusEntryDTO[] {
  const out: CorpusEntryDTO[] = [];
  for (const entry of entries) {
    if (!matchesTag(entry, filter.tag)) {
      continue;
    }
    if (!matchesSource(entry, filter.source)) {
      continue;
    }
    if (!matchesYear(entry, filter.year)) {
      continue;
    }
    out.push(entry);
  }
  return out;
}
