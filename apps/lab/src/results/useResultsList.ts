// apps/lab — lista infinita de resultados com join e filtros (08-02, D-16/D-17).
//
// `useResultsList({ runId, projectId, getToken })`: fetch inicial
// `listResults(runId, { limit: 30 })` + `listGroups(projectId, { limit: 100 })`
// seguindo cursor até `hasMore` false; estado com itens já unidos
// (TriagedItem via triage); filtros GroupFilter com default aberto;
// visíveis via applyResultFilters; `loadMore` pagina por `page.nextCursor`
// com append (threshold 0.5 na tela, guarda `loadingMore`, sem botão de
// paginar, sem páginas numeradas); `refresh` refaz tudo (pós-decisão futura).
// Erro inicial carrega status para a tela exibir ErrorBanner com tentar de
// novo; vazio a tela exibe Empty verbatim; 401 a tela redireciona com
// expired e next (guards são UX; authZ real no CORE). Sem `any`.

import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  DedupGroupDTO,
  FetchMoreResult,
  PageInfo,
  ResultDTO,
  SearchRunDTO,
} from '@uhhu/contracts';
import { ApiError } from '../api/client';
import type { TokenProvider } from '../api/client';
import { labApi } from '../api/lab';
import type { ProjectTag } from '../api/lab';
import { applyResultFilters, buildResultGroupIndex, mergeResultsWithGroups } from './triage';
import { DEFAULT_GROUP_FILTER } from './triage';
import type { GroupFilter, TriagedItem } from './triage';
import { fetchMoreAvailability, shouldStartFetchMore } from './fetchMore';
import type { FetchMoreAvailability } from './fetchMore';

const RESULTS_PAGE_SIZE = 30;
const GROUPS_PAGE_SIZE = 100;

export interface UseResultsListParams {
  runId: string;
  projectId: string;
  getToken: TokenProvider;
}

export interface ResultsListError {
  message: string;
  requestId: string | null;
  status: number | null;
}

export interface UseResultsListResult {
  allItems: TriagedItem[];
  visibleItems: TriagedItem[];
  filters: GroupFilter;
  patchFilters: (patch: Partial<GroupFilter>) => void;
  loading: boolean;
  loadingMore: boolean;
  error: ResultsListError | null;
  loadMoreError: ResultsListError | null;
  hasMore: boolean;
  nextCursor: string | null;
  newCount: number;
  total: number;
  tags: ProjectTag[];
  // BUSCAR MAIS incremental (08-07): run fresco (totalKnown/hasMore do
  // servidor) + lote sob demanda com reload que preserva a posição (o
  // replace é por superset com o mesmo prefixo — sem pular ao topo).
  runInfo: FetchMoreAvailability | null;
  fetchMoreLoading: boolean;
  fetchMoreError: ResultsListError | null;
  fetchMore: () => Promise<void>;
  refresh: () => void;
  loadMore: () => Promise<void>;
}

function toListError(error: unknown): ResultsListError {
  if (error instanceof ApiError) {
    return {
      message: error.message,
      requestId: error.requestId !== '' ? error.requestId : null,
      status: error.status,
    };
  }
  if (error instanceof Error) {
    return { message: error.message, requestId: null, status: null };
  }
  return { message: 'Erro interno. Tente novamente.', requestId: null, status: null };
}

export function useResultsList({
  runId,
  projectId,
  getToken,
}: UseResultsListParams): UseResultsListResult {
  const [allItems, setAllItems] = useState<TriagedItem[]>([]);
  const [groupIndex, setGroupIndex] = useState<Map<string, DedupGroupDTO>>(
    () => new Map<string, DedupGroupDTO>(),
  );
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState<boolean>(false);
  const [total, setTotal] = useState<number>(0);
  const [newCount, setNewCount] = useState<number>(0);
  const [tags, setTags] = useState<ProjectTag[]>([]);
  const [run, setRun] = useState<SearchRunDTO | null>(null);
  const [fetchMoreLoading, setFetchMoreLoading] = useState<boolean>(false);
  const [fetchMoreError, setFetchMoreError] = useState<ResultsListError | null>(null);
  const [filters, setFilters] = useState<GroupFilter>(DEFAULT_GROUP_FILTER);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
  const [error, setError] = useState<ResultsListError | null>(null);
  const [loadMoreError, setLoadMoreError] = useState<ResultsListError | null>(null);
  const [nonce, setNonce] = useState<number>(0);

  useEffect(() => {
    if (runId.length === 0 || projectId.length === 0) {
      setAllItems([]);
      setHasMore(false);
      setNextCursor(null);
      setTotal(0);
      setNewCount(0);
      setRun(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    async function loadInitial(): Promise<void> {
      setLoading(true);
      setError(null);
      setLoadMoreError(null);
      setFetchMoreError(null);
      try {
        const groups: DedupGroupDTO[] = [];
        let groupsCursor: string | undefined = undefined;
        for (;;) {
          const page: { items: DedupGroupDTO[]; page: PageInfo } =
            groupsCursor === undefined
              ? await labApi.listGroups(projectId, { limit: GROUPS_PAGE_SIZE }, { getToken })
              : await labApi.listGroups(
                  projectId,
                  { limit: GROUPS_PAGE_SIZE, cursor: groupsCursor },
                  { getToken },
                );
          groups.push(...page.items);
          if (!page.page.hasMore || page.page.nextCursor === null) {
            break;
          }
          groupsCursor = page.page.nextCursor;
        }
        if (cancelled) {
          return;
        }
        const index = buildResultGroupIndex(groups);
        setGroupIndex(index);
        try {
          const tagList: ProjectTag[] = await labApi.listProjectTags(projectId, { getToken });
          if (!cancelled) {
            setTags(tagList);
          }
        } catch (tagError: unknown) {
          if (tagError instanceof ApiError && tagError.status === 401) {
            throw tagError;
          }
          if (!cancelled) {
            setTags([]);
          }
        }
        if (cancelled) {
          return;
        }
        // Run fresco: totalKnown/hasMore do servidor (Y do "X de Y" e do
        // botão). 401 sobe (a tela redireciona com expired+next).
        const fresh = await labApi.getRun(runId, { getToken });
        if (cancelled) {
          return;
        }
        setRun(fresh);
        const first = await labApi.listResults(runId, { limit: RESULTS_PAGE_SIZE }, { getToken });
        if (cancelled) {
          return;
        }
        setTotal(first.total);
        setNewCount(first.newCount);
        setNextCursor(first.page.nextCursor);
        setHasMore(first.page.hasMore);
        setAllItems(mergeResultsWithGroups(first.items, index));
      } catch (unknownError: unknown) {
        if (!cancelled) {
          setError(toListError(unknownError));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }
    void loadInitial();
    return (): void => {
      cancelled = true;
    };
  }, [runId, projectId, getToken, nonce]);

  const loadMore = useCallback(async (): Promise<void> => {
    if (loading || loadingMore || fetchMoreLoading || !hasMore || nextCursor === null) {
      return;
    }
    setLoadMoreError(null);
    setLoadingMore(true);
    try {
      const page = await labApi.listResults(
        runId,
        { limit: RESULTS_PAGE_SIZE, cursor: nextCursor },
        { getToken },
      );
      setAllItems((prev: TriagedItem[]): TriagedItem[] => [
        ...prev,
        ...mergeResultsWithGroups(page.items, groupIndex),
      ]);
      setNextCursor(page.page.nextCursor);
      setHasMore(page.page.hasMore);
      setTotal(page.total);
    } catch (unknownError: unknown) {
      setLoadMoreError(toListError(unknownError));
    } finally {
      setLoadingMore(false);
    }
  }, [loading, loadingMore, fetchMoreLoading, hasMore, nextCursor, runId, getToken, groupIndex]);

  const visibleItems: TriagedItem[] = useMemo<TriagedItem[]>(
    () => applyResultFilters(allItems, filters),
    [allItems, filters],
  );

  // Disponibilidade do BUSCAR MAIS a partir do run fresco (null = ainda sem
  // run; a tela mantém o "fim da lista" anterior até carregar).
  const runInfo: FetchMoreAvailability | null = useMemo<FetchMoreAvailability | null>(
    () => (run === null ? null : fetchMoreAvailability(run)),
    [run],
  );

  // Lote sob demanda: guarda anti-double-tap → POST fetch-more → recarrega
  // TODAS as páginas (grupos + resultados) e substitui por superset com o
  // mesmo prefixo — o scroll continua de onde parou, sem pular ao topo.
  // Erro vira fetchMoreError com retry local (a tela oferece repetir); sem
  // auto-retry. Contadores vêm da resposta/novo run (servidor é canônico).
  const fetchMore = useCallback(async (): Promise<void> => {
    if (!shouldStartFetchMore(fetchMoreLoading, runInfo?.hasMore ?? false)) {
      return;
    }
    setFetchMoreError(null);
    setFetchMoreLoading(true);
    try {
      const res: FetchMoreResult = await labApi.fetchMore(runId, undefined, { getToken });
      const groups: DedupGroupDTO[] = [];
      let groupsCursor: string | undefined = undefined;
      for (;;) {
        const page: { items: DedupGroupDTO[]; page: PageInfo } =
          groupsCursor === undefined
            ? await labApi.listGroups(projectId, { limit: GROUPS_PAGE_SIZE }, { getToken })
            : await labApi.listGroups(
                projectId,
                { limit: GROUPS_PAGE_SIZE, cursor: groupsCursor },
                { getToken },
              );
        groups.push(...page.items);
        if (!page.page.hasMore || page.page.nextCursor === null) {
          break;
        }
        groupsCursor = page.page.nextCursor;
      }
      const index = buildResultGroupIndex(groups);
      setGroupIndex(index);
      const merged: TriagedItem[] = [];
      let cursor: string | undefined = undefined;
      for (;;) {
        const page: { items: ResultDTO[]; page: PageInfo; total: number; newCount: number } =
          cursor === undefined
            ? await labApi.listResults(runId, { limit: RESULTS_PAGE_SIZE }, { getToken })
            : await labApi.listResults(runId, { limit: RESULTS_PAGE_SIZE, cursor }, { getToken });
        merged.push(...mergeResultsWithGroups(page.items, index));
        if (!page.page.hasMore || page.page.nextCursor === null) {
          break;
        }
        cursor = page.page.nextCursor;
      }
      setAllItems(merged);
      setNextCursor(null);
      setHasMore(false);
      // Contadores canônicos da resposta (servidor recomputou newCount no lote).
      setTotal(res.returned);
      setNewCount(res.newCount);
      const fresh = await labApi.getRun(runId, { getToken });
      setRun(fresh);
    } catch (unknownError: unknown) {
      setFetchMoreError(toListError(unknownError));
    } finally {
      setFetchMoreLoading(false);
    }
  }, [fetchMoreLoading, runInfo, runId, projectId, getToken]);

  const patchFilters = useCallback((patch: Partial<GroupFilter>): void => {
    setFilters((prev: GroupFilter): GroupFilter => ({ ...prev, ...patch }));
  }, []);

  const refresh = useCallback((): void => {
    setNonce((n: number): number => n + 1);
  }, []);

  return {
    allItems,
    visibleItems,
    filters,
    patchFilters,
    loading,
    loadingMore,
    error,
    loadMoreError,
    hasMore,
    nextCursor,
    newCount,
    total,
    tags,
    runInfo,
    fetchMoreLoading,
    fetchMoreError,
    fetchMore,
    refresh,
    loadMore,
  };
}
