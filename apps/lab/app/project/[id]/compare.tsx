// apps/lab — Aba Comparação: tabela 2–4 lado a lado (09-04 task 2, UI-27/UI-28, esqueleto §9).
//
// Seção 1 — seleção: FlatList de `listSearches(projectId, { limit: 100 })`
// com alternância por searchId, contador `N selecionadas (2 a 4)` e botão
// `Comparar` habilitado só com 2 a 4 marcadas. A base é a primeira marcada.
// Seção 2 — tabela: após `compareSearches(base, resto)`, `ScrollView`
// horizontal com uma coluna por searchId (termo truncado em 40 caracteres no
// cabeçalho) e linhas `Resultados` (totals), `BDTD` e `CAPES` (bySource),
// `Sobreposição` (pairOverlap contra a base) e bloco `Por ano (todas)` com o
// histograma global via sortedYearRows. O cabeçalho da coluna vencedora leva
// `★ mais inclusiva` (via mostInclusive sobre o DTO) — destaque único.
// Vazio inicial orienta com `Marque 2+ estratégias para comparar`.
// Estados §11: carregando mostra CardSkeleton; erro mostra ErrorBanner com o
// motivo verbatim mais `Repetir`; 401 com sessão prévia marca expiração e
// leva ao login com next `/project/<id>/compare`.
// Segurança (T-09-04-01/02): só envia IDs vindos da lista do próprio projeto
// e confere o formato UUID antes do request; Text escapa por padrão, sem
// WebView e sem eval. Guards são UX; autorização real continua no CORE.

import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import type { JSX } from 'react';
import { Button, FlatList, ScrollView, Text, View } from 'react-native';
import type { ListRenderItemInfo } from 'react-native';
import type { CompareDTO, SearchDTO } from '@uhhu/contracts';
import { ApiError } from '../../../src/api/client';
import { labApi } from '../../../src/api/lab';
import { projectsApi } from '../../../src/api/projects';
import { useAuth } from '../../../src/auth/session';
import { mostInclusive, pairOverlap, sortedYearRows } from '../../../src/compare/compareHelpers';
import type { YearRow } from '../../../src/compare/compareHelpers';
import { Empty } from '../../../src/ui/Empty';
import { ErrorBanner } from '../../../src/ui/ErrorBanner';
import { CardSkeleton } from '../../../src/ui/Skeleton';

type ListState = 'loading' | 'ready' | 'error';
type CompareState = 'idle' | 'loading' | 'ready' | 'error';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TERM_HEADLINE_LENGTH = 40;

function shortTerm(term: string): string {
  if (term.length > TERM_HEADLINE_LENGTH) {
    return `${term.slice(0, TERM_HEADLINE_LENGTH)}…`;
  }
  return term;
}

interface CompareColumnProps {
  searchId: string;
  term: string;
  total: number;
  bdtd: number;
  capes: number;
  overlapText: string;
  isWinner: boolean;
  isReference: boolean;
}

function CompareColumn({
  searchId,
  term,
  total,
  bdtd,
  capes,
  overlapText,
  isWinner,
  isReference,
}: CompareColumnProps): JSX.Element {
  return (
    <View
      testID={`compare-column-${searchId}`}
      style={
        isReference
          ? { minWidth: 150, borderWidth: 2, padding: 8, gap: 4 }
          : { minWidth: 150, borderWidth: 1, padding: 8, gap: 4 }
      }
    >
      <Text style={isReference ? { fontWeight: '700' } : { fontWeight: '600' }}>
        {shortTerm(term)}
      </Text>
      {isReference ? <Text style={{ fontWeight: '700' }}>Referência</Text> : null}
      {isWinner ? <Text>★ mais inclusiva</Text> : null}
      <Text>Resultados: {total}</Text>
      <Text>BDTD: {bdtd}</Text>
      <Text>CAPES: {capes}</Text>
      <Text>Sobreposição: {overlapText}</Text>
    </View>
  );
}

function columnProps(
  compare: CompareDTO,
  termsById: Record<string, string>,
  baseId: string,
  winner: string | null,
  searchId: string,
  referenceSearchId: string | null,
): CompareColumnProps {
  const totalValue: unknown = compare.totals[searchId];
  const total: number =
    typeof totalValue === 'number' && Number.isFinite(totalValue) ? totalValue : 0;
  const bySource = compare.bySource[searchId];
  const bdtd: number = bySource !== undefined ? bySource.bdtd : 0;
  const capes: number = bySource !== undefined ? bySource.capes : 0;
  let overlapText = 'base';
  if (searchId !== baseId) {
    overlapText = String(pairOverlap(compare.pairwiseOverlap, baseId, searchId));
  }
  return {
    searchId,
    term: termsById[searchId] ?? searchId,
    total,
    bdtd,
    capes,
    overlapText,
    isWinner: winner !== null && winner === searchId,
    isReference: referenceSearchId !== null && referenceSearchId === searchId,
  };
}

interface CompareResultProps {
  compare: CompareDTO;
  termsById: Record<string, string>;
  referenceSearchId: string | null;
}

function CompareResult({
  compare,
  termsById,
  referenceSearchId,
}: CompareResultProps): JSX.Element {
  const winner: string | null = mostInclusive(compare.totals, compare.searches);
  const baseId: string = compare.searches[0] ?? '';
  const yearRows: YearRow[] = sortedYearRows(compare.yearHistogram);
  const col0: string | null = compare.searches[0] ?? null;
  const col1: string | null = compare.searches[1] ?? null;
  const col2: string | null = compare.searches[2] ?? null;
  const col3: string | null = compare.searches[3] ?? null;
  return (
    <View style={{ gap: 8 }}>
      <ScrollView horizontal>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {col0 !== null ? (
            <CompareColumn
              {...columnProps(compare, termsById, baseId, winner, col0, referenceSearchId)}
            />
          ) : null}
          {col1 !== null ? (
            <CompareColumn
              {...columnProps(compare, termsById, baseId, winner, col1, referenceSearchId)}
            />
          ) : null}
          {col2 !== null ? (
            <CompareColumn
              {...columnProps(compare, termsById, baseId, winner, col2, referenceSearchId)}
            />
          ) : null}
          {col3 !== null ? (
            <CompareColumn
              {...columnProps(compare, termsById, baseId, winner, col3, referenceSearchId)}
            />
          ) : null}
        </View>
      </ScrollView>
      <Text style={{ fontWeight: '600' }}>Por ano (todas)</Text>
      <FlatList
        data={yearRows}
        keyExtractor={(row: YearRow): string => row.bucket}
        renderItem={({ item: row }: ListRenderItemInfo<YearRow>): JSX.Element => (
          <View style={{ borderWidth: 1, padding: 8 }}>
            <Text>
              {row.bucket}: {row.count}
            </Text>
          </View>
        )}
        horizontal
        contentContainerStyle={{ gap: 8 }}
      />
    </View>
  );
}

export default function CompareScreen(): JSX.Element {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const projectId = typeof params.id === 'string' ? params.id : '';
  const { user, loading: authLoading, getToken, markExpired } = useAuth();
  const [listState, setListState] = useState<ListState>('loading');
  const [searches, setSearches] = useState<SearchDTO[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [listRequestId, setListRequestId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [compareState, setCompareState] = useState<CompareState>('idle');
  const [compare, setCompare] = useState<CompareDTO | null>(null);
  const [compareError, setCompareError] = useState<string | null>(null);
  const [compareRequestId, setCompareRequestId] = useState<string | null>(null);
  const [referenceSearchId, setReferenceSearchId] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    if (projectId.length === 0) {
      setSearches([]);
      setListError('Projeto inválido.');
      setListRequestId(null);
      setListState('error');
      return;
    }
    setListState('loading');
    setListError(null);
    setListRequestId(null);
    try {
      const result = await labApi.listSearches(projectId, { limit: 100 }, { getToken });
      setSearches(result.items);
      setListState('ready');
    } catch (error: unknown) {
      if (error instanceof ApiError && error.status === 401) {
        markExpired();
        router.replace({
          pathname: '/login',
          params: { expired: '1', next: `/project/${projectId}/compare` },
        });
        return;
      }
      if (error instanceof ApiError) {
        setListError(error.message);
        setListRequestId(error.requestId !== '' ? error.requestId : null);
      } else if (error instanceof Error) {
        setListError(error.message);
        setListRequestId(null);
      } else {
        setListError('Erro interno. Tente novamente.');
        setListRequestId(null);
      }
      setListState('error');
    }
  }, [projectId, getToken, markExpired, router]);

  useEffect(() => {
    if (authLoading) {
      return;
    }
    if (user === null) {
      router.replace({
        pathname: '/login',
        params: { next: `/project/${projectId}/compare` },
      });
      return;
    }
    void load();
  }, [authLoading, user, load, router, projectId]);

  useEffect(() => {
    if (authLoading || user === null || projectId.length === 0) {
      return;
    }
    let cancelled = false;
    async function fetchReference(): Promise<void> {
      try {
        const project = await projectsApi.listById(projectId, { getToken });
        if (!cancelled) {
          setReferenceSearchId(project.referenceSearchId);
        }
      } catch (error: unknown) {
        if (error instanceof ApiError && error.status === 401) {
          if (!cancelled) {
            markExpired();
            router.replace({
              pathname: '/login',
              params: { expired: '1', next: `/project/${projectId}/compare` },
            });
          }
          return;
        }
        if (!cancelled) {
          setReferenceSearchId(null);
        }
      }
    }
    void fetchReference();
    return (): void => {
      cancelled = true;
    };
  }, [authLoading, user, projectId, getToken, markExpired, router]);

  const listedIds = new Set<string>();
  for (const search of searches) {
    listedIds.add(search.id);
  }
  const orderedIds: string[] = [];
  for (const id of selectedIds) {
    if (listedIds.has(id)) {
      orderedIds.push(id);
    }
  }
  const termsById: Record<string, string> = {};
  for (const search of searches) {
    termsById[search.id] = search.term;
  }
  const canCompare: boolean = orderedIds.length >= 2 && orderedIds.length <= 4;

  function handleToggle(searchId: string): void {
    if (selectedIds.includes(searchId)) {
      setSelectedIds(
        selectedIds.filter((id: string): boolean => id !== searchId),
      );
    } else {
      setSelectedIds([...selectedIds, searchId]);
    }
  }

  async function handleCompare(): Promise<void> {
    if (orderedIds.length < 2 || orderedIds.length > 4) {
      return;
    }
    const base: string = orderedIds[0] ?? '';
    if (!UUID_PATTERN.test(base)) {
      setCompare(null);
      setCompareError('Estratégia base inválida.');
      setCompareRequestId(null);
      setCompareState('error');
      return;
    }
    const rest: string[] = orderedIds.slice(1);
    for (const id of rest) {
      if (!UUID_PATTERN.test(id)) {
        setCompare(null);
        setCompareError('Estratégia selecionada inválida.');
        setCompareRequestId(null);
        setCompareState('error');
        return;
      }
    }
    setCompareState('loading');
    setCompareError(null);
    setCompareRequestId(null);
    try {
      const dto: CompareDTO = await labApi.compareSearches(base, rest, { getToken });
      setCompare(dto);
      setCompareState('ready');
    } catch (error: unknown) {
      if (error instanceof ApiError && error.status === 401) {
        markExpired();
        router.replace({
          pathname: '/login',
          params: { expired: '1', next: `/project/${projectId}/compare` },
        });
        return;
      }
      if (error instanceof ApiError) {
        setCompareError(error.message);
        setCompareRequestId(error.requestId !== '' ? error.requestId : null);
      } else if (error instanceof Error) {
        setCompareError(error.message);
        setCompareRequestId(null);
      } else {
        setCompareError('Erro interno. Tente novamente.');
        setCompareRequestId(null);
      }
      setCompareState('error');
    }
  }

  function handleRetryCompare(): void {
    void handleCompare();
  }

  function renderFooter(): JSX.Element | null {
    if (searches.length === 0) {
      return null;
    }
    if (compareState === 'loading') {
      return <CardSkeleton count={2} />;
    }
    if (compareState === 'error') {
      return (
        <ErrorBanner
          message={compareError ?? 'Erro interno. Tente novamente.'}
          requestId={compareRequestId}
          onRetry={handleRetryCompare}
        />
      );
    }
    if (compare === null) {
      return (
        <Empty
          title="Marque 2+ estratégias para comparar"
          message="Selecione de 2 a 4 estratégias acima e toque em Comparar."
        />
      );
    }
    return (
      <CompareResult
        compare={compare}
        termsById={termsById}
        referenceSearchId={referenceSearchId}
      />
    );
  }

  if (authLoading || (user !== null && listState === 'loading')) {
    return (
      <View style={{ flex: 1, padding: 24, gap: 12 }}>
        <Text style={{ fontSize: 24, fontWeight: '600' }}>Comparação</Text>
        <CardSkeleton count={2} />
      </View>
    );
  }

  if (user === null) {
    return (
      <View style={{ flex: 1, padding: 24, gap: 12 }}>
        <Text style={{ fontSize: 24, fontWeight: '600' }}>Comparação</Text>
        <Text>Redirecionando para o login…</Text>
      </View>
    );
  }

  if (listState === 'error') {
    return (
      <View style={{ flex: 1, padding: 24, gap: 12 }}>
        <Text style={{ fontSize: 24, fontWeight: '600' }}>Comparação</Text>
        <ErrorBanner
          message={listError ?? 'Erro interno. Tente novamente.'}
          requestId={listRequestId}
          onRetry={() => void load()}
        />
      </View>
    );
  }

  return (
    <FlatList
      data={searches}
      keyExtractor={(search: SearchDTO): string => search.id}
      renderItem={({ item: search }: ListRenderItemInfo<SearchDTO>): JSX.Element => {
        const position: number = orderedIds.indexOf(search.id);
        const isSelected: boolean = position >= 0;
        let statusText = 'Não selecionada';
        if (isSelected && position === 0) {
          statusText = 'Selecionada (base)';
        } else if (isSelected) {
          statusText = `Selecionada (ordem ${position + 1})`;
        }
        return (
          <View style={{ borderWidth: 1, padding: 12, gap: 6 }}>
            <Text style={{ fontWeight: '600' }}>{search.term}</Text>
            <Text>{statusText}</Text>
            <Button
              title={isSelected ? 'Desmarcar' : 'Selecionar'}
              onPress={() => handleToggle(search.id)}
            />
          </View>
        );
      }}
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: 24, gap: 12, flexGrow: 1 }}
      ListHeaderComponent={
        <View style={{ gap: 12 }}>
          <Text style={{ fontSize: 24, fontWeight: '600' }}>Comparação</Text>
          <Text>
            {orderedIds.length} selecionadas (2 a 4)
          </Text>
          <Button
            title="Comparar"
            onPress={() => void handleCompare()}
            disabled={!canCompare || compareState === 'loading'}
          />
        </View>
      }
      ListEmptyComponent={
        <Empty
          title="Nenhuma estratégia"
          message="Defina buscas na aba Estratégias para comparar."
        />
      }
      ListFooterComponent={renderFooter()}
    />
  );
}
