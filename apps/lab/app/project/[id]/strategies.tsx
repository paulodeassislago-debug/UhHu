// apps/lab — Aba Estratégias: lista de cards de busca (UI-12, 07-02 task 2).
//
// FlatList raiz de SearchDTO via listSearches(projectId); cada linha é um
// SearchCard (termos legíveis, filtros, fontes, runs, última execução).
// - Botão "Nova estratégia (+)" → push search-form (criar).
// - Vazio → Empty "Nenhuma estratégia"/"Defina a primeira busca" (texto §5).
// - Carregando → CardSkeleton por card; erro → ErrorBanner + Repetir.
// - 401 com sessão prévia → markExpired + redirect /login com next da aba.
// - Duplicar no card chama onChanged → recarrega a lista (sem refetch manual).
// Guards são UX; autorização real continua no CORE (AGENTS.md). Text escapa por
// padrão; sem WebView; sem eval.

import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import type { JSX } from 'react';
import { Button, FlatList, Text, View } from 'react-native';
import type { ListRenderItemInfo } from 'react-native';
import type { SearchDTO } from '@uhhu/contracts';
import { ApiError } from '../../../src/api/client';
import { labApi } from '../../../src/api/lab';
import { useAuth } from '../../../src/auth/session';
import { SearchCard } from '../../../src/search/SearchCard';
import { Empty } from '../../../src/ui/Empty';
import { ErrorBanner } from '../../../src/ui/ErrorBanner';
import { CardSkeleton } from '../../../src/ui/Skeleton';

type LoadState = 'loading' | 'ready' | 'error';

export default function StrategiesScreen(): JSX.Element {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const projectId = typeof params.id === 'string' ? params.id : '';
  const { user, loading: authLoading, getToken, markExpired } = useAuth();
  const [state, setState] = useState<LoadState>('loading');
  const [items, setItems] = useState<SearchDTO[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorRequestId, setErrorRequestId] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    if (projectId.length === 0) {
      setItems([]);
      setErrorMessage('Projeto inválido.');
      setErrorRequestId(null);
      setState('error');
      return;
    }
    setState('loading');
    setErrorMessage(null);
    setErrorRequestId(null);
    try {
      const result = await labApi.listSearches(projectId, { limit: 100 }, { getToken });
      setItems(result.items);
      setState('ready');
    } catch (error: unknown) {
      if (error instanceof ApiError && error.status === 401) {
        markExpired();
        router.replace({
          pathname: '/login',
          params: { expired: '1', next: `/project/${projectId}/strategies` },
        });
        return;
      }
      if (error instanceof ApiError) {
        setErrorMessage(error.message);
        setErrorRequestId(error.requestId !== '' ? error.requestId : null);
      } else if (error instanceof Error) {
        setErrorMessage(error.message);
        setErrorRequestId(null);
      } else {
        setErrorMessage('Erro interno. Tente novamente.');
        setErrorRequestId(null);
      }
      setState('error');
    }
  }, [projectId, getToken, markExpired, router]);

  useEffect(() => {
    if (authLoading) {
      return;
    }
    if (user === null) {
      router.replace({
        pathname: '/login',
        params: { next: `/project/${projectId}/strategies` },
      });
      return;
    }
    void load();
  }, [authLoading, user, load, router, projectId]);

  const handleRefresh = useCallback((): void => {
    void load();
  }, [load]);

  function handleNewStrategy(): void {
    router.push({ pathname: '/project/[id]/search-form', params: { id: projectId } });
  }

  if (authLoading || (user !== null && state === 'loading')) {
    return (
      <View style={{ flex: 1, padding: 24, gap: 12 }}>
        <Text style={{ fontSize: 24, fontWeight: '600' }}>Estratégias</Text>
        <CardSkeleton count={2} />
      </View>
    );
  }

  if (user === null) {
    return (
      <View style={{ flex: 1, padding: 24, gap: 12 }}>
        <Text style={{ fontSize: 24, fontWeight: '600' }}>Estratégias</Text>
        <Text>Redirecionando para o login…</Text>
      </View>
    );
  }

  if (state === 'error') {
    return (
      <View style={{ flex: 1, padding: 24, gap: 12 }}>
        <Text style={{ fontSize: 24, fontWeight: '600' }}>Estratégias</Text>
        <ErrorBanner
          message={errorMessage ?? 'Erro interno. Tente novamente.'}
          requestId={errorRequestId}
          onRetry={handleRefresh}
        />
      </View>
    );
  }

  return (
    <FlatList
      data={items}
      keyExtractor={(search: SearchDTO): string => search.id}
      renderItem={({ item: search }: ListRenderItemInfo<SearchDTO>): JSX.Element => (
        <SearchCard search={search} getToken={getToken} onChanged={handleRefresh} />
      )}
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: 24, gap: 12, flexGrow: 1 }}
      ListHeaderComponent={
        <View style={{ gap: 12 }}>
          <Text style={{ fontSize: 24, fontWeight: '600' }}>Estratégias</Text>
          <Button title="Nova estratégia (+)" onPress={handleNewStrategy} />
        </View>
      }
      ListEmptyComponent={
        <Empty
          title="Nenhuma estratégia"
          message="Defina a primeira busca"
          actionLabel="Nova estratégia (+)"
          onAction={handleNewStrategy}
        />
      }
    />
  );
}
