// apps/lab — Lab via CORE (UI-02; stubs finos para fases 7–9).
//
// Paths reais do contrato §11.2 (apps/core-api/src/routes/lab.ts); o client
// nunca filtra localmente para decidir elegibilidade e nunca aplica regra de
// negócio (filtro/dedup/isNew são garantidos pelo Core). DTOs em definição
// única via `import type` de @uhhu/contracts; bodies via parse dos schemas.

import { createSearchSchema, updateSearchSchema } from '@uhhu/contracts';
import type {
  CompareDTO,
  CorpusEntryDTO,
  CreateSearchInput,
  JobDTO,
  LabSource,
  PageInfo,
  ResultDTO,
  SearchDTO,
  SearchRunDTO,
  SourceHealthDTO,
  UpdateSearchInput,
} from '@uhhu/contracts';
import { apiFetch } from './client.js';
import type { TokenProvider } from './client.js';

export interface LabRequestOptions {
  getToken?: TokenProvider;
  baseUrl?: string;
  idempotencyKey?: string;
}

function toRequestOptions(
  opts?: LabRequestOptions,
): { getToken?: TokenProvider; baseUrl?: string; idempotencyKey?: string } {
  const out: { getToken?: TokenProvider; baseUrl?: string; idempotencyKey?: string } = {};
  if (opts?.getToken !== undefined) {
    out.getToken = opts.getToken;
  }
  if (typeof opts?.baseUrl === 'string' && opts.baseUrl.length > 0) {
    out.baseUrl = opts.baseUrl;
  }
  if (typeof opts?.idempotencyKey === 'string' && opts.idempotencyKey.length > 0) {
    out.idempotencyKey = opts.idempotencyKey;
  }
  return out;
}

export interface PagedQuery {
  limit?: number;
  cursor?: string;
}

function withPaging(base: string, query?: PagedQuery): string {
  if (query?.limit === undefined && query?.cursor === undefined) {
    return base;
  }
  const params = new URLSearchParams();
  if (typeof query?.limit === 'number' && Number.isFinite(query.limit)) {
    params.set('limit', String(query.limit));
  }
  if (typeof query?.cursor === 'string' && query.cursor.length > 0) {
    params.set('cursor', query.cursor);
  }
  const suffix = params.toString();
  return suffix.length > 0 ? `${base}?${suffix}` : base;
}

// Entrada do registry (GET /api/v1/lab/sources). Shape da API com `name`
// tipado pelo contrato; sem importar @uhhu/integrations no frontend.
export interface LabSourceEntry {
  name: LabSource;
  level: string;
  enabled: boolean;
}

export type ExportFormat = 'csv' | 'bibtex' | 'json';
export type ExportScope = 'corpus' | 'selection';

export const labApi = {
  // -- Searches (fase 7) --
  async createSearch(input: CreateSearchInput, opts?: LabRequestOptions): Promise<SearchDTO> {
    const body = createSearchSchema.parse(input);
    return apiFetch<SearchDTO>('/api/v1/lab/searches', {
      ...toRequestOptions(opts),
      method: 'POST',
      body,
    });
  },

  async listSearches(
    projectId: string,
    query?: PagedQuery,
    opts?: LabRequestOptions,
  ): Promise<{ items: SearchDTO[]; page: PageInfo }> {
    const params = new URLSearchParams();
    params.set('projectId', projectId);
    if (typeof query?.limit === 'number' && Number.isFinite(query.limit)) {
      params.set('limit', String(query.limit));
    }
    if (typeof query?.cursor === 'string' && query.cursor.length > 0) {
      params.set('cursor', query.cursor);
    }
    return apiFetch<{ items: SearchDTO[]; page: PageInfo }>(
      `/api/v1/lab/searches?${params.toString()}`,
      { ...toRequestOptions(opts), method: 'GET' },
    );
  },

  async getSearch(searchId: string, opts?: LabRequestOptions): Promise<SearchDTO> {
    return apiFetch<SearchDTO>(`/api/v1/lab/searches/${encodeURIComponent(searchId)}`, {
      ...toRequestOptions(opts),
      method: 'GET',
    });
  },

  async updateSearch(
    searchId: string,
    patch: UpdateSearchInput,
    opts?: LabRequestOptions,
  ): Promise<SearchDTO> {
    const body = updateSearchSchema.parse(patch);
    return apiFetch<SearchDTO>(`/api/v1/lab/searches/${encodeURIComponent(searchId)}`, {
      ...toRequestOptions(opts),
      method: 'PATCH',
      body,
    });
  },

  async deleteSearch(searchId: string, opts?: LabRequestOptions): Promise<void> {
    await apiFetch<void>(
      `/api/v1/lab/searches/${encodeURIComponent(searchId)}?confirm=true`,
      { ...toRequestOptions(opts), method: 'DELETE' },
    );
  },

  // -- Runs + jobs (fase 7) --
  async executeSearch(
    searchId: string,
    opts?: LabRequestOptions,
  ): Promise<SearchRunDTO> {
    return apiFetch<SearchRunDTO>(
      `/api/v1/lab/searches/${encodeURIComponent(searchId)}/runs`,
      { ...toRequestOptions(opts), method: 'POST' },
    );
  },

  async listRuns(
    searchId: string,
    query?: PagedQuery,
    opts?: LabRequestOptions,
  ): Promise<{ items: SearchRunDTO[]; page: PageInfo }> {
    return apiFetch<{ items: SearchRunDTO[]; page: PageInfo }>(
      withPaging(`/api/v1/lab/searches/${encodeURIComponent(searchId)}/runs`, query),
      { ...toRequestOptions(opts), method: 'GET' },
    );
  },

  async getRun(runId: string, opts?: LabRequestOptions): Promise<SearchRunDTO> {
    return apiFetch<SearchRunDTO>(`/api/v1/lab/runs/${encodeURIComponent(runId)}`, {
      ...toRequestOptions(opts),
      method: 'GET',
    });
  },

  async getJob(jobId: string, opts?: LabRequestOptions): Promise<JobDTO> {
    return apiFetch<JobDTO>(`/api/v1/jobs/${encodeURIComponent(jobId)}`, {
      ...toRequestOptions(opts),
      method: 'GET',
    });
  },

  async cancelJob(jobId: string, opts?: LabRequestOptions): Promise<SearchRunDTO> {
    return apiFetch<SearchRunDTO>(`/api/v1/jobs/${encodeURIComponent(jobId)}/cancel`, {
      ...toRequestOptions(opts),
      method: 'POST',
    });
  },

  // -- Results (fase 8; isNew vem do servidor, regra D-35) --
  async listResults(
    runId: string,
    query?: PagedQuery,
    opts?: LabRequestOptions,
  ): Promise<{ items: ResultDTO[]; page: PageInfo; total: number; newCount: number }> {
    return apiFetch<{ items: ResultDTO[]; page: PageInfo; total: number; newCount: number }>(
      withPaging(`/api/v1/lab/runs/${encodeURIComponent(runId)}/results`, query),
      { ...toRequestOptions(opts), method: 'GET' },
    );
  },

  async getResult(resultId: string, opts?: LabRequestOptions): Promise<ResultDTO> {
    return apiFetch<ResultDTO>(`/api/v1/lab/results/${encodeURIComponent(resultId)}`, {
      ...toRequestOptions(opts),
      method: 'GET',
    });
  },

  // -- Corpus (fase 9; view derivada dos elegíveis) --
  async getCorpus(
    projectId: string,
    query?: PagedQuery,
    opts?: LabRequestOptions,
  ): Promise<{ items: CorpusEntryDTO[]; page: PageInfo }> {
    return apiFetch<{ items: CorpusEntryDTO[]; page: PageInfo }>(
      withPaging(`/api/v1/lab/projects/${encodeURIComponent(projectId)}/corpus`, query),
      { ...toRequestOptions(opts), method: 'GET' },
    );
  },

  // -- Export (fase 9; attachment verbatim, sem re-serializar) --
  async exportProject(
    projectId: string,
    format: ExportFormat,
    scope: ExportScope,
    selection: string | undefined,
    opts?: LabRequestOptions,
  ): Promise<string> {
    const params = new URLSearchParams();
    params.set('format', format);
    params.set('scope', scope);
    if (typeof selection === 'string' && selection.length > 0) {
      params.set('selection', selection);
    }
    return apiFetch<string>(
      `/api/v1/lab/projects/${encodeURIComponent(projectId)}/export?${params.toString()}`,
      { ...toRequestOptions(opts), method: 'GET', raw: true },
    );
  },

  // -- Sources (fase 7; status visível no formulário) --
  async listSources(opts?: LabRequestOptions): Promise<LabSourceEntry[]> {
    return apiFetch<LabSourceEntry[]>('/api/v1/lab/sources', {
      ...toRequestOptions(opts),
      method: 'GET',
    });
  },

  async getSourceHealth(source: LabSource, opts?: LabRequestOptions): Promise<SourceHealthDTO> {
    return apiFetch<SourceHealthDTO>(`/api/v1/lab/sources/${encodeURIComponent(source)}/health`, {
      ...toRequestOptions(opts),
      method: 'GET',
    });
  },

  // -- Compare (fase 9; só "mais inclusiva" no v1.1, §14-1) --
  async compareSearches(
    searchId: string,
    withIds: string[],
    opts?: LabRequestOptions,
  ): Promise<CompareDTO> {
    const params = new URLSearchParams();
    params.set('with', withIds.join(','));
    return apiFetch<CompareDTO>(
      `/api/v1/lab/searches/${encodeURIComponent(searchId)}/compare?${params.toString()}`,
      { ...toRequestOptions(opts), method: 'GET' },
    );
  },
};
