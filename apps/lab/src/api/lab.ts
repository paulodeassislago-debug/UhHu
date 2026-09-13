// apps/lab — Lab via CORE (UI-02; stubs finos para fases 7–9).
//
// Paths reais do contrato §11.2 (apps/core-api/src/routes/lab.ts); o client
// nunca filtra localmente para decidir elegibilidade e nunca aplica regra de
// negócio (filtro/dedup/isNew são garantidos pelo Core). DTOs em definição
// única via `import type` de @uhhu/contracts; bodies via parse dos schemas.

import {
  createSearchSchema,
  createTagSchema,
  decisionInputSchema,
  divergenceInputSchema,
  fetchMoreRunsSchema,
  updateSearchSchema,
  updateTagSchema,
} from '@uhhu/contracts';
import type {
  CompareDTO,
  CorpusEntryDTO,
  CreateSearchInput,
  CreateTagInput,
  DecisionInput,
  DedupGroupDTO,
  DivergenceInput,
  ExecutableSource,
  FetchMoreResult,
  JobDTO,
  LabSource,
  PageInfo,
  ResultDTO,
  SearchDTO,
  SearchRunDTO,
  SourceHealthDTO,
  UpdateSearchInput,
  UpdateTagInput,
} from '@uhhu/contracts';
import { apiFetch } from './client';
import type { TokenProvider } from './client';

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

// Tag do projeto (08-02): espelho do `ProjectTag` do servidor
// (apps/core-api/src/lib/corpus.ts: { id, name, color }) — contracts não
// exporta este tipo; definição única aqui, sem `any`.
export interface ProjectTag {
  id: string;
  name: string;
  color: string | null;
}

// Client de triagem (08-02, base de 08-03/08-04) — rotas REAIS do servidor:
// - listGroups(projectId, ...)
// - setGroupDecision(groupId, ...)
// - listProjectTags(projectId)
// - createProjectTag(projectId, ...)
// - renameProjectTag(projectId, tagId, ...)
// - deleteProjectTag(projectId, tagId)
// - attachTag(groupId, tagId)
// - detachTag(groupId, tagId)
// - setDivergence(groupId, ...)

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

  // -- BUSCAR MAIS incremental (08-07, decisão Paulo 12/09 REVISADA) --
  // Lote +100/fonte sob demanda; offset sempre server-side (nunca input).
  // `sources` opcional (default: fontes com hasMore no servidor).
  async fetchMore(
    runId: string,
    input?: { sources?: ExecutableSource[] },
    opts?: LabRequestOptions,
  ): Promise<FetchMoreResult> {
    const body = fetchMoreRunsSchema.parse(
      input?.sources === undefined ? {} : { sources: input.sources },
    );
    return apiFetch<FetchMoreResult>(`/api/v1/lab/runs/${encodeURIComponent(runId)}/fetch-more`, {
      ...toRequestOptions(opts),
      method: 'POST',
      body,
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

  // -- Triagem por grupo (fase 8; decisão UMA por grupo D-46, nunca resultId) --
  async listGroups(
    projectId: string,
    query?: PagedQuery,
    opts?: LabRequestOptions,
  ): Promise<{ items: DedupGroupDTO[]; page: PageInfo }> {
    return apiFetch<{ items: DedupGroupDTO[]; page: PageInfo }>(
      withPaging(`/api/v1/lab/projects/${encodeURIComponent(projectId)}/groups`, query),
      { ...toRequestOptions(opts), method: 'GET' },
    );
  },

  async setGroupDecision(
    groupId: string,
    input: DecisionInput,
    opts?: LabRequestOptions,
  ): Promise<DedupGroupDTO> {
    const body = decisionInputSchema.parse(input);
    return apiFetch<DedupGroupDTO>(`/api/v1/lab/groups/${encodeURIComponent(groupId)}/decision`, {
      ...toRequestOptions(opts),
      method: 'PUT',
      body,
    });
  },

  async listProjectTags(projectId: string, opts?: LabRequestOptions): Promise<ProjectTag[]> {
    return apiFetch<ProjectTag[]>(`/api/v1/lab/projects/${encodeURIComponent(projectId)}/tags`, {
      ...toRequestOptions(opts),
      method: 'GET',
    });
  },

  async createProjectTag(
    projectId: string,
    input: CreateTagInput,
    opts?: LabRequestOptions,
  ): Promise<ProjectTag> {
    const body = createTagSchema.parse(input);
    return apiFetch<ProjectTag>(`/api/v1/lab/projects/${encodeURIComponent(projectId)}/tags`, {
      ...toRequestOptions(opts),
      method: 'POST',
      body,
    });
  },

  async renameProjectTag(
    projectId: string,
    tagId: string,
    input: UpdateTagInput,
    opts?: LabRequestOptions,
  ): Promise<ProjectTag> {
    const body = updateTagSchema.parse(input);
    return apiFetch<ProjectTag>(
      `/api/v1/lab/projects/${encodeURIComponent(projectId)}/tags/${encodeURIComponent(tagId)}`,
      { ...toRequestOptions(opts), method: 'PATCH', body },
    );
  },

  async deleteProjectTag(
    projectId: string,
    tagId: string,
    opts?: LabRequestOptions,
  ): Promise<void> {
    await apiFetch<void>(
      `/api/v1/lab/projects/${encodeURIComponent(projectId)}/tags/${encodeURIComponent(tagId)}`,
      { ...toRequestOptions(opts), method: 'DELETE' },
    );
  },

  async attachTag(groupId: string, tagId: string, opts?: LabRequestOptions): Promise<DedupGroupDTO> {
    return apiFetch<DedupGroupDTO>(`/api/v1/lab/groups/${encodeURIComponent(groupId)}/tags`, {
      ...toRequestOptions(opts),
      method: 'POST',
      body: { tagId },
    });
  },

  async detachTag(groupId: string, tagId: string, opts?: LabRequestOptions): Promise<void> {
    await apiFetch<void>(
      `/api/v1/lab/groups/${encodeURIComponent(groupId)}/tags/${encodeURIComponent(tagId)}`,
      { ...toRequestOptions(opts), method: 'DELETE' },
    );
  },

  async setDivergence(
    groupId: string,
    input: DivergenceInput,
    opts?: LabRequestOptions,
  ): Promise<DedupGroupDTO> {
    const body = divergenceInputSchema.parse(input);
    return apiFetch<DedupGroupDTO>(
      `/api/v1/lab/groups/${encodeURIComponent(groupId)}/divergence`,
      { ...toRequestOptions(opts), method: 'PUT', body },
    );
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
