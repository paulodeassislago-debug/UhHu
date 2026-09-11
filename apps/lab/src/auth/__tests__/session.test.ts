// apps/lab — testes de sessão/expiração/next (UI-04 + UI-08, 06-04 task 2).
//
// Cobre o redirect de expiração no nível da decisão pura (sem renderer):
// - 401 com user prévio → expired + next preservando /project/<uuid> (o
//   _layout/projects redirecionam para /login?expired=1&next=<rota>; o next
//   precisa sobreviver intacto — é o que estes testes provam via isSafeNext).
// - next aberto rejeitado (`https://evil`, `//evil`, `\\evil` → /projects).
// Mock de expo-secure-store via vi.mock com Map em memória tipado (a sessão
// importa secureToken → SecureStore; web usa Platform.OS='web'). Sem `any`
// (unknown + narrowing); sem segredo real.

import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({
  Platform: { OS: 'web' },
}));

vi.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    getItemAsync: async (key: string): Promise<string | null> => store.get(key) ?? null,
    setItemAsync: async (key: string, value: string): Promise<void> => {
      store.set(key, value);
    },
    deleteItemAsync: async (key: string): Promise<void> => {
      store.delete(key);
    },
  };
});

vi.mock('expo-device', () => ({
  modelName: 'Test Tablet',
  deviceName: null,
}));

import { isSafeNext } from '../session';

const PROJECT_ID = '550e8400-e29b-41d4-a716-446655440000';

// Mesma resolução do login.tsx: next interno preservado, resto → /projects.
function resolveNext(next: unknown): string {
  return isSafeNext(next) ? next : '/projects';
}

describe('isSafeNext', () => {
  it('preserva rotas internas (projeto nunca perdido na expiração)', () => {
    expect(isSafeNext('/projects')).toBe(true);
    expect(isSafeNext(`/project/${PROJECT_ID}`)).toBe(true);
    expect(isSafeNext(`/project/${PROJECT_ID}/strategies`)).toBe(true);
    expect(resolveNext(`/project/${PROJECT_ID}`)).toBe(`/project/${PROJECT_ID}`);
  });

  it('rejeita next aberto (fallback /projects)', () => {
    expect(isSafeNext('https://evil')).toBe(false);
    expect(isSafeNext('http://evil/login')).toBe(false);
    expect(isSafeNext('//evil')).toBe(false);
    expect(isSafeNext('\\\\evil')).toBe(false);
    expect(isSafeNext('')).toBe(false);
    expect(isSafeNext(undefined)).toBe(false);
    expect(isSafeNext('javascript:alert(1)')).toBe(false);
    expect(resolveNext('https://evil')).toBe('/projects');
    expect(resolveNext('//evil')).toBe('/projects');
    expect(resolveNext('\\\\evil')).toBe('/projects');
  });

  it('expiração preserva o projeto atual no redirect do login', () => {
    // _layout monta /login?expired=1&next=<rota>; login volta para `next`.
    const next = `/project/${PROJECT_ID}`;
    const target = { pathname: '/login', params: { expired: '1', next: resolveNext(next) } };
    expect(target.params.next).toBe(next);
    const evilTarget = {
      pathname: '/login',
      params: { expired: '1', next: resolveNext('https://evil') },
    };
    expect(evilTarget.params.next).toBe('/projects');
  });
});
