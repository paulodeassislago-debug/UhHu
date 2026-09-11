// apps/core-api — funcoes puras de dedup bibliografico (LAB-07, D-40..D-45).
//
// Sem db/actor/HTTP/fetch: apenas node:crypto + fastest-levenshtein + tipos.
// Identidade por conteudo (projectId, canonicalKey), NUNCA resultId — re-runs
// criam novos UUIDs de resultado, a chave SHA-256 e estavel entre runs.
// Fuzzy exige mesmo ano non-null (blocking, Pitfall 3); threshold 0.9 sobre
// titulos NORMALIZADOS (NFKD, sem acentos/pontuacao).
//
// Decisão explícita ano-null (checkpoint 04-05/2): a VuFind/BDTD NÃO retorna
// ano no search (só via ficha Record/enrich sob demanda). Enrich leve em
// paralelo ao materializar o run foi REJEITADO: violaria 03-lab-spec-v1 §6
// (nunca 1 request por resultado na busca; batch só para elegíveis) e a
// cortesia batch ≤10 + wait. Tratamento adotado: aceitar year=null, bloquear
// fuzzy com ano null (sem falso-positivo cross-fonte), manter exact por
// título+autores (transparente + divergência manual se errar) e sinalizar
// 'desconhecido' no compare/yearHistogram. Ano BDTD só via enrich on-demand
// futuro — nunca no run.

import { createHash } from 'node:crypto';
import { distance } from 'fastest-levenshtein';

const DIACRITIC_START = 0x0300;
const DIACRITIC_END = 0x036f;

function stripDiacritics(value: string): string {
  let out = '';
  for (const ch of value.normalize('NFKD')) {
    const code = ch.codePointAt(0) ?? 0;
    if (code < DIACRITIC_START || code > DIACRITIC_END) {
      out += ch;
    }
  }
  return out;
}

/** Threshold D-40: similaridade normalizada >= 0.9 sobre titulos NORMALIZADOS, mesmo ano. */
export const FUZZY_THRESHOLD = 0.9;

export function normalizeTitle(raw: string): string {
  return stripDiacritics(raw)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeAuthor(raw: string): string {
  return stripDiacritics(raw)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function canonicalKey(title: string, year: number | null, authors: string[]): string {
  const parts = [
    normalizeTitle(title),
    year === null ? '' : String(year),
    ...authors.map(normalizeAuthor).filter(Boolean).sort(),
  ];
  return createHash('sha256').update(parts.join('|'), 'utf8').digest('hex');
}

export function titleSimilarity(a: string, b: string): number {
  const na = normalizeTitle(a);
  const nb = normalizeTitle(b);
  if (na === nb) {
    return 1;
  }
  const maxLen = Math.max(na.length, nb.length);
  if (maxLen === 0) {
    return 0;
  }
  return 1 - distance(na, nb) / maxLen;
}

export interface CompletenessInput {
  abstract: string | null;
  authors: string[];
  year: number | null;
  originUrl: string | null;
  sourceUrl: string | null;
}

// D-44: 1 ponto por campo preenchido. Desempate deterministico (documentado):
// score DESC, source ASC ('bdtd'<'capes'), sourceId ASC.
export function completenessScore(r: CompletenessInput): number {
  return (
    (r.abstract ? 1 : 0) +
    (r.authors.length > 0 ? 1 : 0) +
    (r.year !== null ? 1 : 0) +
    (r.originUrl || r.sourceUrl ? 1 : 0)
  );
}
