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
