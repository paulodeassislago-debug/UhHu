// packages/integrations — adapter CAPES (rest/busca JSON) + enrich de ficha HTML.
//
// Fronteira: esta é a única via de saída para catalogodeteses.capes.gov.br.
// Transporte (rate limit, breaker, allowlist, TLS padrão) vive no SourceClient;
// aqui só tradução SearchDef→rest/busca e rest/busca→NormalizedItem (D-31:
// termo em string livre com aspas preservadas, sem tradução lossy).
//
// Enrich sob demanda: `enrichCapes` existe e é testada, mas NÃO é chamada
// durante o run — enrich em batch só para elegíveis é Phase 4 (§6 da spec).

import { z } from 'zod';
import { sanitizeRaw, type SourcePagination } from './bdtd.js';
import type { SourceClient, SourceFetchInit } from './sourceClient.js';
import type { NormalizedItem, SearchDef, SourceClientContext, SourcePage } from './types.js';

/** Versão do adapter (vai para `adapter_versions` do run — D-34/proveniência). */
export const ADAPTER_VERSION = 'capes/1.0-fase3';

const CAPES_SEARCH_URL = 'https://catalogodeteses.capes.gov.br/catalogo-teses/rest/busca';

const YEAR_PATTERN = /(\d{4})/;
const HTTP_URL_PATTERN = /^https?:\/\//i;
/** Ficha CAPES só em host público (sem localhost/IP/credencial — SSRF). */
const PUBLIC_HOST_PATTERN = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;
const ABSTRACT_MAX_LENGTH = 8000;
const TITLE_MAX_LENGTH = 500;
const AUTHORS_MAX_COUNT = 50;
const YEAR_RANGE_MAX = 30;
const PER_PAGE_MIN = 5;
const PER_PAGE_MAX = 50;
const PER_PAGE_DEFAULT = 20;

/** Intervalo de anos amplo demais: rejeitado localmente antes da rede (T-03-03-03). */
export class RangeTooWideError extends Error {
  readonly status = 422;
  readonly code = 'RANGE_TOO_WIDE';

  constructor(message: string) {
    super(message);
    this.name = 'RangeTooWideError';
  }
}

// ---------------------------------------------------------------------------
// Estreitamento defensivo (T-03-03-01). Envelope com Zod safeParse; campos via
// narrowing sobre `unknown`; ausente → null, nunca throw em campo opcional.
// ---------------------------------------------------------------------------

const capesEnvelopeSchema = z.object({
  pagina: z.unknown().optional(),
  total: z.unknown().optional(),
  tesesDissertacoes: z.array(z.record(z.string(), z.unknown())),
});

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

function clampPerPage(value: number): number {
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

function clampPage(value: number): number {
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

/** Grau acadêmico → docType canônico; desconhecido → null. */
function canonicalDocType(value: unknown): string | null {
  const raw = Array.isArray(value) ? (value as unknown[])[0] : value;
  if (typeof raw !== 'string') {
    return null;
  }
  const normalized = norm(raw);
  if (
    normalized === 'mestrado' ||
    normalized === 'masterthesis' ||
    normalized === 'dissertacao' ||
    normalized === 'master'
  ) {
    return 'masterThesis';
  }
  if (
    normalized === 'doutorado' ||
    normalized === 'doctoralthesis' ||
    normalized === 'tese' ||
    normalized === 'doutor' ||
    normalized === 'phd'
  ) {
    return 'doctoralThesis';
  }
  return null;
}

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
      }
      if (out.length >= AUTHORS_MAX_COUNT) {
        break;
      }
    }
  }
  return out;
}

/** URL http(s) ou null (esquemas exóticos nunca viram link persistido). */
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

function asNonNegativeInt(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
    return value;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number.parseInt(value.trim(), 10);
    if (Number.isInteger(parsed) && parsed >= 0) {
      return parsed;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Tradução SearchDef → rest/busca.
// ---------------------------------------------------------------------------

export interface CapesFiltro {
  campo: string;
  valor: string;
}

export interface CapesSearchPayload {
  termo: string;
  filtros: CapesFiltro[];
  pagina: number;
  registrosPorPagina: number;
}

/**
 * Monta o payload rest/busca. `Ano` expande um filtro por ano; range >30 anos
 * lança RangeTooWideError ANTES de qualquer rede (T-03-03-03). `institution`
 * NÃO vai à fonte — só pós-filtro do Core (D-32).
 */
export function buildCapesPayload(
  def: SearchDef,
  page: number,
  perPage: number,
): CapesSearchPayload {
  const term = def.term.trim();
  if (term.length === 0) {
    throw new Error('Adapter CAPES: termo de busca vazio.');
  }
  const filtros: CapesFiltro[] = [];
  const yearFrom = def.yearFrom;
  const yearTo = def.yearTo;
  if (yearFrom !== undefined && yearTo !== undefined) {
    if (yearFrom > yearTo) {
      throw new RangeTooWideError(
        `Intervalo de anos inválido: ${String(yearFrom)} é posterior a ${String(yearTo)}.`,
      );
    }
    const count = yearTo - yearFrom + 1;
    if (count > YEAR_RANGE_MAX) {
      throw new RangeTooWideError(
        `Intervalo de ${String(count)} anos excede o máximo de ${String(YEAR_RANGE_MAX)} por busca; refine o período.`,
      );
    }
    for (let year = yearFrom; year <= yearTo; year += 1) {
      filtros.push({ campo: 'Ano', valor: String(year) });
    }
  } else if (yearFrom !== undefined) {
    filtros.push({ campo: 'Ano', valor: String(yearFrom) });
  } else if (yearTo !== undefined) {
    filtros.push({ campo: 'Ano', valor: String(yearTo) });
  }
  // Limite unilateral vira filtro do ano informado; o pós-filtro do Core aplica
  // o intervalo real (D-32: fonte aproxima, Core garante).
  for (const docType of canonicalDocTypes(def.docTypes)) {
    filtros.push({ campo: 'Grau Acadêmico', valor: degreeLabel(docType) });
  }
  const area = def.area?.trim();
  if (area !== undefined && area.length > 0) {
    filtros.push({ campo: 'Grande Área Conhecimento', valor: area });
  }
  const program = def.program?.trim();
  if (program !== undefined && program.length > 0) {
    filtros.push({ campo: 'Área Conhecimento', valor: program });
  }
  return {
    termo: term,
    filtros,
    pagina: page,
    registrosPorPagina: perPage,
  };
}

/** Mapeia docType canônico → rótulo da fonte antes de montar o filtro. */
function degreeLabel(docType: string): string {
  return docType === 'masterThesis' ? 'Mestrado' : 'Doutorado';
}

/** Sinal de trabalho sem divulgação autorizada (sem link quando sem divulgação). */
function isRestricted(record: Record<string, unknown>): boolean {
  if (record['semDivulgacao'] === true) {
    return true;
  }
  if (record['divulgacaoAutorizada'] === false) {
    return true;
  }
  const status = firstString(record, ['divulgacao', 'statusDivulgacao', 'situacao']);
  return status !== null && /sem\s+divulga/i.test(status);
}

function mapCapesRecord(record: Record<string, unknown>): NormalizedItem | null {
  const sourceId = firstString(record, ['id', 'sourceId']);
  const title = firstString(record, ['titulo', 'title']);
  if (sourceId === null || title === null) {
    return null;
  }
  const link = httpString(record, ['link', 'url']);
  const restricted = isRestricted(record);
  const raw = sanitizeRaw(record);
  if (restricted) {
    raw['semDivulgacao'] = true;
  }
  return {
    sourceId,
    title: truncate(title, TITLE_MAX_LENGTH),
    authors: authorsFrom(record['autor'] ?? record['autores'] ?? record['authors']),
    year: yearFromValue(record['ano'] ?? record['year']),
    docType: canonicalDocType(
      record['grauAcademico'] ?? record['grau'] ?? record['degree'] ?? record['docType'],
    ),
    institution: firstString(record, ['instituicao', 'institution', 'ies', 'universidade']),
    program: firstString(record, ['programa', 'program', 'course', 'curso']),
    abstract: (() => {
      const rawAbstract = firstString(record, ['resumo', 'abstract']);
      return rawAbstract === null ? null : truncate(rawAbstract, ABSTRACT_MAX_LENGTH);
    })(),
    originUrl: link,
    // Sem divulgação → sem link; com divulgação o link da ficha é a origem e a
    // porta de entrada do enrich (que confirma o PDF real — Phase 4).
    sourceUrl: restricted ? null : link,
    rawMetadata: raw,
  };
}

/**
 * Busca na CAPES via POST rest/busca. Nunca lança por transporte/parse:
 * devolve `failed` (executor marca partial — D-37); challenge → `challenge`.
 * Range amplo demais lança RangeTooWideError antes da rede.
 */
export async function searchCapes(
  client: SourceClient,
  def: SearchDef,
  pagination: SourcePagination,
  ctx: SourceClientContext,
): Promise<SourcePage> {
  const failed: SourcePage = { total: null, items: [], sourceStatus: 'failed' };
  // Range amplo demais ou termo vazio lançam antes de qualquer rede.
  const wire = buildCapesPayload(def, clampPage(pagination.page), clampPerPage(pagination.perPage));
  let status = 0;
  let body = '';
  try {
    const res = await client.fetchText(
      CAPES_SEARCH_URL,
      fetchInit(
        ctx,
        'POST',
        { Accept: 'application/json', 'Content-Type': 'application/json' },
        'json',
        JSON.stringify(wire),
      ),
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
  const envelope = capesEnvelopeSchema.safeParse(parsed);
  if (!envelope.success) {
    return failed;
  }
  const items: NormalizedItem[] = [];
  for (const record of envelope.data.tesesDissertacoes) {
    const item = mapCapesRecord(record);
    if (item !== null) {
      items.push(item);
    }
  }
  return { total: asNonNegativeInt(envelope.data.total), items, sourceStatus: 'ok' };
}

// ---------------------------------------------------------------------------
// Enrich sob demanda (Phase 4): ficha HTML (link do registro).
// Extrai #resumo, #palavras e a presença de #download:link_download_arquivo
// (sem ele → sourceUrl null). Id nu (sem URL) → parcial sem rede.
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
const RESUMO_PATTERNS: RegExp[] = [
  /<[^>]*\bid\s*=\s*["']resumo["'][^>]*>([\s\S]*?)<\/(?:span|div|p|td)\s*>/i,
  /Resumo\s*:?\s*(?:<\/[^>]+>\s*)?([^<]{20,8000})/i,
];
const PALAVRAS_PATTERNS: RegExp[] = [
  /<[^>]*\bid\s*=\s*["']palavras["'][^>]*>([\s\S]*?)<\/(?:span|div|p|td)\s*>/i,
];
const DOWNLOAD_ANCHOR_PATTERN = /<a\b[^>]*\bid\s*=\s*["']download:link_download_arquivo["'][^>]*>/i;
const HREF_PATTERN = /href\s*=\s*["']([^"']+)["']/i;

/** Ficha só em URL pública http(s): bloqueia localhost/IP/credencial (SSRF). */
function assertPublicFichaUrl(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('Adapter CAPES: link de ficha inválido.');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Adapter CAPES: link de ficha deve ser http(s).');
  }
  if (parsed.username !== '' || parsed.password !== '') {
    throw new Error('Adapter CAPES: link de ficha com credencial.');
  }
  if (!PUBLIC_HOST_PATTERN.test(parsed.hostname)) {
    throw new Error('Adapter CAPES: link de ficha fora de host público.');
  }
  return parsed.toString();
}

function resolveHref(href: string, base: string): string {
  try {
    return new URL(href, base).toString();
  } catch {
    return base;
  }
}

export async function enrichCapes(
  client: SourceClient,
  sourceIdOrLink: string,
  ctx: SourceClientContext,
): Promise<NormalizedItem> {
  const ref = sourceIdOrLink.trim();
  if (!HTTP_URL_PATTERN.test(ref)) {
    // Id nu: sem base resolvível para a ficha → parcial sem rede.
    return {
      sourceId: ref,
      title: '',
      authors: [],
      year: null,
      docType: null,
      institution: null,
      program: null,
      abstract: null,
      originUrl: null,
      sourceUrl: null,
      rawMetadata: sanitizeRaw({ recordUrl: ref, enrichPartial: true }),
    };
  }
  const fichaUrl = assertPublicFichaUrl(ref);
  const res = await client.fetchText(
    fichaUrl,
    fetchInit(ctx, 'GET', { Accept: 'text/html' }, 'text'),
  );
  const partial = (extra?: Record<string, unknown>): NormalizedItem => ({
    sourceId: fichaUrl,
    title: '',
    authors: [],
    year: null,
    docType: null,
    institution: null,
    program: null,
    abstract: null,
    originUrl: fichaUrl,
    sourceUrl: null,
    rawMetadata: sanitizeRaw({ recordUrl: fichaUrl, enrichPartial: true, ...(extra ?? {}) }),
  });
  if (res.challenged || res.status >= 400) {
    return partial();
  }
  const html = res.body;
  const title = extractFirst(html, [TITLE_PATTERN]);
  const abstract = extractFirst(html, RESUMO_PATTERNS);
  const keywordsRaw = extractFirst(html, PALAVRAS_PATTERNS);
  const keywords: string[] = [];
  if (keywordsRaw !== null) {
    for (const part of keywordsRaw.split(/[;\n]/)) {
      const trimmed = part.trim();
      if (trimmed.length > 0 && keywords.length < 30) {
        keywords.push(trimmed);
      }
    }
  }
  const anchor = DOWNLOAD_ANCHOR_PATTERN.exec(html);
  let sourceUrl: string | null = null;
  if (anchor !== null) {
    const hrefMatch = HREF_PATTERN.exec(anchor[0]);
    const href = hrefMatch?.[1];
    sourceUrl = href === undefined ? fichaUrl : resolveHref(href, fichaUrl);
  }
  const raw: Record<string, unknown> = { recordUrl: fichaUrl };
  if (title === null && abstract === null && keywords.length === 0) {
    raw['enrichPartial'] = true;
  }
  if (keywords.length > 0) {
    raw['keywords'] = keywords;
  }
  return {
    sourceId: fichaUrl,
    title: title === null ? '' : truncate(title, TITLE_MAX_LENGTH),
    authors: [],
    year: null,
    docType: null,
    institution: null,
    program: null,
    abstract: abstract === null ? null : truncate(abstract, ABSTRACT_MAX_LENGTH),
    originUrl: fichaUrl,
    sourceUrl,
    rawMetadata: sanitizeRaw(raw),
  };
}
