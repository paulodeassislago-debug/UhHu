// apps/lab — layout raiz com sessão + expiração (06-03 UI-08).
//
// AuthProvider montado aqui (web cookie httpOnly; nativo PAT via getToken da
// sessão em SecureStore). Gate de rota é UX (autorização real sempre no CORE
// por request — 401 global nunca decide privilégio):
// - Não-autenticado fora de /login|/register → /login com `next` interno.
// - Sessão expirada prévia (expired, 401 com user anterior) →
//   /login?expired=1&next=<rota atual> com aviso "Sua sessão expirou. Entre
//   novamente."; após login volta para `next` (projeto atual preservado via
//   param — nunca perdido; `next` carrega /project/<id> completo).
// - `next` restrito a rotas internas `/...` via isSafeNext (rejeita `http`,
//   `//`, `\` — T-06-03-05); fallback /projects.
import { Stack, usePathname, useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';
import type { JSX, ReactNode } from 'react';
import { AuthProvider, isSafeNext, useAuth } from '../src/auth/session';

function nextForPathname(pathname: string): string {
  // Preserva o projeto atual (/project/<id>...) completo; demais rotas caem
  // para /projects (evita next=/ que voltaria ao index placeholder).
  if (pathname.startsWith('/project/') && isSafeNext(pathname)) {
    return pathname;
  }
  if (pathname === '/projects' && isSafeNext(pathname)) {
    return pathname;
  }
  return '/projects';
}

function AuthGate({ children }: { children: ReactNode }): JSX.Element {
  const { user, loading, expired } = useAuth();
  const segments = useSegments();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (loading) {
      return;
    }
    const first: string | undefined = segments[0];
    const inAuthRoute = first === 'login' || first === 'register';
    if (user === null && !inAuthRoute) {
      const next = nextForPathname(pathname);
      if (expired) {
        router.replace({ pathname: '/login', params: { expired: '1', next } });
      } else {
        router.replace({ pathname: '/login', params: { next } });
      }
    }
  }, [user, loading, expired, segments, pathname, router]);

  return <>{children}</>;
}

export default function RootLayout(): JSX.Element {
  return (
    <AuthProvider>
      <AuthGate>
        <Stack>
          <Stack.Screen name="index" options={{ title: 'UhHu Lab' }} />
          <Stack.Screen name="login" options={{ title: 'Entrar' }} />
          <Stack.Screen name="register" options={{ title: 'Convite' }} />
          <Stack.Screen name="projects" options={{ title: 'Projetos' }} />
          <Stack.Screen name="project/[id]" options={{ title: 'Projeto' }} />
          <Stack.Screen name="project/[id]/strategies" options={{ title: 'Estratégias' }} />
          <Stack.Screen name="project/[id]/search-form" options={{ title: 'Buscar' }} />
          <Stack.Screen name="project/[id]/run" options={{ title: 'Execução' }} />
          <Stack.Screen name="project/[id]/results" options={{ title: 'Resultados' }} />
          <Stack.Screen name="project/[id]/result" options={{ title: 'Ficha' }} />
          <Stack.Screen name="project/[id]/corpus" options={{ title: 'Corpus' }} />
          <Stack.Screen name="project/[id]/compare" options={{ title: 'Comparação' }} />
        </Stack>
      </AuthGate>
    </AuthProvider>
  );
}
