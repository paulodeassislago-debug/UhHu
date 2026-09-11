// packages/contracts — schemas e DTOs do Lab: buscas/runs/results/sources/health (D-28..D-39).
//
// UNICA definicao de tipos de busca: nenhum outro pacote duplica estes tipos.
// JSON publico em camelCase; banco em snake_case (mapeado no Drizzle).
//
// Notas de contrato:
// - Termo e string livre pass-through AND/OR/NOT + frase exata entre aspas (D-31):
//   o Core valida (tamanho + aspas balanceadas) e repassa sem traducao estruturada.
// - Filtros v1: ano + tipo + fonte + area + instituicao + programa (D-32). Cada fonte
//   honra o que sua API permite; o Core aplica pos-filtro local do resto.
// - `oasisbr` passa no `searchSourcesSchema` mas a ROTA retorna 400 SOURCE_DISABLED
//   (D-33; decisao de rota, nao de schema). Runs congelam o snapshot usado.
// - Job e SearchRun sao 1:1 — mesmos estados (D-30).
// - Listagem de results ordenada por fonte + ordem da fonte (D-36), cursor estavel
//   `source|rank|id` em base64url (molde pagination.ts).
// - `rawMetadata` (D-34) NUNCA e serializado com cookies/segredos: adapters (03-03)
//   higienizam antes de persistir; ver comentario T-03-01-02 no schema do banco.

// biome-ignore assist/source/organizeImports: import unico proposital
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Termo de busca (T-03-01-01: max 500 + aspas balanceadas no Zod;
// CHECK char_length espelha no banco).
// ---------------------------------------------------------------------------

export const searchTermSchema = z
  .string()
  .trim()
  .min(1, 'Termo de busca é obrigatório.')
  .max(500, 'Termo deve ter no máximo 500 caracteres.')
  .refine((value) => ((value.match(/"/g) ?? []).length % 2 === 0), {
    message: 'Termo com aspas desbalanceadas.',
  });

export type SearchTerm = z.infer<typeof searchTermSchema>;

// ---------------------------------------------------------------------------
// Filtros declarativos (D-32; T-03-01-03: arrays/tamanhos limitados).
// ---------------------------------------------------------------------------

export const docTypeSchema = z.enum(['masterThesis', 'doctoralThesis']);

export type DocType = z.infer<typeof docTypeSchema>;

export const searchFiltersSchema = z
  .object({
    yearFrom: z.number().int().min(1800).max(2100).optional(),
    yearTo: z.number().int().min(1800).max(2100).optional(),
    docTypes: z.array(docTypeSchema).max(2).optional(),
    source: z.enum(['bdtd', 'capes']).optional(),
    area: z.string().trim().max(200).optional(),
    institution: z.string().trim().max(300).optional(),
    program: z.string().trim().max(300).optional(),
  })
  .refine(
    (filters) =>
      filters.yearFrom === undefined ||
      filters.yearTo === undefined ||
      filters.yearFrom <= filters.yearTo,
    {
      message: 'Ano inicial deve ser menor ou igual ao ano final.',
      path: ['yearTo'],
    },
  );

export type SearchFilters = z.infer<typeof searchFiltersSchema>;

// ---------------------------------------------------------------------------
// Fontes (D-33: oasisbr valida no schema, bloqueada na rota com SOURCE_DISABLED).
// ---------------------------------------------------------------------------

export const labSourceSchema = z.enum(['bdtd', 'capes', 'oasisbr']);

export type LabSource = z.infer<typeof labSourceSchema>;

export const executableSourceSchema = z.enum(['bdtd', 'capes']);

export type ExecutableSource = z.infer<typeof executableSourceSchema>;

export const searchSourcesSchema = z.array(labSourceSchema).min(1).max(2);

export type SearchSources = z.infer<typeof searchSourcesSchema>;

// ---------------------------------------------------------------------------
// Criacao / atualizacao de Search (runs antigos congelam snapshot — D-33).
// ---------------------------------------------------------------------------

export const createSearchSchema = z.object({
  projectId: z.string().uuid(),
  term: searchTermSchema,
  filters: searchFiltersSchema.default({}),
  sources: z.array(executableSourceSchema).min(1).max(2).default(['bdtd', 'capes']),
});

export type CreateSearchInput = z.infer<typeof createSearchSchema>;

export const updateSearchSchema = z.object({
  term: searchTermSchema.optional(),
  filters: searchFiltersSchema.optional(),
  sources: z.array(executableSourceSchema).min(1).max(2).optional(),
});

export type UpdateSearchInput = z.infer<typeof updateSearchSchema>;

// ---------------------------------------------------------------------------
// Status de run/job (D-30: Job=Run 1:1, mesmos estados).
// ---------------------------------------------------------------------------

export const runStatusSchema = z.enum([
  'queued',
  'running',
  'succeeded',
  'partial',
  'failed',
  'cancelled',
]);

export type RunStatus = z.infer<typeof runStatusSchema>;

// ---------------------------------------------------------------------------
// DTOs publicos (camelCase). Erros seguem o catalogo PT-BR via ErrorCode.
// ---------------------------------------------------------------------------

export interface SearchDTO {
  id: string;
  projectId: string;
  term: string;
  filters: SearchFilters;
  sources: ExecutableSource[];
  createdAt: string;
  updatedAt: string;
}

export type PerSourceStatus = 'ok' | 'failed' | 'skipped';

export interface PerSourceMetrics {
  status: PerSourceStatus;
  total: number;
  returned: number;
  durationMs: number;
}

export interface RunCoverage {
  bdtd: number;
  capes: number;
}

export interface RunMetrics {
  perSource: Record<'bdtd' | 'capes', PerSourceMetrics>;
  newCount: number;
  coverage: RunCoverage;
}

export interface RunErrorInfo {
  code: string;
  message: string;
}

export interface SearchRunDTO {
  id: string;
  searchId: string;
  status: RunStatus;
  termSnapshot: string;
  filtersSnapshot: SearchFilters;
  sourcesSnapshot: ExecutableSource[];
  executedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  metrics: RunMetrics;
  error: RunErrorInfo | null;
}

export interface ResultDTO {
  id: string;
  runId: string;
  source: ExecutableSource;
  sourceId: string;
  title: string;
  authors: string[];
  year: number | null;
  docType: DocType | null;
  institution: string | null;
  program: string | null;
  abstract: string | null;
  originUrl: string | null;
  sourceUrl: string | null;
  retrievedAt: string;
}

export type SourceHealthStatus = 'ok' | 'degraded' | 'offline';

export interface SourceHealthRecent {
  total: number;
  ok: number;
  failed: number;
  challenges: number;
}

export interface SourceHealthDTO {
  source: LabSource;
  status: SourceHealthStatus;
  checkedAt: string;
  recent: SourceHealthRecent;
}

export type JobType = 'lab.search.execute';

export interface JobProgress {
  doneSources: number;
  totalSources: number;
}

export interface JobResultRef {
  runId: string;
}

export interface JobDTO {
  id: string;
  type: JobType;
  status: RunStatus;
  progress: JobProgress | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  resultRef: JobResultRef | null;
  error: RunErrorInfo | null;
}

// ---------------------------------------------------------------------------
// Paginacao de results (D-36: default 20, max 100, como projetos).
// ---------------------------------------------------------------------------

export const resultsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().max(512).optional(),
});

export type ResultsQuery = z.infer<typeof resultsQuerySchema>;

// ---------------------------------------------------------------------------
// Cursor de results: base64url de `source|rank|id` (molde pagination.ts, D-36).
// decodeResultsCursor retorna null em malformado — nunca lanca.
// ---------------------------------------------------------------------------

export function encodeResultsCursor(source: string, rank: number, id: string): string {
  return Buffer.from(`${source}|${rank}|${id}`, 'utf8').toString('base64url');
}

export interface DecodedResultsCursor {
  source: string;
  rank: number;
  id: string;
}

export function decodeResultsCursor(cursor: string): DecodedResultsCursor | null {
  try {
    if (cursor.length === 0 || cursor.length > 512) {
      return null;
    }
    const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
    const parts = decoded.split('|');
    if (parts.length !== 3) {
      return null;
    }
    const source = parts[0];
    const rankRaw = parts[1];
    const id = parts[2];
    if (source === undefined || source.length === 0) {
      return null;
    }
    if (rankRaw === undefined || rankRaw.length === 0) {
      return null;
    }
    if (id === undefined || id.length === 0) {
      return null;
    }
    const rank = Number.parseInt(rankRaw, 10);
    if (!Number.isSafeInteger(rank) || rank < 0) {
      return null;
    }
    return { source, rank, id };
  } catch {
    return null;
  }
}
