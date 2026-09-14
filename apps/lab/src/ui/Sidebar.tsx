// apps/lab — Sidebar da W1 (spec UhHu_Lab_Tela_Shell_e_Primitivas §3/§4/§6).
//
// Faz o próprio fetch (platform.project.list, mesma chamada de projects.tsx)
// e NÃO bloqueia o corpo da rota: carregando = skeleton triplo, vazio =
// Empty, erro = linha de aviso + Tentar de novo. 401 delega ao AuthGate via
// markExpired (a sidebar nunca decide privilégio — lista o que a API
// devolveu). Projeto atual expande automaticamente; chevron alterna manual.
// Recolhida = só ícones, sem texto. Ordem = a da API (D7, sem reordenar).
// Rótulo Buscas já vale (D1); arquivo segue strategies até a W3.

import { useEffect, useState } from 'react';
import type { JSX } from 'react';
import { useRouter } from 'expo-router';
import { FlatList, Pressable, Text, View } from 'react-native';
import type { ListRenderItemInfo } from 'react-native';
import type { ProjectDTO } from '@uhhu/contracts';
import { ApiError } from '../api/client';
import { projectsApi } from '../api/projects';
import { useAuth } from '../auth/session';
import { ProjectTreeItem } from './ProjectTreeItem';
import { Button } from './Button';
import { Empty } from './Empty';
import { CardSkeleton } from './Skeleton';
import { SHELL_SECTIONS, sectionRoute } from './shellNav';
import type { ShellSection } from './shellNav';
import { theme } from './theme';

export interface SidebarProps {
  currentProjectId: string | null;
  activeSection: ShellSection | null;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onNavigate: () => void;
}

type SidebarLoadState = 'loading' | 'ready' | 'error';

export function Sidebar({
  currentProjectId,
  activeSection,
  collapsed,
  onToggleCollapsed,
  onNavigate,
}: SidebarProps): JSX.Element {
  const router = useRouter();
  const { user, getToken, markExpired } = useAuth();
  const [state, setState] = useState<SidebarLoadState>('loading');
  const [items, setItems] = useState<ProjectDTO[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [attempt, setAttempt] = useState<number>(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (user === null) {
      return;
    }
    let cancelled = false;
    async function load(): Promise<void> {
      setState('loading');
      setErrorMessage(null);
      try {
        const result = await projectsApi.list({ status: 'active' }, { getToken });
        if (cancelled) {
          return;
        }
        setItems(result.items);
        setState('ready');
      } catch (error: unknown) {
        if (cancelled) {
          return;
        }
        if (error instanceof ApiError && error.status === 401) {
          markExpired();
          return;
        }
        if (error instanceof ApiError || error instanceof Error) {
          setErrorMessage(error.message);
        } else {
          setErrorMessage('Erro interno. Tente novamente.');
        }
        setState('error');
      }
    }
    void load();
    return (): void => {
      cancelled = true;
    };
  }, [user, getToken, markExpired, attempt]);

  useEffect(() => {
    if (currentProjectId !== null) {
      setExpandedId(currentProjectId);
    }
  }, [currentProjectId]);

  function goProject(id: string): void {
    onNavigate();
    router.push({ pathname: '/project/[id]', params: { id } });
  }

  function goSection(key: string): void {
    if (currentProjectId === null) {
      return;
    }
    const route = sectionRoute(key);
    if (route === null) {
      return;
    }
    onNavigate();
    router.push({ pathname: route, params: { id: currentProjectId } });
  }

  function toggleProject(id: string): void {
    setExpandedId((prev: string | null): string | null => (prev === id ? null : id));
  }

  if (collapsed) {
    return (
      <View
        testID="sidebar-collapsed"
        style={{
          flex: 1,
          backgroundColor: theme.colors.sidebarSurface,
          alignItems: 'center',
          paddingVertical: theme.space.md,
          gap: theme.space.sm,
        }}
      >
        <Pressable
          testID="sidebar-toggle"
          onPress={onToggleCollapsed}
          accessibilityRole="button"
          accessibilityLabel="Expandir menu"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={{ fontSize: theme.type.title }}>☰</Text>
        </Pressable>
        {items.map((project: ProjectDTO) => (
          <Pressable
            key={project.id}
            testID="sidebar-collapsed-item"
            onPress={() => goProject(project.id)}
            accessibilityRole="button"
            accessibilityLabel={project.title}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={{ fontSize: theme.type.body }}>
              {currentProjectId === project.id ? '▾' : '▸'}
            </Text>
          </Pressable>
        ))}
      </View>
    );
  }

  return (
    <View
      testID="sidebar"
      style={{ flex: 1, backgroundColor: theme.colors.sidebarSurface, gap: theme.space.sm }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.space.sm,
          paddingHorizontal: theme.space.lg,
          paddingVertical: theme.space.md,
        }}
      >
        <Pressable
          testID="sidebar-toggle"
          onPress={onToggleCollapsed}
          accessibilityRole="button"
          accessibilityLabel="Recolher menu"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={{ fontSize: theme.type.title }}>☰</Text>
        </Pressable>
        <Text
          testID="sidebar-title"
          style={{ flex: 1, fontSize: theme.type.title, fontWeight: '600' }}
        >
          Meus Projetos
        </Text>
      </View>
      {state === 'loading' ? (
        <View style={{ paddingHorizontal: theme.space.lg }}>
          <CardSkeleton count={3} />
        </View>
      ) : null}
      {state === 'error' ? (
        <View
          testID="sidebar-error"
          style={{
            marginHorizontal: theme.space.lg,
            backgroundColor: theme.colors.warningSurface,
            borderWidth: theme.border.thin,
            borderColor: theme.colors.warningBorder,
            padding: theme.space.md,
            gap: theme.space.sm,
          }}
        >
          <Text style={{ fontSize: theme.type.body }}>
            {errorMessage ?? 'Erro interno. Tente novamente.'}
          </Text>
          <Button
            testID="sidebar-retry"
            label="Tentar de novo"
            variant="secondary"
            onPress={() => setAttempt((value: number): number => value + 1)}
          />
        </View>
      ) : null}
      {state === 'ready' && items.length === 0 ? (
        <View style={{ paddingHorizontal: theme.space.lg }}>
          <Empty title="Você ainda não tem projetos" message="Os projetos criados aparecem aqui." />
        </View>
      ) : null}
      {state === 'ready' && items.length > 0 ? (
        <FlatList
          testID="sidebar-list"
          data={items}
          keyExtractor={(project: ProjectDTO): string => project.id}
          renderItem={({ item: project }: ListRenderItemInfo<ProjectDTO>): JSX.Element => {
            const current = project.id === currentProjectId;
            return (
              <ProjectTreeItem
                project={project}
                expanded={expandedId === project.id}
                current={current}
                items={SHELL_SECTIONS.map(
                  (section): { key: string; label: string; active: boolean } => ({
                    key: section.key,
                    label: section.label,
                    active: current && activeSection === section.key,
                  }),
                )}
                onPress={() => goProject(project.id)}
                onToggle={() => toggleProject(project.id)}
                onPressItem={(key: string): void => goSection(key)}
              />
            );
          }}
          style={{ flex: 1 }}
          contentContainerStyle={{
            paddingHorizontal: theme.space.lg,
            gap: theme.space.sm,
            flexGrow: 1,
          }}
        />
      ) : null}
    </View>
  );
}
