// packages/integrations — adapter BDTD (VuFind JSON) + higiene de rawMetadata.
//
// Fronteira: esta é a única via de saída para bdtd.ibict.br; nenhuma UI ou rota
// acessa a fonte diretamente. Transporte (jar, mutex, timeout, UA, allowlist,
// detecção de challenge) vive no SourceClient; aqui só tradução
// SearchDef→VuFind e VuFind→NormalizedItem (D-31: string livre pass-through).
//
// Enrich sob demanda: `enrichBdtd` existe e é testada, mas NÃO é chamada durante
// o run — enrich em batch só para elegíveis é Phase 4 (03-lab-spec-v1 §6).

import { z } from 'zod';
import type { SourceClient, SourceFetchInit } from './sourceClient.js';
import type { NormalizedItem, SearchDef, SourceClientContext, SourcePage } from './types.js';

/** Versão do adapter (vai para `adapter_versions` do run — D-34/proveniência). */
export const ADAPTER_VERSION = 'bdtd/1.0-fase3';

const BDTD_SEARCH_URL = 'https://bdtd.ibict.br/vufind/api/v1/search';
const BDTD_RECORD_URL = 'https://bdtd.ibict.br/vufind/Record';

/** Chaves que nunca persistem em rawMetadata (T-03-03-02). */
const SECRET_KEY_PATTERN = /cookie|set-cookie|authorization|token|session/i;
const YEAR_PATTERN = /(\d{4})/;
const HTTP_URL_PATTERN = /^https?:\/\//i;
const ABSTRACT_MAX_LENGTH = 8000;
const TITLE_MAX_LENGTH = 500;
const AUTHORS_MAX_COUNT = 50;
const PER_PAGE_MIN = 5;
const PER_PAGE_MAX = 50;
const PER_PAGE_DEFAULT = 20;

/** Paginação da busca (perPage com clamp 5..50, default 20). */
export interface SourcePagination {
  page: number;
  perPage: number;
}

// ---------------------------------------------------------------------------
// Higiene de rawMetadata (T-03-03-02; definição única — capes.ts importa daqui).
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sanitizeValue(value: unknown, depth: number): unknown {
  if (depth > 10) {
    return null;
  }
  if (Array.isArray(value)) {
    const arr: unknown[] = value;
    return arr.map((item) => sanitizeValue(item, depth + 1));
  }
  if (isRecord(value)) {
    return sanitizeRaw(value, depth + 1);
  }
  return value;
}

/**
 * Remove de `input` (recursivo, com teto de profundidade) qualquer chave de
 * segredo/sessão antes de persistir em NormalizedItem. Nunca lança.
 */
export function sanitizeRaw(input: Record<string, unknown>, depth = 0): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  if (depth > 10) {
    return output;
  }
  for (const key of Object.keys(input)) {
    if (SECRET_KEY_PATTERN.test(key)) {
      continue;
    }
    const value: unknown = input[key];
    output[key] = sanitizeValue(value, depth);
  }
  return output;
}

// ---------------------------------------------------------------------------
// Estreitamento defensivo de JSON externo (T-03-03-01: ausente → null, nunca
// throw em campo opcional). Envelope validado com Zod safeParse; campos via
// narrowing sobre `unknown`.
// ---------------------------------------------------------------------------

const bdtdEnvelopeSchema = z.object({
  resultCount: z.unknown().optional(),
  records: z.array(z.record(z.string(), z.unknown())),
});

function normalizeTerm(term: string): string {
  return term.trim();
}

/** Monta o init do SourceClient sem expor `undefined` explícito (exactOptional). */
function fetchInit(
  ctx: SourceClientContext,
  method: 'GET' | 'POST',
  headers: Record<string, string>,
  accept: 'json' | 'text',
  body?: string,
): SourceFetchInit {
  const init: SourceFetchInit = { signal: ctx.signal, method, headers, accept };
  if (ctx.fetchFn !== undefined) {
    init.fetchFn = ctx.fetchFn;
  }
  if (body !== undefined) {
    init.body = body;
  }
  return init;
}

export function clampPerPage(value: number): number {
  if (!Number.isFinite(value)) {
    return PER_PAGE_DEFAULT;
  }
  const floored = Math.floor(value);
  if (floored < PER_PAGE_MIN) {
    return PER_PAGE_MIN;
  }
  if (floored > PER_PAGE_MAX) {
    return PER_PAGE_MAX;
  }
  return floored;
}

export function clampPage(value: number): number {
  if (!Number.isFinite(value)) {
    return 1;
  }
  return Math.max(1, Math.floor(value));
}

/** Lowercase + sem diacríticos para comparações insensíveis a acento/caixa. */
function norm(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/** Primeira string não-vazia entre as chaves (aceita número e array). */
function firstString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value: unknown = record[key];
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed.length > 0) {
        return trimmed;
      }
    } else if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    } else if (Array.isArray(value)) {
      const arr: unknown[] = value;
      for (const item of arr) {
        if (typeof item === 'string' && item.trim().length > 0) {
          return item.trim();
        }
        if (typeof item === 'number' && Number.isFinite(item)) {
          return String(item);
        }
      }
    }
  }
  return null;
}

/** Ano (4 dígitos, 1000..2100) a partir de número/string/array; senão null. */
function yearFromValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 1000 && value <= 2100) {
    return value;
  }
  if (typeof value === 'string') {
    const match = YEAR_PATTERN.exec(value);
    if (match !== null) {
      const raw = match[1];
      if (raw !== undefined) {
        const year = Number.parseInt(raw, 10);
        if (year >= 1000 && year <= 2100) {
          return year;
        }
      }
    }
    return null;
  }
  if (Array.isArray(value)) {
    const arr: unknown[] = value;
    for (const item of arr) {
      const year = yearFromValue(item);
      if (year !== null) {
        return year;
      }
    }
  }
  return null;
}

/** docType canônico a partir de rótulos VuFind/PT-BR; desconhecido → null. */
function canonicalDocType(value: unknown): string | null {
  const raw = Array.isArray(value) ? (value as unknown[])[0] : value;
  if (typeof raw !== 'string') {
    return null;
  }
  const normalized = norm(raw);
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
    normalized === 'phdthesis' ||
    normalized === 'phd' ||
    normalized === 'doctoral' ||
    normalized === 'doctorate'
  ) {
    return 'doctoralThesis';
  }
  return null;
}

/** docTypes do SearchDef normalizados e deduplicados. */
function canonicalDocTypes(docTypes: string[] | undefined): string[] {
  if (docTypes === undefined) {
    return [];
  }
  const out: string[] = [];
  for (const raw of docTypes) {
    const mapped = canonicalDocType(raw);
    if (mapped !== null && !out.includes(mapped)) {
      out.push(mapped);
    }
  }
  return out;
}

/** Autores a partir de string ("a; b"), array ou {primary, secondary}. */
function authorsFrom(value: unknown): string[] {
  const out: string[] = [];
  const pushName = (name: string): void => {
    const trimmed = name.trim();
    if (trimmed.length > 0 && out.length < AUTHORS_MAX_COUNT) {
      out.push(trimmed);
    }
  };
  if (typeof value === 'string') {
    for (const part of value.split(';')) {
      pushName(part);
    }
    return out;
  }
  if (Array.isArray(value)) {
    const arr: unknown[] = value;
    for (const item of arr) {
      if (typeof item === 'string') {
        for (const part of item.split(';')) {
          pushName(part);
        }
      } else if (isRecord(item)) {
        for (const nested of authorsFrom(item)) {
          pushName(nested);
        }
      }
      if (out.length >= AUTHORS_MAX_COUNT) {
        break;
      }
    }
    return out;
  }
  if (isRecord(value)) {
    for (const key of ['primary', 'secondary', 'authors', 'author']) {
      for (const nested of authorsFrom(value[key])) {
        pushName(nested);
      }
    }
  }
  return out;
}

/** URL http(s) ou null (esquemas exóticos nunca viram originUrl). */
function httpString(record: Record<string, unknown>, keys: string[]): string | null {
  const value = firstString(record, keys);
  if (value !== null && HTTP_URL_PATTERN.test(value)) {
    return value;
  }
  return null;
}

function truncate(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}

// ---------------------------------------------------------------------------
// Tradução SearchDef → VuFind (D-31: termo em string livre, sem tradução lossy).
// ---------------------------------------------------------------------------

export function buildBdtdSearchUrl(def: SearchDef, page: number, perPage: number): string {
  const url = new URL(BDTD_SEARCH_URL);
  url.searchParams.set('lookfor', normalizeTerm(def.term));
  url.searchParams.set('type', 'AllFields');
  const formats = canonicalDocTypes(def.docTypes);
  if (formats.length === 1) {
    const only = formats[0];
    if (only !== undefined) {
      url.searchParams.append('filter[]', `format:"${only}"`);
    }
  }
  // 2 formatos = AND impossível no VuFind (zeraria tudo): sem filtro de formato
  // na fonte; o pós-filtro do Core garante o contrato (D-32).
  if (def.yearFrom !== undefined || def.yearTo !== undefined) {
    const from = def.yearFrom !== undefined ? String(def.yearFrom) : '*';
    const to = def.yearTo !== undefined ? String(def.yearTo) : '*';
    url.searchParams.append('filter[]', `publishDate:[${from} TO ${to}]`);
  }
  url.searchParams.set('page', String(page));
  url.searchParams.set('limit', String(perPage));
  return url.toString();
}

function mapBdtdRecord(record: Record<string, unknown>): NormalizedItem | null {
  const id = firstString(record, ['id']);
  const title = firstString(record, ['title']);
  if (id === null || title === null) {
    return null;
  }
  const explicitLink = httpString(record, ['link', 'url']);
  return {
    sourceId: id,
    title: truncate(title, TITLE_MAX_LENGTH),
    authors: authorsFrom(record['authors'] ?? record['author']),
    year: yearFromValue(record['publishDate'] ?? record['year']),
    docType: canonicalDocType(record['format'] ?? record['docType']),
    institution: firstString(record, ['institution', 'publisher', 'university']),
    program: firstString(record, ['program', 'department', 'course']),
    abstract: (() => {
      const raw = firstString(record, ['abstract', 'summary', 'description']);
      return raw === null ? null : truncate(raw, ABSTRACT_MAX_LENGTH);
    })(),
    originUrl: explicitLink ?? `${BDTD_RECORD_URL}/${encodeURIComponent(id)}`,
    // Busca não afirma PDF: texto completo via enrich (Phase 4).
    sourceUrl: null,
    rawMetadata: sanitizeRaw(record),
  };
}

/**
 * Busca na BDTD via VuFind JSON. Nunca lança por problema de transporte ou de
 * parse: devolve `failed` (executor marca partial — D-37). Challenge mapeado
 * para `challenge` (executor renova o jar e retenta 1× — D-38).
 */
export async function searchBdtd(
  client: SourceClient,
  def: SearchDef,
  pagination: SourcePagination,
  ctx: SourceClientContext,
): Promise<SourcePage> {
  const failed: SourcePage = { total: null, items: [], sourceStatus: 'failed' };
  if (normalizeTerm(def.term).length === 0) {
    throw new Error('Adapter BDTD: termo de busca vazio.');
  }
  const url = buildBdtdSearchUrl(def, clampPage(pagination.page), clampPerPage(pagination.perPage));
  let status = 0;
  let body = '';
  try {
    const res = await client.fetchText(
      url,
      fetchInit(ctx, 'GET', { Accept: 'application/json' }, 'json'),
    );
    if (res.challenged) {
      return { total: null, items: [], sourceStatus: 'challenge' };
    }
    status = res.status;
    body = res.body;
  } catch {
    return failed;
  }
  if (status >= 400) {
    return failed;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(body) as unknown;
  } catch {
    return failed;
  }
  const envelope = bdtdEnvelopeSchema.safeParse(parsed);
  if (!envelope.success) {
    return failed;
  }
  const rawTotal: unknown = envelope.data.resultCount;
  const total =
    typeof rawTotal === 'number' && Number.isInteger(rawTotal) && rawTotal >= 0 ? rawTotal : null;
  const items: NormalizedItem[] = [];
  for (const record of envelope.data.records) {
    const item = mapBdtdRecord(record);
    if (item !== null) {
      items.push(item);
    }
  }
  return { total, items, sourceStatus: 'ok' };
}

// ---------------------------------------------------------------------------
// Enrich sob demanda (Phase 4): ficha HTML `vufind/Record/<id>`.
// Regexes ancoradas em marcadores estáveis, sem dependência nova; falha de
// parse → item parcial com rawMetadata {recordUrl} (nunca lança em opcional).
// Erro de transporte (rede/abort) propaga para o chamador distinguir de parcial.
// ---------------------------------------------------------------------------

function stripHtml(html: string): string {
  const noTags = html.replace(/<[^>]*>/g, ' ');
  const decoded = noTags
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_match, digits: string) => {
      const code = Number.parseInt(digits, 10);
      return Number.isSafeInteger(code) ? String.fromCharCode(code) : '';
    });
  return decoded.replace(/\s+/g, ' ').trim();
}

/** Primeiro grupo 1 não-vazio entre os padrões (já limpo de HTML). */
function extractFirst(html: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const match = pattern.exec(html);
    if (match !== null) {
      const raw = match[1];
      if (raw !== undefined) {
        const cleaned = stripHtml(raw);
        if (cleaned.length > 0) {
          return cleaned;
        }
      }
    }
  }
  return null;
}

const TITLE_PATTERN = /<title[^>]*>([\s\S]{1,1000}?)<\/title\s*>/i;
const ABSTRACT_PATTERNS: RegExp[] = [
  /<[^>]*\bid\s*=\s*["']resumo["'][^>]*>([\s\S]*?)<\/(?:span|div|p|td)\s*>/i,
  /Resumo\s*:?\s*(?:<\/[^>]+>\s*)?([^<]{20,8000})/i,
  /<meta\s+[^>]*name\s*=\s*["']description["'][^>]*content\s*=\s*["']([^"']+)["']/i,
];
const ORIENTADOR_PATTERN = /Orientador(?:\(a\))?\s*:?\s*([^<]{1,300})/i;
const PROGRAMA_PATTERN = /Programas?(?:\s+[Dd]e\b[^<:\n]{0,80})?\s*:\s*([^<]{1,300})/i;
const BANCA_PATTERN = /Banca(?:\s+[Ee]xaminadora)?\s*:\s*([^<]{1,500})/i;
const KEYWORDS_PATTERN = /Palavras?-?chaves?\s*:?\s*([^<]{1,500})/i;

function splitList(value: string | null, max: number): string[] {
  if (value === null) {
    return [];
  }
  const out: string[] = [];
  for (const part of value.split(/[;\n]/)) {
    const trimmed = part.trim();
    if (trimmed.length > 0 && out.length < max) {
      out.push(trimmed);
    }
  }
  return out;
}

export async function enrichBdtd(
  client: SourceClient,
  sourceId: string,
  ctx: SourceClientContext,
): Promise<NormalizedItem> {
  const id = sourceId.trim();
  const recordUrl = `${BDTD_RECORD_URL}/${encodeURIComponent(id)}`;
  const res = await client.fetchText(
    recordUrl,
    fetchInit(ctx, 'GET', { Accept: 'text/html' }, 'text'),
  );
  const partial = (extra?: Record<string, unknown>): NormalizedItem => ({
    sourceId: id,
    title: '',
    authors: [],
    year: null,
    docType: null,
    institution: null,
    program: null,
    abstract: null,
    originUrl: recordUrl,
    sourceUrl: null,
    rawMetadata: sanitizeRaw({ recordUrl, enrichPartial: true, ...(extra ?? {}) }),
  });
  if (res.challenged || res.status >= 400) {
    return partial();
  }
  const html = res.body;
  const title = extractFirst(html, [TITLE_PATTERN]);
  const abstract = extractFirst(html, ABSTRACT_PATTERNS);
  const orientador = extractFirst(html, [ORIENTADOR_PATTERN]);
  const programa = extractFirst(html, [PROGRAMA_PATTERN]);
  const banca = splitList(extractFirst(html, [BANCA_PATTERN]), 20);
  const keywords = splitList(extractFirst(html, [KEYWORDS_PATTERN]), 30);
  const foundSomething =
    title !== null || abstract !== null || programa !== null || orientador !== null;
  const raw: Record<string, unknown> = { recordUrl };
  if (!foundSomething) {
    raw['enrichPartial'] = true;
  }
  if (orientador !== null) {
    raw['orientador'] = truncate(orientador, 300);
  }
  if (banca.length > 0) {
    raw['banca'] = banca;
  }
  if (keywords.length > 0) {
    raw['keywords'] = keywords;
  }
  return {
    sourceId: id,
    title: title === null ? '' : truncate(title, TITLE_MAX_LENGTH),
    authors: [],
    year: null,
    docType: null,
    institution: null,
    program: programa === null ? null : truncate(programa, 300),
    abstract: abstract === null ? null : truncate(abstract, ABSTRACT_MAX_LENGTH),
    originUrl: recordUrl,
    sourceUrl: null,
    rawMetadata: sanitizeRaw(raw),
  };
}
