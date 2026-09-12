// apps/lab — Lista de Projetos gerenciável (UI-09, UI-10, 07-01 task 1).
//
// GET /api/v1/projects real via projectsApi.list com filtro Ativos/Arquivados
// (status 'active'|'archived'; 'all' NÃO usado). Criar via ProjectModal (D-13):
// botão "Nova pesquisa (+)" abre o modal; onCreated insere o criado no topo da
// lista local (sem refetch full) e fecha o modal. Cada card FlatList tem linha
// de ações: [Abrir] (Link /project/[id]) + [Arquivar]/[Reativar] via
// projectsApi.update(id, { status }, { getToken }) + atualiza item local;
// arquivar remove da lista `active`, reativar remove da lista `archived`
// (sem tela de config — D-14). Contagem leve por card: `N busca(s)` via
// labApi.listSearches(project.id, { limit: 100 }) por projeto com cache local
// (um fetch por projeto por mount; erro de contagem omite a linha, nunca quebra
// a lista). Nº de elegíveis NÃO exibido aqui (fase 9, UI-23 — corpus derivado).
// - Vazio verbatim: "Nenhum projeto ainda — comece uma pesquisa".
// - Carregando: skeleton por card (nunca spinner solitário).
// - Erro: banner com motivo legível + Repetir (refaz o fetch real).
// - 401 com sessão prévia → markExpired + redirect /login?expired=1&next=/projects.
// - Lista virtualizada com FlatList (tripwire 06-05: scroll container rolável).
// Guards são UX; autorização real continua no CORE (AGENTS.md).

import { Link, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { JSX } from 'react';
import { Button, FlatList, Text, View } from 'react-native';
import type { ListRenderItemInfo } from 'react-native';
import type { ProjectDTO } from '@uhhu/contracts';
import { ApiError } from '../src/api/client';
import { projectsApi } from '../src/api/projects';
import { labApi } from '../src/api/lab';
import { useAuth } from '../src/auth/session';
import { Empty } from '../src/ui/Empty';
import { ErrorBanner } from '../src/ui/ErrorBanner';
import { CardSkeleton } from '../src/ui/Skeleton';
import { ProjectModal } from '../src/ui/ProjectModal';

type LoadState = 'loading' | 'ready' | 'error';
type StatusFilter = 'active' | 'archived';

export default function ProjectsScreen(): JSX.Element {
  const router = useRouter();
  const { user, loading: authLoading, getToken, markExpired } = useAuth();
  const [state, setState] = useState<LoadState>('loading');
  const [filter, setFilter] = useState<StatusFilter>('active');
  const [items, setItems] = useState<ProjectDTO[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorRequestId, setErrorRequestId] = useState<string | null>(null);
  const [modalVisible, setModalVisible] = useState<boolean>(false);
  const [searchCounts, setSearchCounts] = useState<Record<string, string>>({});
  const [pendingIds, setPendingIds] = useState<Record<string, boolean>>({});
  const [toggleErrors, setToggleErrors] = useState<Record<string, string>>({});
  const fetchedCounts = useRef<Set<string>>(new Set());

  const load = useCallback(
    async (status: StatusFilter): Promise<void> => {
      setState('loading');
      setErrorMessage(null);
      setErrorRequestId(null);
      try {
        const result = await projectsApi.list({ status }, { getToken });
        setItems(result.items);
        setState('ready');
      } catch (error: unknown) {
        if (error instanceof ApiError && error.status === 401) {
          markExpired();
          router.replace({ pathname: '/login', params: { expired: '1', next: '/projects' } });
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
    },
    [getToken, markExpired, router],
  );

  useEffect(() => {
    if (authLoading) {
      return;
    }
    if (user === null) {
      router.replace({ pathname: '/login', params: { next: '/projects' } });
      return;
    }
    void load(filter);
  }, [authLoading, user, load, router, filter]);

  // Contagem leve por projeto (nº buscas; elegíveis ficam para a fase 9/UI-23).
  useEffect(() => {
    if (state !== 'ready' || items.length === 0) {
      return;
    }
    let cancelled = false;
    async function fetchMissing(): Promise<void> {
      const missing: ProjectDTO[] = [];
      for (const project of items) {
        if (!fetchedCounts.current.has(project.id)) {
          missing.push(project);
        }
      }
      for (const project of missing) {
        if (cancelled) {
          return;
        }
        fetchedCounts.current.add(project.id);
        try {
          const res = await labApi.listSearches(project.id, { limit: 100 }, { getToken });
          if (cancelled) {
            return;
          }
          const label = `${res.items.length}${res.page.hasMore ? '+' : ''} busca(s)`;
          setSearchCounts((prev: Record<string, string>): Record<string, string> => {
            if (prev[project.id] !== undefined) {
              return prev;
            }
            const next: Record<string, string> = { ...prev };
            next[project.id] = label;
            return next;
          });
        } catch {
          // Erro de contagem omite a linha, nunca quebra a lista.
        }
      }
    }
    void fetchMissing();
    return (): void => {
      cancelled = true;
    };
  }, [items, state, getToken]);

  function handleCreated(created: ProjectDTO): void {
    // ProjectModal já fechou via onClose interno; aqui só atualiza a lista.
    // Insere no topo sem refetch full quando o status combina com o filtro.
    setModalVisible(false);
    if (created.status === filter) {
      setItems((prev: ProjectDTO[]): ProjectDTO[] => [created, ...prev]);
    }
  }

  async function handleToggleStatus(project: ProjectDTO): Promise<void> {
    const nextStatus = project.status === 'active' ? 'archived' : 'active';
    setPendingIds((prev: Record<string, boolean>): Record<string, boolean> => ({
      ...prev,
      [project.id]: true,
    }));
    setToggleErrors((prev: Record<string, string>): Record<string, string> => {
      const next: Record<string, string> = { ...prev };
      delete next[project.id];
      return next;
    });
    try {
      // Arquivar/reativar via ProjectModal-compatível projectsApi.update com PATCH status.
      const updated = await projectsApi.update(project.id, { status: nextStatus }, { getToken });
      if (updated.status !== filter) {
        setItems((prev: ProjectDTO[]): ProjectDTO[] => {
          const next: ProjectDTO[] = [];
          for (const item of prev) {
            if (item.id !== updated.id) {
              next.push(item);
            }
          }
          return next;
        });
      } else {
        setItems((prev: ProjectDTO[]): ProjectDTO[] => {
          const next: ProjectDTO[] = [];
          for (const item of prev) {
            if (item.id === updated.id) {
              next.push(updated);
            } else {
              next.push(item);
            }
          }
          return next;
        });
      }
    } catch (error: unknown) {
      if (error instanceof ApiError && error.status === 401) {
        markExpired();
        router.replace({ pathname: '/login', params: { expired: '1', next: '/projects' } });
        return;
      }
      let message = 'Erro interno. Tente novamente.';
      if (error instanceof ApiError || error instanceof Error) {
        message = error.message;
      }
      const detail =
        error instanceof ApiError && error.requestId !== '' ? `${message} (req ${error.requestId})` : message;
      setToggleErrors((prev: Record<string, string>): Record<string, string> => ({
        ...prev,
        [project.id]: detail,
      }));
    } finally {
      setPendingIds((prev: Record<string, boolean>): Record<string, boolean> => {
        const next: Record<string, boolean> = { ...prev };
        delete next[project.id];
        return next;
      });
    }
  }

  function handleSelectFilter(next: StatusFilter): void {
    if (next === filter) {
      return;
    }
    setFilter(next);
  }

  if (authLoading || (user !== null && state === 'loading')) {
    return (
      <View style={{ flex: 1, padding: 24, gap: 12 }}>
        <Text style={{ fontSize: 24, fontWeight: '600' }}>Projetos</Text>
        <CardSkeleton count={2} />
      </View>
    );
  }

  if (user === null) {
    return (
      <View style={{ flex: 1, padding: 24, gap: 12 }}>
        <Text style={{ fontSize: 24, fontWeight: '600' }}>Projetos</Text>
        <Text>Redirecionando para o login…</Text>
        <Link href="/login">Ir para login</Link>
      </View>
    );
  }

  if (state === 'error') {
    return (
      <View style={{ flex: 1, padding: 24, gap: 12 }}>
        <Text style={{ fontSize: 24, fontWeight: '600' }}>Projetos</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button
            title="Ativos"
            onPress={() => handleSelectFilter('active')}
            disabled={filter === 'active'}
          />
          <Button
            title="Arquivados"
            onPress={() => handleSelectFilter('archived')}
            disabled={filter === 'archived'}
          />
        </View>
        <ErrorBanner
          message={errorMessage ?? 'Erro interno. Tente novamente.'}
          requestId={errorRequestId}
          onRetry={() => void load(filter)}
        />
        <Link href="/login">Voltar ao login</Link>
        <ProjectModal
          visible={modalVisible}
          onClose={() => setModalVisible(false)}
          onCreated={handleCreated}
          getToken={getToken}
        />
      </View>
    );
  }

  if (items.length === 0) {
    return (
      <View style={{ flex: 1, padding: 24, gap: 12 }}>
        <Text style={{ fontSize: 24, fontWeight: '600' }}>Projetos</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button
            title="Ativos"
            onPress={() => handleSelectFilter('active')}
            disabled={filter === 'active'}
          />
          <Button
            title="Arquivados"
            onPress={() => handleSelectFilter('archived')}
            disabled={filter === 'archived'}
          />
        </View>
        <Button title="Nova pesquisa (+)" onPress={() => setModalVisible(true)} />
        <Empty
          title="Nenhum projeto ainda"
          message="Comece uma pesquisa para organizar estratégias, runs e corpus."
          actionLabel="Criar projeto"
          onAction={() => setModalVisible(true)}
        />
        <Link href="/login">Voltar ao login</Link>
        <ProjectModal
          visible={modalVisible}
          onClose={() => setModalVisible(false)}
          onCreated={handleCreated}
          getToken={getToken}
        />
      </View>
    );
  }

  return (
    <FlatList
      data={items}
      keyExtractor={(project: ProjectDTO): string => project.id}
      renderItem={({ item: project }: ListRenderItemInfo<ProjectDTO>): JSX.Element => {
        const countLabel = searchCounts[project.id];
        const pending = pendingIds[project.id] === true;
        const toggleError = toggleErrors[project.id];
        const toggleTitle = project.status === 'active' ? 'Arquivar' : 'Reativar';
        return (
          <View style={{ borderWidth: 1, padding: 12, gap: 4 }}>
            <Link
              href={{
                pathname: '/project/[id]',
                params: { id: project.id },
              }}
            >
              {project.title}
            </Link>
            {project.researchQuestion !== null && project.researchQuestion.length > 0 ? (
              <Text numberOfLines={1}>{project.researchQuestion}</Text>
            ) : null}
            <Text>Status: {project.status}</Text>
            {typeof countLabel === 'string' ? <Text>{countLabel}</Text> : null}
            {typeof toggleError === 'string' ? <Text style={{ color: '#dc2626' }}>{toggleError}</Text> : null}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Link
                href={{
                  pathname: '/project/[id]',
                  params: { id: project.id },
                }}
              >
                Abrir
              </Link>
              <Button
                title={toggleTitle}
                onPress={() => void handleToggleStatus(project)}
                disabled={pending}
              />
            </View>
          </View>
        );
      }}
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: 24, gap: 12, flexGrow: 1 }}
      ListHeaderComponent={
        <View style={{ gap: 12 }}>
          <Text style={{ fontSize: 24, fontWeight: '600' }}>Projetos</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button
              title="Ativos"
              onPress={() => handleSelectFilter('active')}
              disabled={filter === 'active'}
            />
            <Button
              title="Arquivados"
              onPress={() => handleSelectFilter('archived')}
              disabled={filter === 'archived'}
            />
          </View>
          <Button title="Nova pesquisa (+)" onPress={() => setModalVisible(true)} />
        </View>
      }
      ListEmptyComponent={
        <Empty
          title="Nenhum projeto ainda"
          message="Comece uma pesquisa para organizar estratégias, runs e corpus."
          actionLabel="Criar projeto"
          onAction={() => setModalVisible(true)}
        />
      }
      ListFooterComponent={
        <View style={{ gap: 12 }}>
          <ProjectModal
            visible={modalVisible}
            onClose={() => setModalVisible(false)}
            onCreated={handleCreated}
            getToken={getToken}
          />
          <Link href="/login">Voltar ao login</Link>
        </View>
      }
    />
  );
}
