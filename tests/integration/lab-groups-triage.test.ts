// tests/integration — triagem no servidor PG real (08-01, UI-18/19/20 lado servidor).
//
// Seed mínimo via HTTP (project→search) + inserts diretos de runs/results
// (status succeeded, sem adapters/rede); GET groups computa os grupos (D-43).
// Asserts: groups expõem tags/divergences/decidedAt; decision preenche
// decidedAt; attach/divergence aparecem no grupo; rename/delete de tags
// owner-scoped (colisão 400, default excluído NÃO ressuscita); IDOR 404 em
// todas as rotas novas e alteradas. Sem PG: pula com graça. NUNCA imprime
// connection string. `unknown` + narrowing, nunca `any`.

import { execFileSync } from 'node:child_process';
import cookie from '@fastify/cookie';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createDb, type Db } from '@uhhu/db';
import {
  invites,
  labCanonicalPins,
  labDedupGroups,
  labDedupMembers,
  labDivergences,
  labGroupDecisions,
  labGroupTags,
  labIdempotencyKeys,
  labRejectedPairs,
  labResults,
  labSearches,
  labSearchRuns,
  labSourceEvents,
  labTags,
  passwordResets,
  projects,
  sessions,
  users,
} from '@uhhu/db';
import { COOKIE_NAME } from '../../apps/core-api/src/auth/session.js';
import { requestIdPlugin } from '../../apps/core-api/src/plugins/requestId.js';
import { errorHandler } from '../../apps/core-api/src/plugins/errorHandler.js';
import { buildAuthRoutes } from '../../apps/core-api/src/routes/auth.js';
import { buildProjectRoutes } from '../../apps/core-api/src/routes/projects.js';
import { buildLabRoutes } from '../../apps/core-api/src/routes/lab.js';

function readDatabaseUrl(name: 'APP_DATABASE_URL' | 'MIGRATION_DATABASE_URL'): string | undefined {
  const value = process.env[name];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

const APP_URL = readDatabaseUrl('APP_DATABASE_URL');
const MIGRATION_URL = readDatabaseUrl('MIGRATION_DATABASE_URL');

const GHOST_UUID = '00000000-0000-4000-8000-000000000000';

function errorText(err: unknown): string {
  const parts: string[] = [];
  parts.push(err instanceof Error ? err.message : String(err));
  if (typeof err === 'object' && err !== null) {
    const record = err as { stdout?: unknown; stderr?: unknown };
    for (const key of ['stdout', 'stderr'] as const) {
      const value: unknown = record[key];
      if (typeof value === 'string') {
        parts.push(value);
      } else if (Buffer.isBuffer(value)) {
        parts.push(value.toString('utf8'));
      }
    }
  }
  return parts.join('\n');
}

function isConnectionFailure(text: string): boolean {
  return /ECONNREFUSED|ENOTFOUND|ETIMEDOUT|EHOSTUNREACH|ENETUNREACH|EPIPE/i.test(text);
}

function headerValue(res: { headers: unknown }, name: string): unknown {
  if (typeof res.headers !== 'object' || res.headers === null) {
    return undefined;
  }
  return (res.headers as Record<string, unknown>)[name];
}

function setCookieList(res: { headers: unknown }): string[] {
  if (typeof res.headers !== 'object' || res.headers === null) {
    return [];
  }
  const raw: unknown = (res.headers as Record<string, unknown>)['set-cookie'];
  if (typeof raw === 'string') {
    return [raw];
  }
  if (Array.isArray(raw)) {
    return raw.filter((v): v is string => typeof v === 'string');
  }
  return [];
}

function sessionCookie(res: { headers: unknown }): string | null {
  for (const item of setCookieList(res)) {
    const pair = item.split(';')[0];
    if (pair === undefined) {
      continue;
    }
    const cut = pair.indexOf('=');
    if (cut < 0) {
      continue;
    }
    if (pair.slice(0, cut).trim() === COOKIE_NAME && pair.slice(cut + 1).trim().length > 0) {
      return pair.slice(cut + 1).trim();
    }
  }
  return null;
}

function requireSessionCookie(res: { headers: unknown }): string {
  const value = sessionCookie(res);
  expect(value).not.toBeNull();
  if (value === null) {
    throw new Error('resposta sem cookie de sessao');
  }
  return value;
}

function errorOf(body: unknown): { code: string; message: string; requestId: string } {
  return (body as { error: { code: string; message: string; requestId: string } }).error;
}

function inviteOf(body: unknown): { inviteToken: string; expiresAt: string } {
  return body as { inviteToken: string; expiresAt: string };
}

function userOf(body: unknown): { id: string; email: string; role: string } {
  return (body as { user: { id: string; email: string; role: string } }).user;
}

interface ApiResponse {
  statusCode: number;
  headers: unknown;
  json(): unknown;
}

async function apiRequest(
  app: FastifyInstance,
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  url: string,
  options: { body?: Record<string, unknown>; cookieValue?: string } = {},
): Promise<ApiResponse> {
  const headers: Record<string, string> = {
    ...(options.body !== undefined ? { 'content-type': 'application/json' } : {}),
    ...(options.cookieValue !== undefined
      ? { cookie: `${COOKIE_NAME}=${options.cookieValue}` }
      : {}),
  };
  if (method === 'GET' || method === 'DELETE') {
    return app.inject({ method, url, headers });
  }
  const { body } = options;
  if (body === undefined) {
    return app.inject({ method, url, headers });
  }
  return app.inject({ method, url, payload: body, headers });
}

async function bootstrapAdmin(
  app: FastifyInstance,
  name: string,
  email: string,
): Promise<{ userId: string; cookie: string }> {
  const boot = await apiRequest(app, 'POST', '/api/v1/auth/invites');
  expect(boot.statusCode).toBe(201);
  const reg = await apiRequest(app, 'POST', '/api/v1/auth/register', {
    body: {
      name,
      email,
      password: 'SenhaForte123!',
      inviteToken: inviteOf(boot.json()).inviteToken,
    },
  });
  expect(reg.statusCode).toBe(201);
  return { userId: userOf(reg.json()).id, cookie: requireSessionCookie(reg) };
}

async function createMember(
  app: FastifyInstance,
  adminCookie: string,
  name: string,
  email: string,
): Promise<{ userId: string; cookie: string }> {
  const inv = await apiRequest(app, 'POST', '/api/v1/auth/invites', {
    body: {},
    cookieValue: adminCookie,
  });
  expect(inv.statusCode).toBe(201);
  const reg = await apiRequest(app, 'POST', '/api/v1/auth/register', {
    body: {
      name,
      email,
      password: 'SenhaForte123!',
      inviteToken: inviteOf(inv.json()).inviteToken,
    },
  });
  expect(reg.statusCode).toBe(201);
  return { userId: userOf(reg.json()).id, cookie: requireSessionCookie(reg) };
}

interface TestDivergence {
  source: string;
  note: string;
}

interface TestGroup {
  id: string;
  projectId: string;
  decision: string;
  tags: string[];
  divergences: TestDivergence[];
  decidedAt: string | null;
}

function divergenceOf(value: unknown): TestDivergence {
  const record = value as Record<string, unknown>;
  const source = record['source'];
  const note = record['note'];
  if (typeof source !== 'string' || typeof note !== 'string') {
    throw new Error('divergencia sem source/note string');
  }
  return { source, note };
}

function groupOf(body: unknown): TestGroup {
  const record = body as Record<string, unknown>;
  const id = record['id'];
  const projectId = record['projectId'];
  const decision = record['decision'];
  const tagsRaw = record['tags'];
  const divergencesRaw = record['divergences'];
  const decidedAt = record['decidedAt'];
  if (typeof id !== 'string' || typeof projectId !== 'string' || typeof decision !== 'string') {
    throw new Error('grupo sem id/projectId/decision');
  }
  if (!Array.isArray(tagsRaw) || !tagsRaw.every((t): t is string => typeof t === 'string')) {
    throw new Error('grupo sem tags string[]');
  }
  if (!Array.isArray(divergencesRaw)) {
    throw new Error('grupo sem divergences array');
  }
  if (decidedAt !== null) {
    if (typeof decidedAt !== 'string' || Number.isNaN(Date.parse(decidedAt))) {
      throw new Error('grupo com decidedAt nao-ISO');
    }
  }
  return {
    id,
    projectId,
    decision,
    tags: [...tagsRaw],
    divergences: divergencesRaw.map(divergenceOf),
    decidedAt,
  };
}

function groupsOf(body: unknown): TestGroup[] {
  const record = body as Record<string, unknown>;
  const items = record['items'];
  if (!Array.isArray(items)) {
    throw new Error('lista de grupos sem items');
  }
  return items.map(groupOf);
}

interface TestTag {
  id: string;
  name: string;
  color: string | null;
}

function tagOf(body: unknown): TestTag {
  const record = body as Record<string, unknown>;
  const id = record['id'];
  const name = record['name'];
  const color = record['color'];
  if (typeof id !== 'string' || typeof name !== 'string') {
    throw new Error('tag sem id/name');
  }
  if (color !== null && typeof color !== 'string') {
    throw new Error('tag com color invalida');
  }
  return { id, name, color };
}

function tagsOf(body: unknown): TestTag[] {
  if (!Array.isArray(body)) {
    throw new Error('lista de tags nao e array');
  }
  return body.map(tagOf);
}

interface SeedItem {
  source: string;
  sourceId: string;
  title: string;
  authors: string[];
  year: number | null;
}

// Run concluído com N itens de conteúdo distinto → N grupos single (sem
// adapters/rede; o GET groups computa via D-43).
async function seedSucceededRun(
  db: Db,
  searchId: string,
  userId: string,
  items: SeedItem[],
): Promise<string> {
  const runs = await db
    .insert(labSearchRuns)
    .values({
      searchId,
      createdBy: userId,
      status: 'succeeded',
      termSnapshot: '"triagem deterministica"',
      filtersSnapshot: {},
      sourcesSnapshot: ['bdtd', 'capes'],
    })
    .returning({ id: labSearchRuns.id });
  const run = runs[0];
  if (run === undefined) {
    throw new Error('seed run sem id');
  }
  let rank = 0;
  for (const item of items) {
    rank += 1;
    await db.insert(labResults).values({
      runId: run.id,
      source: item.source,
      sourceId: item.sourceId,
      title: item.title,
      authors: item.authors,
      year: item.year,
      rawMetadata: { seed: true, sourceId: item.sourceId },
      rank,
    });
  }
  return run.id;
}

interface TriageCtx {
  ownerCookie: string;
  strangerCookie: string;
  projectId: string;
  ownerId: string;
}

async function setupCtx(app: FastifyInstance, db: Db, n: number): Promise<TriageCtx> {
  const owner = await bootstrapAdmin(app, `Dona Triagem ${n}`, `triagem-${n}@exemplo.test`);
  const stranger = await createMember(
    app,
    owner.cookie,
    `Estranho Tri ${n}`,
    `estranho-tri-${n}@exemplo.test`,
  );
  const created = await apiRequest(app, 'POST', '/api/v1/projects', {
    body: { title: `Projeto Triagem ${n}` },
    cookieValue: owner.cookie,
  });
  expect(created.statusCode).toBe(201);
  const projectId = (created.json() as { id: string }).id;
  const searchRes = await apiRequest(app, 'POST', '/api/v1/lab/searches', {
    body: { projectId, term: `"triagem ${n}"`, filters: {}, sources: ['bdtd', 'capes'] },
    cookieValue: owner.cookie,
  });
  expect(searchRes.statusCode).toBe(201);
  const searchId = (searchRes.json() as { id: string }).id;
  await seedSucceededRun(db, searchId, owner.userId, [
    {
      source: 'bdtd',
      sourceId: `tri-${n}-a`,
      title: 'Alfabetização e letramento digital',
      authors: ['Ana Prova'],
      year: 2020,
    },
    {
      source: 'capes',
      sourceId: `tri-${n}-b`,
      title: 'Formação docente em ciências naturais',
      authors: ['Beto Prova'],
      year: 2021,
    },
  ]);
  return { ownerCookie: owner.cookie, strangerCookie: stranger.cookie, projectId, ownerId: owner.userId };
}

async function fetchGroups(
  app: FastifyInstance,
  projectId: string,
  cookieValue: string,
): Promise<ApiResponse> {
  return apiRequest(app, 'GET', `/api/v1/lab/projects/${projectId}/groups`, { cookieValue });
}

describe.skipIf(APP_URL === undefined || MIGRATION_URL === undefined)(
  'lab groups triage PG real (tags/divergences/decidedAt + rename/delete, IDOR 404)',
  () => {
    let pgAvailable = true;
    let app: FastifyInstance | undefined;
    let db: Db | undefined;

    beforeAll(async () => {
      try {
        execFileSync('pnpm', ['--filter', '@uhhu/db', 'db:migrate'], {
          stdio: 'pipe',
          timeout: 60000,
        });
      } catch (err: unknown) {
        if (isConnectionFailure(errorText(err))) {
          pgAvailable = false;
          console.warn('[lab-groups-triage] PG inalcançavel no migrate — pulando (offline).');
          return;
        }
        throw err;
      }
      if (APP_URL === undefined) {
        pgAvailable = false;
        return;
      }
      const database = createDb(APP_URL);
      db = database;
      const instance = Fastify({ logger: false });
      await instance.register(cookie);
      await instance.register(async (child) => {
        await requestIdPlugin(child);
      });
      await instance.register(async (child) => {
        await errorHandler(child);
      });
      await instance.register(async (child) => {
        await buildAuthRoutes(child, database);
      });
      await instance.register(async (child) => {
        await buildProjectRoutes(child, database);
      });
      await instance.register(async (child) => {
        await buildLabRoutes(child, database);
      });
      app = instance;
    }, 60000);

    afterAll(async () => {
      await app?.close();
    });

    beforeEach(async () => {
      if (!pgAvailable || db === undefined) {
        return;
      }
      await db.delete(labGroupTags);
      await db.delete(labDedupMembers);
      await db.delete(labCanonicalPins);
      await db.delete(labDivergences);
      await db.delete(labGroupDecisions);
      await db.delete(labRejectedPairs);
      await db.delete(labDedupGroups);
      await db.delete(labTags);
      await db.delete(labResults);
      await db.delete(labIdempotencyKeys);
      await db.delete(labSourceEvents);
      await db.delete(labSearchRuns);
      await db.delete(labSearches);
      await db.delete(projects);
      await db.delete(passwordResets);
      await db.delete(sessions);
      await db.delete(invites);
      await db.delete(users);
    });

    it('groups expõem tags/divergences/decidedAt; decision preenche decidedAt', async () => {
      if (!pgAvailable || app === undefined || db === undefined) {
        console.warn('[lab-groups-triage] PG inalcançavel — teste pulado (offline).');
        return;
      }
      const ctx = await setupCtx(app, db, 1);

      // Nunca triado: tags [], divergences [], decidedAt null.
      const listed = await fetchGroups(app, ctx.projectId, ctx.ownerCookie);
      expect(listed.statusCode).toBe(200);
      expect(headerValue(listed, 'x-request-id')).toBeTruthy();
      const groups = groupsOf(listed.json());
      expect(groups).toHaveLength(2);
      for (const g of groups) {
        expect(g.tags).toEqual([]);
        expect(g.divergences).toEqual([]);
        expect(g.decidedAt).toBeNull();
      }
      const first = groups[0];
      const second = groups[1];
      if (first === undefined || second === undefined) {
        throw new Error('seed sem os dois grupos esperados');
      }

      // Decisão elegível: decidedAt ISO não-nulo, tags/divergences intactos.
      const decided = await apiRequest(app, 'PUT', `/api/v1/lab/groups/${first.id}/decision`, {
        body: { decision: 'eligible' },
        cookieValue: ctx.ownerCookie,
      });
      expect(decided.statusCode).toBe(200);
      const decidedGroup = groupOf(decided.json());
      expect(decidedGroup.decision).toBe('eligible');
      expect(decidedGroup.decidedAt).not.toBeNull();
      expect(decidedGroup.tags).toEqual([]);
      expect(decidedGroup.divergences).toEqual([]);

      // Leitura seguinte espelha: decidido tem decidedAt, o outro segue null.
      const relisted = groupsOf((await fetchGroups(app, ctx.projectId, ctx.ownerCookie)).json());
      const again = relisted.find((g) => g.id === first.id);
      const untouched = relisted.find((g) => g.id === second.id);
      expect(again?.decidedAt).toBe(decidedGroup.decidedAt);
      expect(untouched?.decidedAt).toBeNull();

      // UI-19: re-decisão atualiza o decidido_em (nunca congela na primeira).
      const redecided = await apiRequest(app, 'PUT', `/api/v1/lab/groups/${first.id}/decision`, {
        body: { decision: 'ineligible', reason: 'Fora do escopo.' },
        cookieValue: ctx.ownerCookie,
      });
      expect(redecided.statusCode).toBe(200);
      const redecidedGroup = groupOf(redecided.json());
      expect(redecidedGroup.decision).toBe('ineligible');
      expect(redecidedGroup.decidedAt).not.toBeNull();
      if (redecidedGroup.decidedAt !== null && decidedGroup.decidedAt !== null) {
        expect(Date.parse(redecidedGroup.decidedAt)).toBeGreaterThanOrEqual(
          Date.parse(decidedGroup.decidedAt),
        );
      }

      // Fronteira Zod: decisão inválida e motivo gigante → 400.
      const badDecision = await apiRequest(app, 'PUT', `/api/v1/lab/groups/${first.id}/decision`, {
        body: { decision: 'talvez' },
        cookieValue: ctx.ownerCookie,
      });
      expect(badDecision.statusCode).toBe(400);
      const longReason = await apiRequest(app, 'PUT', `/api/v1/lab/groups/${first.id}/decision`, {
        body: { decision: 'eligible', reason: 'x'.repeat(501) },
        cookieValue: ctx.ownerCookie,
      });
      expect(longReason.statusCode).toBe(400);
    });

    it('attach/divergence aparecem no grupo; rename/delete com 400/204; default excluído não volta', async () => {
      if (!pgAvailable || app === undefined || db === undefined) {
        console.warn('[lab-groups-triage] PG inalcançavel — teste pulado (offline).');
        return;
      }
      const ctx = await setupCtx(app, db, 2);
      const groups = groupsOf((await fetchGroups(app, ctx.projectId, ctx.ownerCookie)).json());
      const first = groups[0];
      if (first === undefined) {
        throw new Error('seed sem grupo');
      }

      // Primeira listagem semeia os defaults (incluir/excluir/duplicado/indisponível/revisar).
      const listed = await apiRequest(app, 'GET', `/api/v1/lab/projects/${ctx.projectId}/tags`, {
        cookieValue: ctx.ownerCookie,
      });
      expect(listed.statusCode).toBe(200);
      const seeded = tagsOf(listed.json());
      for (const name of ['incluir', 'excluir', 'duplicado', 'indisponível', 'revisar']) {
        expect(seeded.map((t) => t.name)).toContain(name);
      }
      const incluir = seeded.find((t) => t.name === 'incluir');
      const excluir = seeded.find((t) => t.name === 'excluir');
      if (incluir === undefined || excluir === undefined) {
        throw new Error('defaults sem incluir/excluir');
      }

      // Attach: tag aparece em tags do grupo.
      const attached = await apiRequest(app, 'POST', `/api/v1/lab/groups/${first.id}/tags`, {
        body: { tagId: incluir.id },
        cookieValue: ctx.ownerCookie,
      });
      expect(attached.statusCode).toBe(200);
      expect(groupOf(attached.json()).tags).toContain('incluir');
      const regrouped = groupsOf(
        (await fetchGroups(app, ctx.projectId, ctx.ownerCookie)).json(),
      ).find((g) => g.id === first.id);
      expect(regrouped?.tags).toContain('incluir');

      // Divergence: aparece em divergences do grupo.
      const diverged = await apiRequest(
        app,
        'PUT',
        `/api/v1/lab/groups/${first.id}/divergence`,
        {
          body: { source: 'bdtd', note: 'Metadados divergem no ano.' },
          cookieValue: ctx.ownerCookie,
        },
      );
      expect(diverged.statusCode).toBe(200);
      expect(groupOf(diverged.json()).divergences).toEqual([
        { source: 'bdtd', note: 'Metadados divergem no ano.' },
      ]);
      // Nota com HTML é rejeitada na fronteira.
      const htmlNote = await apiRequest(app, 'PUT', `/api/v1/lab/groups/${first.id}/divergence`, {
        body: { source: 'bdtd', note: '<b>negrito</b>' },
        cookieValue: ctx.ownerCookie,
      });
      expect(htmlNote.statusCode).toBe(400);

      // Tag própria: cria → renomeia (nome novo + cor intacta) → limpa cor.
      const created = await apiRequest(app, 'POST', `/api/v1/lab/projects/${ctx.projectId}/tags`, {
        body: { name: 'revisao-fase8', color: 'azul' },
        cookieValue: ctx.ownerCookie,
      });
      expect(created.statusCode).toBe(201);
      const custom = tagOf(created.json());
      expect(custom.color).toBe('azul');
      const renamed = await apiRequest(
        app,
        'PATCH',
        `/api/v1/lab/projects/${ctx.projectId}/tags/${custom.id}`,
        { body: { name: 'revisao-final' }, cookieValue: ctx.ownerCookie },
      );
      expect(renamed.statusCode).toBe(200);
      expect(tagOf(renamed.json()).name).toBe('revisao-final');
      expect(tagOf(renamed.json()).color).toBe('azul');
      const cleared = await apiRequest(
        app,
        'PATCH',
        `/api/v1/lab/projects/${ctx.projectId}/tags/${custom.id}`,
        { body: { color: null }, cookieValue: ctx.ownerCookie },
      );
      expect(cleared.statusCode).toBe(200);
      expect(tagOf(cleared.json()).color).toBeNull();

      // Colisão de nome → 400 VALIDATION_ERROR com details.name; corpo vazio → 400.
      const clash = await apiRequest(
        app,
        'PATCH',
        `/api/v1/lab/projects/${ctx.projectId}/tags/${custom.id}`,
        { body: { name: 'incluir' }, cookieValue: ctx.ownerCookie },
      );
      expect(clash.statusCode).toBe(400);
      expect(errorOf(clash.json()).code).toBe('VALIDATION_ERROR');
      const details = (clash.json() as { error: { details: unknown } }).error.details as Record<
        string,
        unknown
      >;
      expect(details['name']).toBe('Já existe uma tag com este nome.');
      const empty = await apiRequest(
        app,
        'PATCH',
        `/api/v1/lab/projects/${ctx.projectId}/tags/${custom.id}`,
        { body: {}, cookieValue: ctx.ownerCookie },
      );
      expect(empty.statusCode).toBe(400);

      // Delete: 204, some da listagem; segundo delete → 404.
      const deleted = await apiRequest(
        app,
        'DELETE',
        `/api/v1/lab/projects/${ctx.projectId}/tags/${custom.id}`,
        { cookieValue: ctx.ownerCookie },
      );
      expect(deleted.statusCode).toBe(204);
      const afterDelete = tagsOf(
        (
          await apiRequest(app, 'GET', `/api/v1/lab/projects/${ctx.projectId}/tags`, {
            cookieValue: ctx.ownerCookie,
          })
        ).json(),
      );
      expect(afterDelete.map((t) => t.name)).not.toContain('revisao-final');
      const deletedAgain = await apiRequest(
        app,
        'DELETE',
        `/api/v1/lab/projects/${ctx.projectId}/tags/${custom.id}`,
        { cookieValue: ctx.ownerCookie },
      );
      expect(deletedAgain.statusCode).toBe(404);

      // Default excluído NÃO ressuscita no GET seguinte (ensure é seed-if-empty).
      const delDefault = await apiRequest(
        app,
        'DELETE',
        `/api/v1/lab/projects/${ctx.projectId}/tags/${excluir.id}`,
        { cookieValue: ctx.ownerCookie },
      );
      expect(delDefault.statusCode).toBe(204);
      const afterDefault = tagsOf(
        (
          await apiRequest(app, 'GET', `/api/v1/lab/projects/${ctx.projectId}/tags`, {
            cookieValue: ctx.ownerCookie,
          })
        ).json(),
      );
      expect(afterDefault.map((t) => t.name)).not.toContain('excluir');
      expect(afterDefault.map((t) => t.name)).toContain('incluir');

      // Cascade: excluir tag anexada a grupo limpa o join (grupo perde a tag).
      const delAttached = await apiRequest(
        app,
        'DELETE',
        `/api/v1/lab/projects/${ctx.projectId}/tags/${incluir.id}`,
        { cookieValue: ctx.ownerCookie },
      );
      expect(delAttached.statusCode).toBe(204);
      const regroupedAfterCascade = groupsOf(
        (await fetchGroups(app, ctx.projectId, ctx.ownerCookie)).json(),
      ).find((g) => g.id === first.id);
      expect(regroupedAfterCascade?.tags).not.toContain('incluir');
    });

    it('IDOR: estranho e id adulterado recebem 404 identico em todas as rotas', async () => {
      if (!pgAvailable || app === undefined || db === undefined) {
        console.warn('[lab-groups-triage] PG inalcançavel — teste pulado (offline).');
        return;
      }
      const ctx = await setupCtx(app, db, 3);
      const groups = groupsOf((await fetchGroups(app, ctx.projectId, ctx.ownerCookie)).json());
      const first = groups[0];
      if (first === undefined) {
        throw new Error('seed sem grupo');
      }
      const tagList = tagsOf(
        (
          await apiRequest(app, 'GET', `/api/v1/lab/projects/${ctx.projectId}/tags`, {
            cookieValue: ctx.ownerCookie,
          })
        ).json(),
      );
      const someTag = tagList[0];
      if (someTag === undefined) {
        throw new Error('seed sem tag');
      }

      const foreign: Array<{ method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'; url: string; body?: Record<string, unknown> }> = [
        { method: 'GET', url: `/api/v1/lab/projects/${ctx.projectId}/groups` },
        {
          method: 'PUT',
          url: `/api/v1/lab/groups/${first.id}/decision`,
          body: { decision: 'eligible' },
        },
        { method: 'GET', url: `/api/v1/lab/projects/${ctx.projectId}/tags` },
        {
          method: 'POST',
          url: `/api/v1/lab/projects/${ctx.projectId}/tags`,
          body: { name: 'invasora' },
        },
        {
          method: 'PATCH',
          url: `/api/v1/lab/projects/${ctx.projectId}/tags/${someTag.id}`,
          body: { name: 'invadida' },
        },
        { method: 'DELETE', url: `/api/v1/lab/projects/${ctx.projectId}/tags/${someTag.id}` },
        {
          method: 'PUT',
          url: `/api/v1/lab/groups/${first.id}/divergence`,
          body: { source: 'bdtd', note: 'nota estranha' },
        },
        {
          method: 'POST',
          url: `/api/v1/lab/groups/${first.id}/tags`,
          body: { tagId: someTag.id },
        },
      ];
      for (const probe of foreign) {
        const res = await apiRequest(app, probe.method, probe.url, {
          ...(probe.body !== undefined ? { body: probe.body } : {}),
          cookieValue: ctx.strangerCookie,
        });
        expect(res.statusCode).toBe(404);
        expect(errorOf(res.json()).code).toBe('NOT_FOUND');
      }

      const ghost: Array<{ method: 'GET' | 'PUT' | 'PATCH' | 'DELETE'; url: string; body?: Record<string, unknown> }> = [
        { method: 'GET', url: `/api/v1/lab/projects/${GHOST_UUID}/groups` },
        { method: 'PUT', url: `/api/v1/lab/groups/${GHOST_UUID}/decision`, body: { decision: 'eligible' } },
        { method: 'GET', url: `/api/v1/lab/projects/${GHOST_UUID}/tags` },
        {
          method: 'PATCH',
          url: `/api/v1/lab/projects/${ctx.projectId}/tags/${GHOST_UUID}`,
          body: { name: 'fantasma' },
        },
        {
          method: 'PATCH',
          url: `/api/v1/lab/projects/${GHOST_UUID}/tags/${someTag.id}`,
          body: { name: 'fantasma' },
        },
        { method: 'DELETE', url: `/api/v1/lab/projects/${ctx.projectId}/tags/${GHOST_UUID}` },
        {
          method: 'PUT',
          url: `/api/v1/lab/groups/${GHOST_UUID}/divergence`,
          body: { source: 'capes', note: 'nota fantasma' },
        },
      ];
      for (const probe of ghost) {
        const res = await apiRequest(app, probe.method, probe.url, {
          ...(probe.body !== undefined ? { body: probe.body } : {}),
          cookieValue: ctx.ownerCookie,
        });
        expect(res.statusCode).toBe(404);
        expect(errorOf(res.json()).code).toBe('NOT_FOUND');
      }
    });
  },
);
