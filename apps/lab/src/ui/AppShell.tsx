// apps/lab — AppShell da W1 (spec UhHu_Lab_Tela_Shell_e_Primitivas §3/§6).
//
// Layout em volta do Stack (roteador intacto): paisagem (largura >= corte) =
// sidebar fixa + coluna de conteúdo (header fixo + corpo da rota); retrato =
// drawer sobreposto fechado por padrão (D8), que fecha por backdrop, Esc e
// navegação. O corte vive SÓ aqui (via shellNav). Alternar o ☰ nunca troca a
// rota nem remonta o corpo (o scroll é preservado). Fora de /, /login e
// /register o shell some e o Stack renderiza direto (critério 1).
// Guards continuam no AuthGate; autorização real, no CORE.
//
// Exigência testada (F1, shell.test.ts): hooks sempre antes de return
// condicional — o AppShell monta fora do Stack e persiste entre rotas; hook
// após return cedo quebra a transição login→app no runtime.

import { useEffect, useState } from 'react';
import type { JSX, ReactNode } from 'react';
import { useGlobalSearchParams, useRouter, useSegments } from 'expo-router';
import { Platform, Pressable, View } from 'react-native';
import { useWindowDimensions } from 'react-native';
import { useAuth } from '../auth/session';
import { ScreenHeader } from './ScreenHeader';
import { Sidebar } from './Sidebar';
import { theme } from './theme';
import {
  DRAWER_MAX_WIDTH,
  DRAWER_WIDTH_RATIO,
  SHELL_BREAKPOINT,
  SIDEBAR_COLLAPSED_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  SIDEBAR_WIDTH_RATIO,
  isShellRoute,
  projectIdForRoute,
  sectionForSegments,
  titleForSegments,
} from './shellNav';

export interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps): JSX.Element {
  const segments = useSegments();
  const params = useGlobalSearchParams();
  const { logout } = useAuth();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [collapsed, setCollapsed] = useState<boolean>(false);
  const [drawerOpen, setDrawerOpen] = useState<boolean>(false);
  const [logoutLoading, setLogoutLoading] = useState<boolean>(false);

  const segList: readonly string[] = segments;
  const drawer = width < SHELL_BREAKPOINT;

  // Regra deste arquivo: nenhum hook depois de return condicional. O AppShell
  // vive fora do Stack e persiste entre rotas — hook após return cedo quebra
  // a transição login→app ("Rendered more hooks than during previous render").
  useEffect(() => {
    if (
      !isShellRoute(segList) ||
      !drawer ||
      !drawerOpen ||
      Platform.OS !== 'web' ||
      typeof document === 'undefined'
    ) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setDrawerOpen(false);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return (): void => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [segList, drawer, drawerOpen]);

  if (!isShellRoute(segList)) {
    return <>{children}</>;
  }

  const title = titleForSegments(segList);
  const currentProjectId = projectIdForRoute(segList, params);
  const activeSection = sectionForSegments(segList);

  async function handleLogout(): Promise<void> {
    setLogoutLoading(true);
    try {
      await logout();
      router.replace('/login');
    } finally {
      setLogoutLoading(false);
    }
  }

  function handleNavigate(): void {
    if (drawer && drawerOpen) {
      setDrawerOpen(false);
    }
  }

  if (drawer) {
    return (
      <View testID="app-shell" style={{ flex: 1 }}>
        <View testID="app-shell-content" style={{ flex: 1, backgroundColor: theme.colors.surface }}>
          <ScreenHeader
            title={title}
            onLogout={() => void handleLogout()}
            logoutLoading={logoutLoading}
            onMenuPress={() => setDrawerOpen(true)}
          />
          <View testID="app-shell-body" style={{ flex: 1 }}>
            {children}
          </View>
        </View>
        {drawerOpen ? (
          <View
            testID="app-shell-drawer"
            style={{ position: 'absolute', top: 0, left: 0, bottom: 0, right: 0 }}
          >
            <Pressable
              testID="drawer-backdrop"
              onPress={() => setDrawerOpen(false)}
              accessibilityRole="button"
              accessibilityLabel="Fechar menu"
              style={{ position: 'absolute', top: 0, left: 0, bottom: 0, right: 0 }}
            />
            <View
              testID="drawer-panel"
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                bottom: 0,
                width: DRAWER_WIDTH_RATIO,
                maxWidth: DRAWER_MAX_WIDTH,
              }}
            >
              <Sidebar
                currentProjectId={currentProjectId}
                activeSection={activeSection}
                collapsed={false}
                onToggleCollapsed={() => setDrawerOpen(false)}
                onNavigate={handleNavigate}
              />
            </View>
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <View testID="app-shell" style={{ flex: 1, flexDirection: 'row' }}>
      <View
        testID="app-shell-sidebar-slot"
        style={
          collapsed
            ? { width: SIDEBAR_COLLAPSED_WIDTH }
            : {
                width: SIDEBAR_WIDTH_RATIO,
                minWidth: SIDEBAR_MIN_WIDTH,
                maxWidth: SIDEBAR_MAX_WIDTH,
              }
        }
      >
        <Sidebar
          currentProjectId={currentProjectId}
          activeSection={activeSection}
          collapsed={collapsed}
          onToggleCollapsed={() => setCollapsed((value: boolean): boolean => !value)}
          onNavigate={handleNavigate}
        />
      </View>
      <View testID="app-shell-content" style={{ flex: 1, backgroundColor: theme.colors.surface }}>
        <ScreenHeader
          title={title}
          onLogout={() => void handleLogout()}
          logoutLoading={logoutLoading}
        />
        <View testID="app-shell-body" style={{ flex: 1 }}>
          {children}
        </View>
      </View>
    </View>
  );
}
