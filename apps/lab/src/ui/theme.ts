export const theme = {
  colors: {
    danger: '#dc2626',
    dangerSurface: '#fef2f2',
    dangerBorder: '#fca5a5',
    warningSurface: '#fffbeb',
    warningBorder: '#fcd34a',
    surface: '#ffffff',
    skeletonStrong: '#e5e7eb',
    skeletonWeak: '#f3f4f6',
    // W1 (spec UhHu_Lab_Tela_Shell_e_Primitivas §4): exatamente 2 tokens
    // novos, valores provisórios — a fase visual os troca sem tocar nas
    // telas. Nada mais entra aqui nesta wave.
    sidebarSurface: '#f9fafb',
    activeHighlight: '#dcfce7',
  },
  type: {
    caption: 12,
    body: 16,
    subtitle: 18,
    title: 20,
    heading: 24,
  },
  space: {
    xxs: 2,
    xs: 4,
    sm: 6,
    md: 8,
    lg: 12,
    xl: 16,
    xxl: 24,
  },
  border: {
    thin: 1,
    thick: 2,
  },
} as const;

export type Theme = typeof theme;
