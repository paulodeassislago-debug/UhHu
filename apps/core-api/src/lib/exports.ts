// apps/core-api — serializadores puros de exportacao (LAB-11, D-50..D-53).
//
// Sem db/actor/HTTP/fetch: apenas tipos de @uhhu/contracts. A rota resolve
// escopo + autorizacao + headers; esta lib so formata strings (unit-testavel
// sem PG). Guards: CSV anti formula-injection (Pitfall 1), BibTeX escapes +
// brace-protection de siglas (Pitfall 7), filename ASCII puro (Pitfall 2).

import type { CorpusEntryDTO } from '@uhhu/contracts';

const BIBTEX_ESCAPES: Record<string, string> = {
  '&': '\\&',
  '%': '\\%',
  '#': '\\#',
  _: '\\_',
  $: '\\$',
  '~': '\\textasciitilde{}',
  '^': '\\textasciicircum{}',
  '{': '\\{',
  '}': '\\}',
};

export function escapeBibtex(raw: string): string {
  return [...raw.normalize('NFC')].map((ch) => BIBTEX_ESCAPES[ch] ?? ch).join('');
}

export function protectBibtexTitle(title: string): string {
  return title
    .split(' ')
    .map((tok) => {
      const alnum = tok.replace(/[^A-Za-zÀ-Þà-þ0-9-]/g, '');
      return /^[A-ZÀ-Þ0-9-]{2,}$/.test(alnum) ? `{${tok}}` : tok;
    })
    .join(' ');
}

export function csvCell(value: string): string {
  const guarded = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}

function stripDiacritics(value: string): string {
  let out = '';
  for (const ch of value.normalize('NFKD')) {
    const code = ch.codePointAt(0) ?? 0;
    if (code < 0x0300 || code > 0x036f) {
      out += ch;
    }
  }
  return out;
}

export function slugifyAscii(raw: string): string {
  return (
    stripDiacritics(raw)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'projeto'
  );
}

export function exportFilename(
  projectTitle: string,
  dateYYYYMMDD: string,
  ext: 'csv' | 'bib' | 'json',
): string {
  return `corpus-${slugifyAscii(projectTitle)}-${dateYYYYMMDD}.${ext}`;
}

export function bibtexKey(
  firstAuthorLastName: string,
  year: number | null,
  source: string,
  order: number,
): string {
  const base = `${slugifyAscii(firstAuthorLastName).replace(/-/g, '')}${year === null ? 'sano' : String(year)}${source}`;
  if (order === 0) {
    return base;
  }
  const suffix = String.fromCharCode(96 + order);
  return `${base}-${suffix}`;
}

const CSV_HEADER =
  'groupId,canonicalKey,title,authors,year,docType,institution,decision,tags,originCount,origins';

export function toCSV(entries: CorpusEntryDTO[]): string {
  const lines = entries.map((e) =>
    [
      e.groupId,
      e.canonicalKey,
      e.title,
      e.authors.join(';'),
      e.year === null ? '' : String(e.year),
      e.docType ?? '',
      e.institution ?? '',
      e.decision,
      e.tags.join(';'),
      String(e.originCount),
      e.origins.join('|'),
    ]
      .map(csvCell)
      .join(','),
  );
  return [CSV_HEADER, ...lines].join('\n');
}

function firstAuthorLastName(authors: string[]): string {
  const first = authors[0] ?? '';
  const parts = first.trim().split(/\s+/);
  return parts[parts.length - 1] ?? 'anonimo';
}

export function toBibTeX(entries: CorpusEntryDTO[]): string {
  return entries
    .map((e, order) => {
      const entryType = e.docType === 'doctoralThesis' ? '@phdthesis' : '@mastersthesis';
      const lastName = firstAuthorLastName(e.authors);
      const primarySource = e.origins[0] ?? 'bdtd';
      const key = bibtexKey(lastName, e.year, primarySource, order);
      const url = e.originUrl ?? e.sourceUrl;
      const fields = [
        `  title={${escapeBibtex(protectBibtexTitle(e.title))}}`,
        `  author={${e.authors.map((a) => escapeBibtex(a)).join(' and ')}}`,
        ...(e.year !== null ? [`  year={${String(e.year)}}`] : []),
        ...(e.institution !== null ? [`  school={${escapeBibtex(e.institution)}}`] : []),
        `  note={decision:${e.decision}}`,
        ...(url !== null ? [`  url={${escapeBibtex(url)}}`] : []),
      ];
      return `${entryType}{${key},\n${fields.join(',\n')}\n}`;
    })
    .join('\n\n');
}

export function toJSON(projectId: string, entries: CorpusEntryDTO[], provenance: unknown): string {
  return JSON.stringify(
    { projectId, exportedAt: new Date().toISOString(), groups: entries, provenance },
    null,
    2,
  );
}

// Alias de compatibilidade com o plano (04-01): o contrato de export JSON.
export const toExportJSON = toJSON;
