// apps/lab — layout raiz com sessão (06-03 task 1: web cookie; task 2 pluga PAT).
//
// AuthProvider montado aqui (cookie httpOnly no web; Bearer injetado no nativo
// via getToken da sessão). Gate de rota é UX (autorização real no CORE):
// não-autenticado fora de /login|/register → /login; sessão expirada prévia
// (expired) → /login?expired=1 com aviso, sem decidir privilégio.
import { Stack, useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';
import type { JSX, ReactNode } from 'react';
import { AuthProvider, useAuth } from '../src/auth/session.js';

function AuthGate({ children }: { children: ReactNode }): JSX.Element {
  const { user, loading, expired } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) {
      return;
    }
    const first: string | undefined = segments[0];
    const inAuthRoute = first === 'login' || first === 'register';
    if (user === null && !inAuthRoute) {
      if (expired) {
        router.replace({ pathname: '/login', params: { expired: '1' } });
      } else {
        router.replace('/login');
      }
    }
  }, [user, loading, expired, segments, router]);

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
          <Stack.Screen name="project/[id]/corpus" options={{ title: 'Corpus' }} />
        </Stack>
      </AuthGate>
    </AuthProvider>
  );
}
