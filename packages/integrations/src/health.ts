// packages/integrations — health de fontes (fronteira integrations→observabilidade).
//
// Semantica numerica fixa (discrição concretizada, D-38): janela = ultimos 50
// eventos da fonte OU ultima 1h (o que cobrir menos, via WHERE+ORDER+LIMIT);
// 0 eventos -> ok; failureRate 0 -> ok; <0.5 -> degraded; >=0.5 -> offline.
// Evento de challenge conta em challenges E em failed. O retorno expoe so
// counts + status + checkedAt ISO, nunca conteudo sensivel. `recordSourceEvent`
// insere 1 linha (chamado pelo executor 03-04, nao por este modulo).

import { and, desc, eq, gt } from 'drizzle-orm';
import { labSourceEvents, type Db } from '@uhhu/db';
import type { LabSource, SourceHealthDTO, SourceHealthStatus } from '@uhhu/contracts';

/** Janela do health: ate 50 eventos, somente da ultima hora. */
const HEALTH_WINDOW_EVENTS = 50;
const HEALTH_WINDOW_MS = 3_600_000;

/** failureRate >= 0.5 e offline; (0, 0.5) e degraded; 0 e ok. */
const FAILURE_THRESHOLD = 0.5;

function statusOf(failureRate: number): SourceHealthStatus {
  if (failureRate === 0) {
    return 'ok';
  }
  if (failureRate < FAILURE_THRESHOLD) {
    return 'degraded';
  }
  return 'offline';
}

/** Computa ok|degraded|offline a partir dos eventos recentes da fonte. */
export async function computeSourceHealth(
  db: Db,
  source: LabSource,
  now: Date = new Date(),
): Promise<SourceHealthDTO> {
  const since = new Date(now.getTime() - HEALTH_WINDOW_MS);
  const rows = await db
    .select({ ok: labSourceEvents.ok, isChallenge: labSourceEvents.isChallenge })
    .from(labSourceEvents)
    .where(and(eq(labSourceEvents.source, source), gt(labSourceEvents.at, since)))
    .orderBy(desc(labSourceEvents.at))
    .limit(HEALTH_WINDOW_EVENTS);

  const total = rows.length;
  if (total === 0) {
    return {
      source,
      status: 'ok',
      checkedAt: now.toISOString(),
      recent: { total: 0, ok: 0, failed: 0, challenges: 0 },
    };
  }
  let challenges = 0;
  let failed = 0;
  for (const row of rows) {
    if (row.isChallenge) {
      challenges += 1;
    }
    if (!row.ok || row.isChallenge) {
      failed += 1;
    }
  }
  const status = statusOf(failed / total);
  return {
    source,
    status,
    checkedAt: now.toISOString(),
    recent: { total, ok: total - failed, failed, challenges },
  };
}

/** Registra 1 evento de fonte (chamado pelo executor apos cada tentativa). */
export async function recordSourceEvent(
  db: Db,
  source: LabSource,
  ok: boolean,
  isChallenge: boolean,
): Promise<void> {
  await db.insert(labSourceEvents).values({ source, ok, isChallenge });
}
