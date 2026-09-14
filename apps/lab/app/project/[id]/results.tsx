// apps/lab — tela de Resultados com decisão/grupo/tags (08-04 task 2).
//
// Rota /project/[id]/results?runId=<uuid>&searchId=<uuid> (o run concluído
// abre aqui via botão Ver resultados). Blocos:
// - Cabeçalho com contadores: `N NOVOS desde a última execução` (newCount da
//   primeira página, atualizado a cada BUSCAR MAIS) mais `mostrando X de Y`
//   (visíveis após filtro sobre carregados, com overrides aplicados; Y =
//   totalKnown do servidor — soma dos `total` das fontes executadas, não
//   armazenados) + botão `[Tags]` que abre o `TagManagerModal` sem sair da
//   triagem (D-21).
// - Barra de filtros combináveis client-side (D-17): estado com cinco
//   opções, tag via lista horizontal do projeto mais todas, fonte com três
//   opções, ano via campo numérico onde vazio vale todos. Filtros operam sobre
//   o item efetivo (override ?? original), então decisão/divergência/tags
//   refletem sem refetch.
// - groupOverrides (Map groupId→DedupGroupDTO) local: item efetivo =
//   groupOverrides.get(group.id) ?? original; onGroupUpdated escreve no mapa;
//   sem tocar useResultsList/triage (dono 08-02); 08-04 reusa o mesmo mapa
//   para decisão/divergência/tags.
// - Regra canônica 08-04 (D-20/D-21): o servidor é canônico pós-PUT.
//   `refreshGroups()` = descarta `groupOverrides` + `list.refresh()` — o hook
//   (dono 08-02) refaz `listGroups` fresco até esgotar o cursor, reconstrói o
//   índice e refaz `listProjectTags` do filtro; decisões/tags/divergências já
//   persistidas via PUT voltam no GET fresco, sem reaplicar mapa. Chamado no
//   `onTagsChanged` do modal (criar/renomear/excluir reflete nos cards e nos
//   filtros sem refetch manual).
// - resultCache (Map resultId→ResultDTO do run corrente) repassado ao card
//   para o grupo expansível evitar refetch (membros sob demanda só ausentes).
// - Lista virtualizada por cursor (D-16): FlatList com keyExtractor pelo id
//   do result, onEndReached com threshold 0.5 e guarda de loadingMore, sem
//   botão de paginar e sem páginas numeradas.
// - Pagina por page.nextCursor com append na ordem do servidor.
// - Segue hasMore até esgotar; nextCursor nulo marca o fim do ESTOQUE LOCAL.
// - BUSCAR MAIS incremental (08-07, decisão Paulo 12/09 REVISADA): ao fim do
//   estoque, se o run tem hasMore em qualquer fonte (totalKnown do servidor),
//   o rodapé mostra "BUSCAR MAIS — mais 100 de ~Y"; loading desabilita
//   ("buscando mais 100…", double-tap não duplica — guarda no hook + servidor
//   com onConflictDoNothing); erro mostra retry local; sucesso anexa o lote e
//   o scroll continua de onde parou (replace por superset com mesmo prefixo).
//   Sem hasMore → fim silencioso ("fim da lista").
// - Estados §11: skeleton triplo no início, ErrorBanner com repetir no erro,
//   Empty orientador no vazio, aviso de fim ao esgotar.
// - runId fora de uuid mostra `Resultados inválidos` com Voltar e sem
//   request (query é hostil). 401 vira expired com next preservando destino.
// Guards são UX; autorização real continua no CORE. Text escapa por padrão.

import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { JSX } from 'react';
import { Button, FlatList, ScrollView, Text, TextInput, View } from 'react-native';
import type { ListRenderItemInfo } from 'react-native';
import type { DedupGroupDTO, ResultDTO } from '@uhhu/contracts';
import { ApiError } from '../../../src/api/client';
import { useAuth } from '../../../src/auth/session';
import { useResultsList } from '../../../src/results/useResultsList';
import { fetchMoreLabel } from '../../../src/results/fetchMore';
import { ResultCard } from '../../../src/results/ResultCard';
import { TagManagerModal } from '../../../src/results/TagManagerModal';
import { applyResultFilters } from '../../../src/results/triage';
import type { TriagedItem } from '../../../src/results/triage';
import { Empty } from '../../../src/ui/Empty';
import { ErrorBanner } from '../../../src/ui/ErrorBanner';
import { CardSkeleton } from '../../../src/ui/Skeleton';
import { theme } from '../../../src/ui/theme';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toBanner(error: unknown): { message: string; requestId: string | null } {
  if (error instanceof ApiError) {
    return {
      message: error.message,
      requestId: error.requestId !== '' ? error.requestId : null,
    };
  }
  if (error instanceof Error) {
    return { message: error.message, requestId: null };
  }
  return { message: 'Erro interno. Tente novamente.', requestId: null };
}

export default function ResultsScreen(): JSX.Element {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string; runId?: string; searchId?: string }>();
  const projectId = typeof params.id === 'string' ? params.id : '';
  const rawRunId: string | string[] | undefined = params.runId;
  const runId = typeof rawRunId === 'string' ? rawRunId : '';
  const rawSearchId: string | string[] | undefined = params.searchId;
  const searchId = typeof rawSearchId === 'string' ? rawSearchId : '';
  const runIdValid: boolean = UUID_RE.test(runId);
  const { user, loading: authLoading, expired, getToken, markExpired } = useAuth();
  const list = useResultsList({
    runId: runIdValid ? runId : '',
    projectId,
    getToken,
  });
  const [yearInput, setYearInput] = useState<string>('');
  const [tagsModalVisible, setTagsModalVisible] = useState<boolean>(false);
  const [groupOverrides, setGroupOverrides] = useState<Map<string, DedupGroupDTO>>(
    () => new Map<string, DedupGroupDTO>(),
  );
  const redirectedRef = useRef<boolean>(false);

  const nextAfterLogin =
    searchId.length > 0
      ? `/project/${projectId}/results?runId=${runId}&searchId=${searchId}`
      : `/project/${projectId}/results?runId=${runId}`;

  useEffect(() => {
    if (authLoading || expired) {
      return;
    }
    if (user === null) {
      router.replace({ pathname: '/login', params: { next: nextAfterLogin } });
    }
  }, [authLoading, expired, user, router, nextAfterLogin]);

  useEffect(() => {
    const status: number | null = list.error?.status ?? list.loadMoreError?.status ?? null;
    if (status === 401 && !redirectedRef.current) {
      redirectedRef.current = true;
      markExpired();
      router.replace({ pathname: '/login', params: { expired: '1', next: nextAfterLogin } });
    }
  }, [list.error, list.loadMoreError, markExpired, router, nextAfterLogin]);

  useEffect(() => {
    redirectedRef.current = false;
  }, [runId]);

  function handleBack(): void {
    router.back();
  }

  function handleEndReached(): void {
    void list.loadMore();
  }

  function handleFetchMore(): void {
    void list.fetchMore();
  }

  function handleRefresh(): void {
    list.refresh();
  }

  function handleYearChange(text: string): void {
    setYearInput(text);
    const trimmed: string = text.trim();
    if (trimmed.length === 0) {
      list.patchFilters({ year: null });
      return;
    }
    const parsed: number = Number.parseInt(trimmed, 10);
    if (Number.isSafeInteger(parsed)) {
      list.patchFilters({ year: parsed });
    }
  }

  const effectiveAllItems: TriagedItem[] = useMemo<TriagedItem[]>(() => {
    const out: TriagedItem[] = [];
    for (const item of list.allItems) {
      if (item.group === null) {
        out.push(item);
        continue;
      }
      const override: DedupGroupDTO | undefined = groupOverrides.get(item.group.id);
      out.push(override !== undefined ? { result: item.result, group: override } : item);
    }
    return out;
  }, [list.allItems, groupOverrides]);

  const resultCache: Map<string, ResultDTO> = useMemo<Map<string, ResultDTO>>(() => {
    const cache = new Map<string, ResultDTO>();
    for (const item of list.allItems) {
      cache.set(item.result.id, item.result);
    }
    return cache;
  }, [list.allItems]);

  const visibleItems: TriagedItem[] = useMemo<TriagedItem[]>(
    () => applyResultFilters(effectiveAllItems, list.filters),
    [effectiveAllItems, list.filters],
  );

  function handleGroupUpdated(novo: DedupGroupDTO): void {
    const next = new Map<string, DedupGroupDTO>(groupOverrides);
    next.set(novo.id, novo);
    setGroupOverrides(next);
  }

  function refreshGroups(): void {
    setGroupOverrides(new Map<string, DedupGroupDTO>());
    list.refresh();
  }

  function handleTagsChanged(): void {
    refreshGroups();
  }

  function handleOpenTagsModal(): void {
    setTagsModalVisible(true);
  }

  function handleCloseTagsModal(): void {
    setTagsModalVisible(false);
  }

  if (authLoading) {
    return (
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1, padding: theme.space.xxl, gap: theme.space.lg }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={{ fontSize: theme.type.heading, fontWeight: '600' }}>Resultados</Text>
        <CardSkeleton count={3} />
      </ScrollView>
    );
  }

  if (user === null) {
    return (
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1, padding: theme.space.xxl, gap: theme.space.lg }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={{ fontSize: theme.type.heading, fontWeight: '600' }}>Resultados</Text>
        <Text>Redirecionando para o login…</Text>
      </ScrollView>
    );
  }

  if (projectId.length === 0) {
    return (
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1, padding: theme.space.xxl, gap: theme.space.lg }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={{ fontSize: theme.type.heading, fontWeight: '600' }}>Resultados</Text>
        <ErrorBanner message="Projeto inválido." onBack={handleBack} />
      </ScrollView>
    );
  }

  if (!runIdValid) {
    return (
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1, padding: theme.space.xxl, gap: theme.space.lg }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={{ fontSize: theme.type.heading, fontWeight: '600' }}>Resultados</Text>
        <ErrorBanner message="Resultados inválidos." onBack={handleBack} />
      </ScrollView>
    );
  }

  if (list.error !== null && list.error.status === 401) {
    return (
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1, padding: theme.space.xxl, gap: theme.space.lg }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={{ fontSize: theme.type.heading, fontWeight: '600' }}>Resultados</Text>
        <Text>Redirecionando para o login…</Text>
      </ScrollView>
    );
  }

  if (list.loading && list.allItems.length === 0) {
    return (
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1, padding: theme.space.xxl, gap: theme.space.lg }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={{ fontSize: theme.type.heading, fontWeight: '600' }}>Resultados</Text>
        <CardSkeleton count={3} />
      </ScrollView>
    );
  }

  if (list.error !== null && list.allItems.length === 0) {
    const banner = toBanner(list.error);
    return (
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1, padding: theme.space.xxl, gap: theme.space.lg }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={{ fontSize: theme.type.heading, fontWeight: '600' }}>Resultados</Text>
        <ErrorBanner
          message={banner.message}
          requestId={banner.requestId}
          onRetry={handleRefresh}
        />
      </ScrollView>
    );
  }

  const decision = list.filters.decision;
  const tag = list.filters.tag;
  const source = list.filters.source;

  return (
    <>
      <FlatList
        data={visibleItems}
        keyExtractor={(item: TriagedItem): string => item.result.id}
        renderItem={({ item }: ListRenderItemInfo<TriagedItem>): JSX.Element => (
          <ResultCard
            item={item}
            getToken={getToken}
            projectId={projectId}
            projectTags={list.tags}
            resultCache={resultCache}
            onGroupUpdated={handleGroupUpdated}
          />
        )}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: theme.space.xxl, gap: theme.space.lg, flexGrow: 1 }}
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.5}
        refreshing={list.loading}
        onRefresh={handleRefresh}
        ListHeaderComponent={
          <View style={{ gap: theme.space.lg }}>
            <View style={{ flexDirection: 'row', gap: theme.space.md, alignItems: 'center' }}>
              <Text style={{ fontSize: theme.type.heading, fontWeight: '600' }}>Resultados</Text>
              <Button title="Tags" onPress={handleOpenTagsModal} />
            </View>
            <Text>{list.newCount} NOVOS desde a última execução</Text>
            <Text>
              mostrando {visibleItems.length} de {list.runInfo?.totalKnown ?? list.total}
            </Text>
            <View style={{ gap: theme.space.md }}>
              <Text style={{ fontWeight: '600' }}>Estado</Text>
              <View style={{ flexDirection: 'row', gap: theme.space.md, flexWrap: 'wrap' }}>
                <Button
                  title={decision === 'all' ? '• todos' : 'todos'}
                  onPress={() => list.patchFilters({ decision: 'all' })}
                />
                <Button
                  title={decision === 'eligible' ? '• elegível' : 'elegível'}
                  onPress={() => list.patchFilters({ decision: 'eligible' })}
                />
                <Button
                  title={decision === 'ineligible' ? '• não' : 'não'}
                  onPress={() => list.patchFilters({ decision: 'ineligible' })}
                />
                <Button
                  title={decision === 'undecided' ? '• indeciso' : 'indeciso'}
                  onPress={() => list.patchFilters({ decision: 'undecided' })}
                />
                <Button
                  title={decision === 'untriaged' ? '• não triado' : 'não triado'}
                  onPress={() => list.patchFilters({ decision: 'untriaged' })}
                />
              </View>
            </View>
            <View style={{ gap: theme.space.md }}>
              <Text style={{ fontWeight: '600' }}>Tag</Text>
              <View style={{ flexDirection: 'row' }}>
                <Button
                  title={tag === null ? '• todas' : 'todas'}
                  onPress={() => list.patchFilters({ tag: null })}
                />
              </View>
              <FlatList
                data={list.tags}
                horizontal={true}
                keyExtractor={(tagItem): string => tagItem.id}
                renderItem={({ item: tagItem }): JSX.Element => (
                  <Button
                    title={tag === tagItem.name ? `• ${tagItem.name}` : tagItem.name}
                    onPress={() => list.patchFilters({ tag: tagItem.name })}
                  />
                )}
                contentContainerStyle={{ gap: theme.space.md }}
              />
            </View>
            <View style={{ gap: theme.space.md }}>
              <Text style={{ fontWeight: '600' }}>Fonte</Text>
              <View style={{ flexDirection: 'row', gap: theme.space.md, flexWrap: 'wrap' }}>
                <Button
                  title={source === 'all' ? '• todas' : 'todas'}
                  onPress={() => list.patchFilters({ source: 'all' })}
                />
                <Button
                  title={source === 'bdtd' ? '• BDTD' : 'BDTD'}
                  onPress={() => list.patchFilters({ source: 'bdtd' })}
                />
                <Button
                  title={source === 'capes' ? '• CAPES' : 'CAPES'}
                  onPress={() => list.patchFilters({ source: 'capes' })}
                />
              </View>
            </View>
            <View style={{ gap: theme.space.md }}>
              <Text style={{ fontWeight: '600' }}>Ano</Text>
              <TextInput
                value={yearInput}
                onChangeText={handleYearChange}
                placeholder="todos"
                keyboardType="numeric"
                style={{ borderWidth: theme.border.thin, padding: theme.space.md }}
              />
            </View>
          </View>
        }
        ListFooterComponent={
          <View style={{ gap: theme.space.md, paddingVertical: theme.space.lg }}>
            {list.loadingMore ? <Text>carregando…</Text> : null}
            {list.loadMoreError !== null ? <Text>{list.loadMoreError.message}</Text> : null}
            {list.fetchMoreError !== null && !list.fetchMoreLoading ? (
              <View style={{ gap: theme.space.md }}>
                <Text>{list.fetchMoreError.message}</Text>
                <Button title="tentar de novo" onPress={handleFetchMore} />
              </View>
            ) : null}
            {list.runInfo?.hasMore === true && list.fetchMoreError === null ? (
              <Button
                title={
                  list.fetchMoreLoading
                    ? 'buscando mais 100…'
                    : fetchMoreLabel(list.runInfo.remainingKnown)
                }
                disabled={list.fetchMoreLoading}
                onPress={handleFetchMore}
              />
            ) : null}
            {!list.hasMore &&
            list.runInfo?.hasMore !== true &&
            list.allItems.length > 0 &&
            !list.loadingMore &&
            !list.fetchMoreLoading ? (
              <Text>fim da lista</Text>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          <Empty
            title="Nenhum resultado"
            message="Nenhum resultado — ajuste os filtros ou execute a busca novamente."
          />
        }
      />
      <TagManagerModal
        visible={tagsModalVisible}
        projectId={projectId}
        getToken={getToken}
        onClose={handleCloseTagsModal}
        onTagsChanged={handleTagsChanged}
      />
    </>
  );
}
