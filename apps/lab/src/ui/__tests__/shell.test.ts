// apps/lab — testes do shell W1 (critérios 1/2/5/6/7/8/9, sem renderer).
//
// AppShell/Sidebar/ProjectTreeItem/ScreenHeader verificados por leitura de
// fonte (padrão do tripwire): montagem, drawer, estados da sidebar,
// destaque, navegação sem remontar o corpo, Sair/Perfil. O mapa rota→título
// está em shellNav.test.ts por import direto. Sem rede/timers/`any`.
//
// Exigência testada (F1): hooks sempre antes de return condicional no
// AppShell — o componente persiste fora do Stack entre rotas, e hook após
// return cedo quebra a transição login→app.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function readUi(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

function countOccurrences(source: string, needle: string): number {
  return source.split(needle).length - 1;
}

describe('montagem no _layout (telas intactas)', () => {
  it('Stack vive dentro do AppShell; AuthProvider/AuthGate intactos', () => {
    const source: string = readUi('../../../app/_layout.tsx');
    expect(source.includes('<AppShell>')).toBe(true);
    expect(source.includes('</AppShell>')).toBe(true);
    expect(source.includes('<AuthProvider>')).toBe(true);
    expect(source.includes('<AuthGate>')).toBe(true);
    expect(source.includes('<Stack>')).toBe(true);
  });
});

describe('AppShell (critérios 1/2/7/8)', () => {
  it('corte num único lugar via useWindowDimensions', () => {
    const source: string = readUi('../AppShell.tsx');
    expect(source.includes('useWindowDimensions')).toBe(true);
    expect(countOccurrences(source, 'SHELL_BREAKPOINT')).toBe(2);
    expect(source.includes('width < SHELL_BREAKPOINT')).toBe(true);
  });

  it('fora de rota interna o Stack renderiza sem shell', () => {
    const source: string = readUi('../AppShell.tsx');
    expect(source.includes('isShellRoute')).toBe(true);
    expect(source.includes('return <>{children}</>')).toBe(true);
  });

  it('corpo da rota renderizado uma vez por modo; ☰ nunca navega', () => {
    const source: string = readUi('../AppShell.tsx');
    expect(countOccurrences(source, 'app-shell-body')).toBe(2);
    expect(countOccurrences(source, '{children}')).toBe(3);
    expect(countOccurrences(source, 'router.push')).toBe(0);
    expect(countOccurrences(source, "router.replace('/login')")).toBe(1);
  });

  it('drawer fechado por padrão; fecha por backdrop, item e Esc', () => {
    const source: string = readUi('../AppShell.tsx');
    expect(source.includes('const [drawerOpen, setDrawerOpen] = useState<boolean>(false)')).toBe(
      true,
    );
    expect(source.includes('drawer-backdrop')).toBe(true);
    expect(source.includes('drawer-panel')).toBe(true);
    expect(countOccurrences(source, 'setDrawerOpen(false)')).toBeGreaterThanOrEqual(3);
    expect(source.includes('Escape')).toBe(true);
  });

  it('coluna fixa com proporção e travas vindas de shellNav', () => {
    const source: string = readUi('../AppShell.tsx');
    expect(source.includes('SIDEBAR_WIDTH_RATIO')).toBe(true);
    expect(source.includes('SIDEBAR_MIN_WIDTH')).toBe(true);
    expect(source.includes('SIDEBAR_MAX_WIDTH')).toBe(true);
  });

  it('hooks sempre antes do return condicional (F1: sem hook após return cedo)', () => {
    const source: string = readUi('../AppShell.tsx');
    const lines: string[] = source.split('\n');
    const effectIdx = lines.findIndex((line: string): boolean => line.includes('useEffect('));
    const earlyReturnIdx = lines.findIndex((line: string): boolean => /^\s*return /.test(line));
    expect(effectIdx).toBeGreaterThanOrEqual(0);
    expect(earlyReturnIdx).toBeGreaterThanOrEqual(0);
    expect(effectIdx).toBeLessThan(earlyReturnIdx);
    const after: string[] = lines.slice(earlyReturnIdx + 1);
    expect(after.filter((line: string): boolean => /use[A-Z]/.test(line))).toEqual([]);
  });
});

describe('Sidebar (critérios 5/6/9)', () => {
  it('lista virtualizada própria com skeleton, vazio e erro com retry', () => {
    const source: string = readUi('../Sidebar.tsx');
    expect(source.includes('<FlatList')).toBe(true);
    expect(source.includes('keyExtractor')).toBe(true);
    expect(source.includes('renderItem')).toBe(true);
    expect(source.includes('CardSkeleton count={3}')).toBe(true);
    expect(source.includes('Você ainda não tem projetos')).toBe(true);
    expect(source.includes('Tentar de novo')).toBe(true);
  });

  it('401 delega ao AuthGate; nunca decide privilégio', () => {
    const source: string = readUi('../Sidebar.tsx');
    expect(source.includes('markExpired()')).toBe(true);
    expect(source.includes('projectsApi.list')).toBe(true);
  });

  it('seções vêm do catálogo; atual expande sozinho', () => {
    const source: string = readUi('../Sidebar.tsx');
    expect(source.includes('SHELL_SECTIONS.map')).toBe(true);
    expect(source.includes('setExpandedId(currentProjectId)')).toBe(true);
    expect(source.includes('sidebar-collapsed')).toBe(true);
  });

  it('sem rótulo antigo e sem quinto item', () => {
    for (const file of ['../Sidebar.tsx', '../ProjectTreeItem.tsx', '../shellNav.ts']) {
      const source: string = readUi(file);
      expect(source.includes('Estratégias')).toBe(false);
      expect(source.includes('Análise')).toBe(false);
    }
  });
});

describe('ProjectTreeItem (critério 4: destaque por slot)', () => {
  it('atual com superfície de destaque; chevron e sub-itens endereçáveis', () => {
    const source: string = readUi('../ProjectTreeItem.tsx');
    expect(source.includes('tree-item-current')).toBe(true);
    expect(source.includes('theme.colors.activeHighlight')).toBe(true);
    expect(source.includes('tree-toggle')).toBe(true);
    expect(source.includes('tree-title')).toBe(true);
    expect(source.includes('tree-section-')).toBe(true);
    expect(source.includes("fontWeight: item.active ? '700' : '400'")).toBe(true);
  });
});

describe('ScreenHeader (critério 6: Perfil inerte, Sair real)', () => {
  it('marca, título, Perfil sem ação e Sair com loading', () => {
    const source: string = readUi('../ScreenHeader.tsx');
    expect(source.includes('UhHU Lab')).toBe(true);
    expect(source.includes('header-title')).toBe(true);
    expect(source.includes('header-logout')).toBe(true);
    expect(source.includes('logoutLoading')).toBe(true);
    expect(source.includes('header-menu')).toBe(true);
  });

  it('Perfil não navega nem dispara ação', () => {
    const source: string = readUi('../ScreenHeader.tsx');
    const lines: string[] = source.split('\n');
    const profileLine = lines.find((line: string): boolean => line.includes('header-profile'));
    expect(profileLine?.includes('onPress') ?? true).toBe(false);
    expect(source.includes('useRouter')).toBe(false);
  });
});
