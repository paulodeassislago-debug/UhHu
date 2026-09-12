// apps/lab — polling automático da execução (D-07/D-08, UI-14, 07-03 task 1).
//
// `useRunPolling(runId, getToken)` acompanha o run no servidor via labApi.getRun:
// getRun imediato + intervalo fixo de 2500ms; para (clearInterval) em estado
// terminal, no teto de 240 tentativas (240 × 2500ms = 10 min → 'timeout') e no
// unmount.
// - Helpers testáveis desta unidade:
//   isTerminalStatus (os 4 estados terminais do contrato),
//   runStatusLabel (os 6 rótulos PT da tela),
//   formatDurationMs (duração exibida no cabeçalho).
// - Erro de rede num poll mantém o último run e conta falhas seguidas: 3 seguidas
//   → pollState 'error' (nova tentativa só manual via retry, sem auto-retry
//   infinito; T-07-03-01). 401 vira 'error' imediato (a tela redireciona ao login
//   com next; repetir o request daria o mesmo 401).
// - O cleanup do unmount LIMPA SÓ O TIMER e nunca encerra a execução no servidor
//   (D-08: o run vive no servidor; sair da tela não abandona a execução — voltar
//   = novo mount retoma do getRun atual; por isso este hook nunca chama cancelJob).
// Tipos em definição única via `import type` de @uhhu/contracts; TokenProvider
// via `import type` do client. Guards são UX; autorização real continua no CORE.

import { useCallback, useEffect, useState } from 'react';
import type { RunStatus, SearchRunDTO } from '@uhhu/contracts';
import { ApiError } from '../api/client';
import type { TokenProvider } from '../api/client';
import { labApi } from '../api/lab';

// Intervalo fixo de polling: 2500ms (D-07; sem backoff nesta versão).
export const RUN_POLL_INTERVAL_MS = 2500;

// Teto de acompanhamento: 240 tentativas ≈ 10 min → pollState 'timeout'
// ("Acompanhamento excedido — reabra a tela"; T-07-03-01).
export const RUN_POLL_MAX_POLLS = 240;

// Falhas de rede seguidas antes de desistir de polir sozinho (a 3ª vira 'error'
// com Repetir manual; o último run conhecido é preservado).
const RUN_POLL_MAX_ERRORS = 3;

// Verdadeiro para os 4 estados terminais do contrato (queued/running seguem).
export function isTerminalStatus(status: RunStatus): boolean {
  return (
    status === 'succeeded' ||
    status === 'partial' ||
    status === 'failed' ||
    status === 'cancelled'
  );
}

const RUN_STATUS_LABELS: Record<RunStatus, string> = {
  queued: 'na fila',
  running: 'executando',
  succeeded: 'ok',
  partial: 'parcial',
  failed: 'falha',
  cancelled: 'cancelada',
};

// Rótulo PT-BR do status do run (usado no cabeçalho e no histórico).
export function runStatusLabel(status: RunStatus): string {
  return RUN_STATUS_LABELS[status];
}

// Duração exibida: "—" sem início; senão segundos arredondados. finishedAt ausente
// (run em andamento) → mede até `now` (epoch ms, em geral Date.now() da tela).
export function formatDurationMs(
  startedAt: string | null,
  finishedAt: string | null,
  now: number,
): string {
  if (startedAt === null || startedAt.length === 0) {
    return '—';
  }
  const startMs: number = Date.parse(startedAt);
  if (Number.isNaN(startMs)) {
    return '—';
  }
  const endMs: number =
    finishedAt !== null && finishedAt.length > 0 ? Date.parse(finishedAt) : now;
  if (Number.isNaN(endMs)) {
    return '—';
  }
  const diffMs: number = endMs - startMs;
  const clampedMs: number = diffMs < 0 ? 0 : diffMs;
  return `${Math.round(clampedMs / 1000)}s`;
}

export type RunPollState = 'loading' | 'polling' | 'terminal' | 'timeout' | 'error';

export interface RunPolling {
  run: SearchRunDTO | null;
  pollState: RunPollState;
  error: ApiError | null;
  elapsedPolls: number;
  retry: () => void;
}

export function useRunPolling(runId: string, getToken: TokenProvider): RunPolling {
  const [run, setRun] = useState<SearchRunDTO | null>(null);
  const [pollState, setPollState] = useState<RunPollState>('loading');
  const [error, setError] = useState<ApiError | null>(null);
  const [elapsedPolls, setElapsedPolls] = useState<number>(0);
  const [retryNonce, setRetryNonce] = useState<number>(0);

  const retry = useCallback((): void => {
    setRetryNonce((nonce: number): number => nonce + 1);
  }, []);

  useEffect(() => {
    if (runId.length === 0) {
      setRun(null);
      setError(new ApiError(400, 'INVALID_RUN', 'Execução inválida.', ''));
      setPollState('error');
      return;
    }
    let stopped = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    let polls = 0;
    let consecutiveErrors = 0;

    function finish(): void {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    }

    async function pollOnce(): Promise<void> {
      if (stopped) {
        return;
      }
      polls += 1;
      const seen: number = polls;
      setElapsedPolls(seen);
      try {
        const dto: SearchRunDTO = await labApi.getRun(runId, { getToken });
        if (stopped) {
          return;
        }
        consecutiveErrors = 0;
        setRun(dto);
        setError(null);
        if (isTerminalStatus(dto.status)) {
          setPollState('terminal');
          finish();
          return;
        }
        if (seen >= RUN_POLL_MAX_POLLS) {
          setPollState('timeout');
          finish();
          return;
        }
        setPollState('polling');
      } catch (unknownError: unknown) {
        if (stopped) {
          return;
        }
        const apiError: ApiError =
          unknownError instanceof ApiError
            ? unknownError
            : new ApiError(
                0,
                'INTERNAL_ERROR',
                unknownError instanceof Error ? unknownError.message : 'Erro interno. Tente novamente.',
                '',
              );
        consecutiveErrors += 1;
        // 401 interrompe de imediato (a tela trata como sessão expirada); demais
        // erros só após 3 seguidos. O último run conhecido é mantido.
        if (apiError.status === 401 || consecutiveErrors >= RUN_POLL_MAX_ERRORS) {
          setError(apiError);
          setPollState('error');
          finish();
          return;
        }
        if (seen >= RUN_POLL_MAX_POLLS) {
          setPollState('timeout');
          finish();
        }
      }
    }

    setRun(null);
    setError(null);
    setElapsedPolls(0);
    setPollState('loading');
    void pollOnce();
    timer = setInterval((): void => {
      void pollOnce();
    }, RUN_POLL_INTERVAL_MS);
    return (): void => {
      stopped = true;
      if (timer !== null) {
        clearInterval(timer);
      }
      // D-08: o cleanup limpa SÓ o timer local — nunca chama cancelJob no
      // servidor. Sair da tela não abandona o run; voltar remonta o hook e o
      // getRun imediato retoma o estado atual do servidor.
    };
  }, [runId, getToken, retryNonce]);

  return { run, pollState, error, elapsedPolls, retry };
}
