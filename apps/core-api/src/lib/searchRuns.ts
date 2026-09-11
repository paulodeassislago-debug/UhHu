// apps/core-api — motor de execução de runs de busca (LAB-02/03/04/05, D-28–D-39).
//
// TODA leitura de search/run é escopada por owner via `getSearchForActor` /
// `getRunForActor` (T-03-04-01): fora do escopo → null → a rota vira 404.
// `ownerId`/`createdBy` sempre de `actor.userId`, nunca do body.
//
// Fluxo de `executeSearchRun`:
//  1. escopo (search do ator) → `oasisbr` em sources → SourceDisabledError (400)
//  2. rate-limit próprio D-39: 10 runs/h por usuário, contado no BANCO
//     (`created_by` + `executed_at > now-1h`, sobrevive a restart) → 429
//  3. idempotência D-39: `Idempotency-Key` com janela 24h; mesma key + mesmo
//     corpo → mesmo run (`replayed: true`; a rota responde 200 + header
//     `Idempotent-Replayed: true`); mesma key + corpo diferente → 422
//  4. run `queued` (snapshot congelado + adapter_versions) → `running`
//  5. execução sequencial bdtd→capes com timeout global de fila de 60s (D-29),
//     1 retry com jar renovado após challenge (D-38), pós-filtro e persistência
//  6. status final D-37 (2 ok → succeeded; 1 ok → partial; 0 ok → failed),
//     `newCount` por anti-join (D-35, sem dedup cross-fonte) e `coverage`
//  7. sync/async D-28: este lib SEMPRE executa até o fim (`sync: true`); o
//     CONTROLE 25s vive na ROTA (03-05) via `Promise.race` contra MAX_SYNC_MS
//     (25000) — vencida a race a rota responde 202 e a execução continua em
//     background atualizando a mesma linha (Job=Run 1:1, D-30).
//
// Cancelamento D-29: `cancelRunForActor` transiciona só `queued|running` →
// `cancelled` + `finished_at`, preservando results já persistidos (nunca
// deleta). O executor re-lê o status entre fontes e aborta o restante; o
// UPDATE final é condicional (`status IN (queued,running)`) para o cancel
// concorrente vencer. Condição de corrida aceita no v1 monoprocesso: um
// cancel que chega DURANTE os inserts da última fonte ainda é aplicado (o
// UPDATE condicional do cancel vence ou o final já venceu — nunca ressuscita
// um run cancelled para succeeded, pois o UPDATE final não toca linhas
// `cancelled`), mas as métricas dessa última fonte podem aterrissar via
// update complementar só de métricas. Sem worker dedicado no v1.

import { createHash } from 'node:crypto';
import { and, eq, gt, inArray, ne } from 'drizzle-orm';
import { z } from 'zod';
import type {
  ExecutableSource,
  PerSourceMetrics,
  RunErrorInfo,
  RunMetrics,
  SearchFilters,
  SearchRunDTO,
} from '@uhhu/contracts';
import type { ActorContext } from '@uhhu/core';
import {
  labIdempotencyKeys,
  labResults,
  labSearches,
  labSearchRuns,
  projects,
  type Db,
} from '@uhhu/db';
import {
  getAdapter,
  getSourceAdapter,
  postFilter,
  recordSourceEvent,
  SourceDisabledError,
  type SearchDef,
  type SourcePage,
} from '@uhhu/integrations';
import { getRunForActor, getSearchForActor, toRunDTO } from './searches.js';

const uuidSchema = z.string().uuid();

/**
 * Orçamento sync da rota (D-28): a rota corre `executeSearchRun` contra
 * 25000ms — venceu a race sem concluir → 202 + polling em GET /jobs/:id.
 * Consumido pela ROTA (03-05); este lib executa até o fim.
 */
export const MAX_SYNC_MS = 25000;

/** Timeout global de fila do run (D-29): 60000ms; estouro falha as fontes restantes. */
export const RUN_QUEUE_TIMEOUT_MS = 60000;

/** Header que a rota devolve quando serve um run por replay de idempotência. */
export const IDEMPOTENT_REPLAYED_HEADER = 'Idempotent-Replayed';

/** Rate-limit próprio de execução (D-39): 10 runs/h por usuário, contado no banco. */
const RUN_RATE_LIMIT = 10;
const RUN_RATE_WINDOW_MS = 3_600_000;

/** Janela da idempotência (D-39): 24h. */
const IDEMPOTENCY_TTL_MS = 24 * 3_600_000;

/** Página única por fonte no v1 (cortesia; paginação profunda é pós-v1). */
const RUN_PER_PAGE = 20;

/** Ordem de execução sequencial (cortesia global bdtd→capes). */
const EXECUTION_ORDER: readonly ExecutableSource[] = ['bdtd', 'capes'];

/** Erro de programação/contrato: fonte desabilitada pedida (rota traduz p/ 400 SOURCE_DISABLED). */
export { SourceDisabledError };

/** Quota de execução estourada (rota traduz p/ 429 RATE_LIMITED). */
export class RunRateLimitedError extends Error {
  readonly code = 'RATE_LIMITED' as const;
  readonly statusCode = 429;

  constructor() {
    super('Limite de 10 execuções por hora atingido. Tente novamente mais tarde.');
    this.name = 'RunRateLimitedError';
  }
}

/** Mesma chave de idempotência com corpo diferente (rota traduz p/ 422 IDEMPOTENCY_CONFLICT). */
export class IdempotencyConflictError extends Error {
  readonly code = 'IDEMPOTENCY_CONFLICT' as const;
  readonly statusCode = 422;

  constructor() {
    super('Chave de idempotência reutilizada com corpo diferente.');
    this.name = 'IdempotencyConflictError';
  }
}

export interface ExecuteSearchRunOptions {
  idempotencyKey?: string | undefined;
  fetchFn?: typeof fetch | undefined;
}

export interface ExecuteSearchRunResult {
  run: SearchRunDTO;
  /** Sempre true aqui: o lib executa até o fim; a rota decide 201 vs 202 (D-28). */
  sync: boolean;
  /** True quando o run foi servido por replay de idempotência (sem nova execução). */
  replayed: boolean;
}

function sha256hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/**
 * Corpo canônico da idempotência: JSON estável `{searchId, term, filters,
 * sources}` (chaves de filters em ordem fixa — ordem de inserção do objeto
 * vinda do banco não é confiável para hash).
 */
function canonicalBody(
  searchId: string,
  term: string,
  filters: SearchFilters,
  sources: ExecutableSource[],
): string {
  const orderedFilters: Record<string, unknown> = {};
  if (filters.yearFrom !== undefined) {
    orderedFilters['yearFrom'] = filters.yearFrom;
  }
  if (filters.yearTo !== undefined) {
    orderedFilters['yearTo'] = filters.yearTo;
  }
  if (filters.docTypes !== undefined) {
    orderedFilters['docTypes'] = [...filters.docTypes];
  }
  if (filters.source !== undefined) {
    orderedFilters['source'] = filters.source;
  }
  if (filters.area !== undefined) {
    orderedFilters['area'] = filters.area;
  }
  if (filters.institution !== undefined) {
    orderedFilters['institution'] = filters.institution;
  }
  if (filters.program !== undefined) {
    orderedFilters['program'] = filters.program;
  }
  return JSON.stringify({ searchId, term, filters: orderedFilters, sources: [...sources] });
}

function toSearchDef(term: string, filters: SearchFilters): SearchDef {
  const def: SearchDef = { term };
  if (filters.yearFrom !== undefined) {
    def.yearFrom = filters.yearFrom;
  }
  if (filters.yearTo !== undefined) {
    def.yearTo = filters.yearTo;
  }
  if (filters.docTypes !== undefined) {
    def.docTypes = [...filters.docTypes];
  }
  if (filters.area !== undefined) {
    def.area = filters.area;
  }
  if (filters.institution !== undefined) {
    def.institution = filters.institution;
  }
  if (filters.program !== undefined) {
    def.program = filters.program;
  }
  return def;
}

function skippedMetrics(): PerSourceMetrics {
  return { status: 'skipped', total: 0, returned: 0, durationMs: 0 };
}

function emptyMetrics(): RunMetrics {
  return {
    perSource: { bdtd: skippedMetrics(), capes: skippedMetrics() },
    newCount: 0,
    coverage: { bdtd: 0, capes: 0 },
  };
}

async function readRunStatus(db: Db, runId: string): Promise<string | null> {
  const rows = await db
    .select({ status: labSearchRuns.status })
    .from(labSearchRuns)
    .where(eq(labSearchRuns.id, runId))
    .limit(1);
  const row = rows[0];
  return row === undefined ? null : row.status;
}

/**
 * Executa uma busca criando um SearchRun temporal. Retorna null quando a
 * search está fora do escopo do ator (rota vira 404). Ids vêm do PG
 * `defaultRandom()` (CSPRNG); idempotência usa sha256 — sem aleatoriedade fraca.
 */
export async function executeSearchRun(
  db: Db,
  actor: ActorContext,
  searchId: string,
  opts: ExecuteSearchRunOptions = {},
): Promise<ExecuteSearchRunResult | null> {
  if (!uuidSchema.safeParse(searchId).success) {
    return null;
  }
  const search = await getSearchForActor(db, actor, searchId);
  if (search === null) {
    return null;
  }

  // D-33: `oasisbr` desabilitada no registry → 400 na rota. O DTO filtra para
  // executáveis, então a checagem é na linha crua (defesa contra dado legado).
  const rawRows = await db
    .select({ sources: labSearches.sources })
    .from(labSearches)
    .innerJoin(projects, eq(labSearches.projectId, projects.id))
    .where(and(eq(labSearches.id, searchId), eq(projects.ownerId, actor.userId)))
    .limit(1);
  const rawRow = rawRows[0];
  const rawSources: readonly string[] = rawRow === undefined ? [] : rawRow.sources;
  if (rawSources.includes('oasisbr')) {
    throw new SourceDisabledError('oasisbr');
  }

  // D-39: rate-limit próprio contado no BANCO (sobrevive a restart).
  const windowStart = new Date(Date.now() - RUN_RATE_WINDOW_MS);
  const recentRuns = await db
    .select({ id: labSearchRuns.id })
    .from(labSearchRuns)
    .where(
      and(eq(labSearchRuns.createdBy, actor.userId), gt(labSearchRuns.executedAt, windowStart)),
    );
  if (recentRuns.length >= RUN_RATE_LIMIT) {
    throw new RunRateLimitedError();
  }

  // D-39: idempotência 24h. Chave estável por usuário+key (`sha256(userId|key)`)
  // e corpo separado (`sha256(canonicalBody)`): incluir o corpo NA chave
  // tornaria o ramo 422 inalcançável (corpo diferente → hash diferente → miss
  // em vez de conflito), por isso chave e corpo são hashes independentes.
  const body = canonicalBody(search.id, search.term, search.filters, search.sources);
  const bodyHash = sha256hex(body);
  const rawKey = opts.idempotencyKey;
  let keyHash: string | null = null;
  if (rawKey !== undefined && rawKey.length > 0) {
    keyHash = sha256hex(`${actor.userId}|${rawKey}`);
    const now = new Date();
    const entries = await db
      .select()
      .from(labIdempotencyKeys)
      .where(eq(labIdempotencyKeys.keyHash, keyHash))
      .limit(1);
    const entry = entries[0];
    if (entry !== undefined && entry.expiresAt > now) {
      if (entry.bodyHash !== bodyHash) {
        throw new IdempotencyConflictError();
      }
      if (entry.runId !== null) {
        const replayed = await getRunForActor(db, actor, entry.runId);
        if (replayed !== null) {
          return { run: replayed, sync: true, replayed: true };
        }
        // Run sumiu (cascade) — cai para re-execução e re-vincula a chave.
      }
    }
  }

  const adapterVersions: Record<string, string> = {
    bdtd: getSourceAdapter('bdtd').version,
    capes: getSourceAdapter('capes').version,
  };
  const executedAt = new Date();
  const inserted = await db
    .insert(labSearchRuns)
    .values({
      searchId: search.id,
      createdBy: actor.userId,
      status: 'queued',
      termSnapshot: search.term,
      filtersSnapshot: search.filters,
      sourcesSnapshot: search.sources,
      executedAt,
      metrics: emptyMetrics(),
      adapterVersions,
    })
    .returning();
  const created = inserted[0];
  if (created === undefined) {
    throw new Error('search run insert did not return row');
  }
  const runId = created.id;

  if (keyHash !== null) {
    await db
      .insert(labIdempotencyKeys)
      .values({
        keyHash,
        userId: actor.userId,
        bodyHash,
        runId,
        expiresAt: new Date(executedAt.getTime() + IDEMPOTENCY_TTL_MS),
      })
      .onConflictDoUpdate({
        target: labIdempotencyKeys.keyHash,
        set: {
          bodyHash,
          runId,
          expiresAt: new Date(executedAt.getTime() + IDEMPOTENCY_TTL_MS),
        },
      });
  }

  await db
    .update(labSearchRuns)
    .set({ status: 'running', startedAt: new Date() })
    .where(eq(labSearchRuns.id, runId));

  const def = toSearchDef(search.term, search.filters);
  const orderedSources = EXECUTION_ORDER.filter((source) => search.sources.includes(source));
  const perSource: Record<'bdtd' | 'capes', PerSourceMetrics> = {
    bdtd: skippedMetrics(),
    capes: skippedMetrics(),
  };
  const okParts: string[] = [];
  const failParts: string[] = [];
  let cancelledSeen = false;

  const controller = new AbortController();
  const queueTimer = setTimeout(() => {
    controller.abort();
  }, RUN_QUEUE_TIMEOUT_MS);
  try {
    for (const source of orderedSources) {
      const statusBefore = await readRunStatus(db, runId);
      if (statusBefore === 'cancelled' || statusBefore === null) {
        cancelledSeen = statusBefore === 'cancelled';
        break;
      }
      if (controller.signal.aborted) {
        perSource[source] = { status: 'failed', total: 0, returned: 0, durationMs: 0 };
        failParts.push(`${source} indisponível (tempo esgotado)`);
        await recordSourceEvent(db, source, false, false);
        continue;
      }

      const startedSource = Date.now();
      const adapter = getSourceAdapter(source);
      const { client } = getAdapter(source);
      const ctx = {
        signal: controller.signal as AbortSignal,
        ...(opts.fetchFn !== undefined ? { fetchFn: opts.fetchFn } : {}),
      };
      const attemptOnce = async (): Promise<SourcePage> => {
        try {
          return await adapter.search(client, def, { page: 1, perPage: RUN_PER_PAGE }, ctx);
        } catch {
          // RangeTooWideError / transporte / parse inesperado: fonte failed
          // (D-37), nunca derruba o run nem a outra fonte.
          return { total: null, items: [], sourceStatus: 'failed' };
        }
      };

      let page = await attemptOnce();
      let challengeSeen = page.sourceStatus === 'challenge';
      if (challengeSeen && !controller.signal.aborted) {
        // D-38: jar já renovado pelo SourceClient — 1 retry único com jar novo.
        page = await attemptOnce();
        challengeSeen = true;
      }
      const durationMs = Date.now() - startedSource;

      if (page.sourceStatus !== 'ok') {
        perSource[source] = { status: 'failed', total: 0, returned: 0, durationMs };
        const reason = controller.signal.aborted
          ? 'tempo esgotado'
          : challengeSeen
            ? 'bloqueio anti-robô'
            : 'indisponível';
        failParts.push(`${source} ${reason}`);
        await recordSourceEvent(db, source, false, challengeSeen);
        continue;
      }

      const filtered = postFilter(page.items, def);
      const kept = filtered.kept;
      if (kept.length > 0) {
        const rowsToInsert = [];
        for (let index = 0; index < kept.length; index += 1) {
          const item = kept[index];
          if (item === undefined) {
            continue;
          }
          rowsToInsert.push({
            runId,
            source,
            sourceId: item.sourceId,
            title: item.title,
            authors: item.authors,
            year: item.year,
            docType: item.docType,
            institution: item.institution,
            program: item.program,
            abstract: item.abstract,
            originUrl: item.originUrl,
            sourceUrl: item.sourceUrl,
            rawMetadata: item.rawMetadata,
            rank: index,
          });
        }
        if (rowsToInsert.length > 0) {
          await db
            .insert(labResults)
            .values(rowsToInsert)
            .onConflictDoNothing({
              target: [labResults.runId, labResults.source, labResults.sourceId],
            });
        }
      }
      const total = page.total ?? kept.length;
      perSource[source] = { status: 'ok', total, returned: kept.length, durationMs };
      okParts.push(`${source} ok (${String(kept.length)} resultados)`);
      await recordSourceEvent(db, source, true, challengeSeen);
    }
  } finally {
    clearTimeout(queueTimer);
  }

  // D-35: "novos" = (source,sourceId) ausentes em TODOS os runs anteriores da
  // mesma search (anti-join; sem dedup cross-fonte — overlap exato é Phase 4).
  // coverage = counts do run atual por fonte.
  const priorRows = await db
    .select({ source: labResults.source, sourceId: labResults.sourceId })
    .from(labResults)
    .innerJoin(labSearchRuns, eq(labResults.runId, labSearchRuns.id))
    .where(and(eq(labSearchRuns.searchId, search.id), ne(labSearchRuns.id, runId)));
  const seen = new Set(priorRows.map((row) => `${row.source}|${row.sourceId}`));
  const currentRows = await db
    .select({ source: labResults.source, sourceId: labResults.sourceId })
    .from(labResults)
    .where(eq(labResults.runId, runId));
  let newCount = 0;
  const coverage: { bdtd: number; capes: number } = { bdtd: 0, capes: 0 };
  for (const row of currentRows) {
    if (row.source === 'bdtd') {
      coverage.bdtd += 1;
    } else if (row.source === 'capes') {
      coverage.capes += 1;
    }
    if (!seen.has(`${row.source}|${row.sourceId}`)) {
      newCount += 1;
    }
  }

  const metrics: RunMetrics = { perSource, newCount, coverage };
  const executedCount = orderedSources.length;
  const okCount = okParts.length;
  let finalStatus: 'succeeded' | 'partial' | 'failed' | 'cancelled';
  let error: RunErrorInfo | null = null;
  if (cancelledSeen) {
    finalStatus = 'cancelled';
  } else if (okCount > 0 && okCount === executedCount) {
    finalStatus = 'succeeded';
  } else if (okCount > 0) {
    finalStatus = 'partial';
    // T-03-04-04: detalhe por fonte SEM cookies/hosts internos/corpos.
    error = {
      code: 'SOURCE_UNAVAILABLE',
      message: `Busca parcial: ${okParts.join('; ')}; ${failParts.join('; ')}. Resultados válidos foram preservados.`,
    };
  } else {
    finalStatus = 'failed';
    error = {
      code: 'SOURCE_UNAVAILABLE',
      message: `Busca falhou em todas as fontes executadas (${failParts.join('; ')}). Tente novamente em instantes.`,
    };
  }

  // UPDATE condicional: um cancel concorrente (status `cancelled`) vence — a
  // linha nunca ressuscita para succeeded/partial/failed por este update.
  await db
    .update(labSearchRuns)
    .set({ status: finalStatus, finishedAt: new Date(), metrics, error })
    .where(and(eq(labSearchRuns.id, runId), inArray(labSearchRuns.status, ['queued', 'running'])));
  // Complementar só de métricas (sem tocar status): cobre o caso em que o
  // cancel venceu a corrida mas esta execução apurou métricas úteis.
  await db.update(labSearchRuns).set({ metrics }).where(eq(labSearchRuns.id, runId));

  const finalRows = await db
    .select()
    .from(labSearchRuns)
    .where(eq(labSearchRuns.id, runId))
    .limit(1);
  const finalRow = finalRows[0];
  if (finalRow === undefined) {
    throw new Error('search run vanished mid-execution');
  }
  return { run: toRunDTO(finalRow), sync: true, replayed: false };
}

export interface CancelRunResult {
  run: SearchRunDTO;
  cancelled: boolean;
}

/**
 * Cancela um run `queued|running` (D-29): marca `cancelled` + `finished_at`,
 * preservando results já persistidos (nunca deleta). Fora do escopo → null
 * (rota 404). Já terminal → `{cancelled: false}` com o run atual.
 */
export async function cancelRunForActor(
  db: Db,
  actor: ActorContext,
  runId: string,
): Promise<CancelRunResult | null> {
  if (!uuidSchema.safeParse(runId).success) {
    return null;
  }
  const current = await getRunForActor(db, actor, runId);
  if (current === null) {
    return null;
  }
  if (current.status !== 'queued' && current.status !== 'running') {
    return { run: current, cancelled: false };
  }
  const updated = await db
    .update(labSearchRuns)
    .set({ status: 'cancelled', finishedAt: new Date() })
    .where(and(eq(labSearchRuns.id, runId), inArray(labSearchRuns.status, ['queued', 'running'])))
    .returning();
  const row = updated[0];
  if (row === undefined) {
    const reread = await getRunForActor(db, actor, runId);
    if (reread === null) {
      return null;
    }
    return { run: reread, cancelled: false };
  }
  return { run: toRunDTO(row), cancelled: true };
}
