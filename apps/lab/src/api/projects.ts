// apps/lab — projetos via CORE (UI-02).
//
// Rotas reais (apps/core-api/src/routes/projects.ts):
// GET /api/v1/projects (lista owner-scoped, ?status=&limit=&cursor=) ·
// POST /api/v1/projects (201) ·
// GET /api/v1/projects/:id (404 idêntico fora do escopo, IDOR §2.3) ·
// PATCH /api/v1/projects/:id (referenceSearchId incl., UI-30).
// ProjectDTO em definição única; update espelha updateProjectSchema.

import { createProjectSchema, updateProjectSchema } from '@uhhu/contracts';
import type {
  CreateProjectInput,
  PageInfo,
  ProjectDTO,
  UpdateProjectInput,
} from '@uhhu/contracts';
import { apiFetch } from './client';
import type { TokenProvider } from './client';

export interface ProjectsRequestOptions {
  getToken?: TokenProvider;
  baseUrl?: string;
}

function toRequestOptions(opts?: ProjectsRequestOptions): { getToken?: TokenProvider; baseUrl?: string } {
  const out: { getToken?: TokenProvider; baseUrl?: string } = {};
  if (opts?.getToken !== undefined) {
    out.getToken = opts.getToken;
  }
  if (typeof opts?.baseUrl === 'string' && opts.baseUrl.length > 0) {
    out.baseUrl = opts.baseUrl;
  }
  return out;
}

export type ProjectListStatus = 'active' | 'archived' | 'all';

export interface ListProjectsQuery {
  status?: ProjectListStatus;
  limit?: number;
  cursor?: string;
}

function buildListPath(query?: ListProjectsQuery): string {
  const params = new URLSearchParams();
  params.set('status', query?.status ?? 'active');
  if (typeof query?.limit === 'number' && Number.isFinite(query.limit)) {
    params.set('limit', String(query.limit));
  }
  if (typeof query?.cursor === 'string' && query.cursor.length > 0) {
    params.set('cursor', query.cursor);
  }
  return `/api/v1/projects?${params.toString()}`;
}

export const projectsApi = {
  async list(
    query?: ListProjectsQuery,
    opts?: ProjectsRequestOptions,
  ): Promise<{ items: ProjectDTO[]; page: PageInfo }> {
    const data = await apiFetch<{ items: ProjectDTO[]; page: PageInfo }>(buildListPath(query), {
      ...toRequestOptions(opts),
      method: 'GET',
    });
    return { items: data.items, page: data.page };
  },

  async listById(id: string, opts?: ProjectsRequestOptions): Promise<ProjectDTO> {
    const data = await apiFetch<ProjectDTO>(`/api/v1/projects/${encodeURIComponent(id)}`, {
      ...toRequestOptions(opts),
      method: 'GET',
    });
    return data;
  },

  async create(input: CreateProjectInput, opts?: ProjectsRequestOptions): Promise<ProjectDTO> {
    const body = createProjectSchema.parse(input);
    const data = await apiFetch<ProjectDTO>('/api/v1/projects', {
      ...toRequestOptions(opts),
      method: 'POST',
      body,
    });
    return data;
  },

  // referenceSearchId (UI-30, nullable para limpar) validado pelo schema;
  // pertencimento mesmo projectId+owner é application-level no servidor.
  async update(
    id: string,
    patch: UpdateProjectInput,
    opts?: ProjectsRequestOptions,
  ): Promise<ProjectDTO> {
    const body = updateProjectSchema.parse(patch);
    const data = await apiFetch<ProjectDTO>(`/api/v1/projects/${encodeURIComponent(id)}`, {
      ...toRequestOptions(opts),
      method: 'PATCH',
      body,
    });
    return data;
  },
};
