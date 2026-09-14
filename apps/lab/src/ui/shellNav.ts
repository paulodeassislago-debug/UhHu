// apps/lab — navegação pura do shell W1 (spec UhHu_Lab_Tela_Shell_e_Primitivas).
//
// Módulo sem react-native/expo-router para teste unitário direto no vitest
// node (sem renderer no repo — mesmo padrão dos helpers puros
// compareHelpers/corpusFilters/triage). AppShell/Sidebar consomem estas
// funções; os testes importam daqui. Arquivo auxiliar além da lista de 8 da
// W1, exigido pelos critérios 3/11 sem renderer; sem dependência nova.
//
// useSegments devolve segmentos-template (ex.: ["project","[id]","strategies"]),
// nunca o caminho resolvido — por isso o id do projeto vem de
// useGlobalSearchParams e as seções, dos nomes de rota.

export const SHELL_BREAKPOINT = 900;

export const SIDEBAR_WIDTH_RATIO = '20%';

export const SIDEBAR_MIN_WIDTH = 200;

export const SIDEBAR_MAX_WIDTH = 280;

export const DRAWER_WIDTH_RATIO = '80%';

export const DRAWER_MAX_WIDTH = 280;

// Alvos de toque da spec §6 (dimensão de layout, não token visual — mesmo
// precedente dos órfãos height de Skeleton.tsx, documentados no relatório W1).
export const SIDEBAR_ROW_MIN_HEIGHT = 44;

export const SIDEBAR_SUBROW_MIN_HEIGHT = 36;

export type ShellSection = 'specs' | 'buscas' | 'corpus' | 'compare';

export type ShellRoutePathname =
  '/project/[id]' | '/project/[id]/strategies' | '/project/[id]/corpus' | '/project/[id]/compare';

export interface ShellSectionDef {
  key: ShellSection;
  label: string;
  route: ShellRoutePathname;
}

// Ordem do mockup (D4: Comparação anexada por último); o quinto item nasce na W8.
export const SHELL_SECTIONS: ShellSectionDef[] = [
  { key: 'specs', label: 'Especificações', route: '/project/[id]' },
  { key: 'buscas', label: 'Buscas', route: '/project/[id]/strategies' },
  { key: 'corpus', label: 'Corpus', route: '/project/[id]/corpus' },
  { key: 'compare', label: 'Comparação', route: '/project/[id]/compare' },
];

export function sectionRoute(key: string): ShellRoutePathname | null {
  for (const section of SHELL_SECTIONS) {
    if (section.key === key) {
      return section.route;
    }
  }
  return null;
}

// Shell ausente em /, /login e /register (critério 1); presente nas internas.
export function isShellRoute(segments: readonly string[]): boolean {
  const first = segments[0];
  if (first === undefined || first.length === 0) {
    return false;
  }
  if (first === 'login' || first === 'register') {
    return false;
  }
  return true;
}

export function titleForSegments(segments: readonly string[]): string {
  const first = segments[0] ?? '';
  if (first === 'projects') {
    return 'Meus Projetos';
  }
  if (first !== 'project') {
    return 'UhHU Lab';
  }
  const leaf = segments[2] ?? '';
  switch (leaf) {
    case 'strategies':
      return 'Buscas';
    case 'search-form':
      return 'Buscar';
    case 'run':
      return 'Execução';
    case 'results':
      return 'Resultados';
    case 'result':
      return 'Ficha';
    case 'corpus':
      return 'Corpus';
    case 'compare':
      return 'Comparação';
    default:
      return 'Projeto';
  }
}

// Sub-item ativo da árvore; rotas de fluxo (form/run/results/ficha) não
// destacam nenhum (voltam ao hub/itens pelo Voltar das telas).
export function sectionForSegments(segments: readonly string[]): ShellSection | null {
  if (segments[0] !== 'project') {
    return null;
  }
  const leaf = segments[2] ?? '';
  if (leaf.length === 0) {
    return 'specs';
  }
  if (leaf === 'strategies') {
    return 'buscas';
  }
  if (leaf === 'corpus') {
    return 'corpus';
  }
  if (leaf === 'compare') {
    return 'compare';
  }
  return null;
}

export function projectIdForRoute(
  segments: readonly string[],
  params: { readonly id?: unknown },
): string | null {
  if (segments[0] !== 'project') {
    return null;
  }
  const raw = params.id;
  if (typeof raw !== 'string' || raw.length === 0) {
    return null;
  }
  return raw;
}
