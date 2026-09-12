// apps/lab — histórico expansível de runs no card (D-11/D-12, UI-16, 07-04 task 1).
//
// `RunHistory({ searchId, projectId, getToken })`: botão cabeçalho
// `Histórico (N) ▸/▾` (N do primeiro fetch, "+" quando há mais páginas) que
// expande/colapsa a lista (useState, default colapsado). Expandido: entradas
// tocáveis paginadas (limit 20 + "Ver mais" com cursor, append manual).
// - Cada entrada: linha 1 `DD/MM HH:MM · <rótulo PT> · <total> resultados`
//   (total = coverage.bdtd + coverage.capes), linha 2 `+<newCount> novos ·
//   <duração>` (duração via formatDurationMs reutilizado de useRunPolling),
//   linha 3 quando há fonte faltante ou run parcial:
//   `faltou: <fontes failed/skipped>` + motivo error.message quando presente.
// - Toque na entrada → rota do run como string
//   `/project/<projectId>/run?runId=<runId>&searchId=<searchId>` (sem importar
//   a tela; o run abre os resultados — placeholder fase 8).
// - Helpers puros (formatRunWhen, summarizeRun) vivem em ./runHistory (módulo
//   sem imports nativos, testável no vitest); este componente só os consome.
// - Estados: carregando → texto "carregando histórico…" junto ao botão (sem
//   indicador solitário); erro → texto + [tentar de novo] (refaz o listRuns);
//   vazio → "Nenhuma execução ainda". 401 aparece verbatim com retry — sem
//   redirect surpresa a partir de um widget colapsável (a lista de estratégias
//   já trata sessão expirada).
// - Rótulos e duração reutilizados de useRunPolling (import, sem copiar o
//   mapa). Guards são UX; autorização real continua no CORE.
//   Text escapa por padrão; sem WebView; sem eval.

import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import type { JSX } from 'react';
import { Button, Pressable, Text, View } from 'react-native';
import type { SearchRunDTO } from '@uhhu/contracts';
import { ApiError } from '../api/client';
import type { TokenProvider } from '../api/client';
import { labApi } from '../api/lab';
import { formatRunWhen, summarizeRun } from './runHistory';
import type { RunSummary } from './runHistory';
import { formatDurationMs, runStatusLabel } from './useRunPolling';

export interface RunHistoryProps {
  searchId: string;
  projectId: string;
  getToken: TokenProvider;
}

const RUN_HISTORY_PAGE_SIZE = 20;

type HistoryLoadState = 'loading' | 'ready' | 'error';

export function RunHistory({ searchId, projectId, getToken }: RunHistoryProps): JSX.Element {
  const router = useRouter();
  const [expanded, setExpanded] = useState<boolean>(false);
  const [items, setItems] = useState<SearchRunDTO[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState<boolean>(false);
  const [loadState, setLoadState] = useState<HistoryLoadState>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState<number>(0);

  useEffect(() => {
    let cancelled = false;
    async function fetchFirst(): Promise<void> {
      setLoadState('loading');
      setErrorMessage(null);
      try {
        const res = await labApi.listRuns(
          searchId,
          { limit: RUN_HISTORY_PAGE_SIZE },
          { getToken },
        );
        if (cancelled) {
          return;
        }
        setItems(res.items);
        setNextCursor(res.page.nextCursor);
        setHasMore(res.page.hasMore);
        setLoadState('ready');
      } catch (error: unknown) {
        if (cancelled) {
          return;
        }
        if (error instanceof ApiError) {
          setErrorMessage(error.message);
        } else if (error instanceof Error) {
          setErrorMessage(error.message);
        } else {
          setErrorMessage('Erro interno. Tente novamente.');
        }
        setLoadState('error');
      }
    }
    void fetchFirst();
    return (): void => {
      cancelled = true;
    };
  }, [searchId, getToken, reloadNonce]);

  async function handleLoadMore(): Promise<void> {
    if (nextCursor === null || loadingMore) {
      return;
    }
    setLoadMoreError(null);
    setLoadingMore(true);
    try {
      const res = await labApi.listRuns(
        searchId,
        { limit: RUN_HISTORY_PAGE_SIZE, cursor: nextCursor },
        { getToken },
      );
      setItems((prev: SearchRunDTO[]): SearchRunDTO[] => [...prev, ...res.items]);
      setNextCursor(res.page.nextCursor);
      setHasMore(res.page.hasMore);
    } catch (error: unknown) {
      if (error instanceof ApiError) {
        setLoadMoreError(error.message);
      } else if (error instanceof Error) {
        setLoadMoreError(error.message);
      } else {
        setLoadMoreError('Erro interno. Tente novamente.');
      }
    } finally {
      setLoadingMore(false);
    }
  }

  function handleOpenRun(runId: string): void {
    router.push(`/project/${projectId}/run?runId=${runId}&searchId=${searchId}`);
  }

  const headerTitle =
    loadState === 'loading' && items.length === 0
      ? 'Histórico'
      : `Histórico (${items.length}${hasMore ? '+' : ''})`;

  return (
    <View style={{ gap: 4 }}>
      <Button
        title={`${headerTitle} ${expanded ? '▾' : '▸'}`}
        onPress={() => setExpanded((prev: boolean): boolean => !prev)}
      />
      {loadState === 'loading' && items.length === 0 ? (
        <Text>carregando histórico…</Text>
      ) : null}
      {loadState === 'error' ? (
        <View style={{ gap: 4 }}>
          <Text>{errorMessage ?? 'Erro interno. Tente novamente.'}</Text>
          <Button
            title="tentar de novo"
            onPress={() => setReloadNonce((nonce: number): number => nonce + 1)}
          />
        </View>
      ) : null}
      {loadState === 'ready' && items.length === 0 ? (
        <Text>Nenhuma execução ainda</Text>
      ) : null}
      {expanded && loadState === 'ready' && items.length > 0 ? (
        <View style={{ gap: 8 }}>
          {items.map((run: SearchRunDTO): JSX.Element => {
            const summary: RunSummary = summarizeRun(run);
            const duration: string = formatDurationMs(
              summary.startedAt,
              summary.finishedAt,
              Date.now(),
            );
            const showMissing: boolean = summary.missing.length > 0 || run.status === 'partial';
            const missingLine: string =
              summary.missing.length > 0
                ? `faltou: ${summary.missing.join(', ')}`
                : 'faltou: —';
            const motiveSuffix: string =
              run.error !== null && run.error.message.length > 0
                ? ` · ${run.error.message}`
                : '';
            return (
              <Pressable key={run.id} onPress={() => handleOpenRun(run.id)}>
                <View style={{ gap: 2, paddingVertical: 4 }}>
                  <Text>
                    {formatRunWhen(run.executedAt)} · {runStatusLabel(run.status)} ·{' '}
                    {summary.total} resultados
                  </Text>
                  <Text>
                    +{summary.newCount} novos · {duration}
                  </Text>
                  {showMissing ? (
                    <Text>
                      {missingLine}
                      {motiveSuffix}
                    </Text>
                  ) : null}
                </View>
              </Pressable>
            );
          })}
          {hasMore ? (
            <View style={{ gap: 2 }}>
              <Button
                title={loadingMore ? 'carregando…' : 'Ver mais'}
                onPress={() => void handleLoadMore()}
                disabled={loadingMore}
              />
              {loadMoreError !== null ? <Text>{loadMoreError}</Text> : null}
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
