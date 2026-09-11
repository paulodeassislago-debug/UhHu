// apps/lab — Lista de Projetos pós-login (prova UI-05, 06-03 task 1).
//
// Após login, GET /api/v1/projects real via projectsApi.list (cookie httpOnly
// no web; getToken da sessão no nativo — task 2 pluga SecureStore). Prova que
// o cookie funciona: lista real ou vazio orientador, nunca mock.
// - Vazio: "Nenhum projeto ainda — comece uma pesquisa" + CTA desabilitado
//   (criar é fase 7).
// - Carregando: skeleton por card (nunca spinner infinito; botão disabled).
// - Erro: banner com motivo legível + ação repetir.
// - 401 com sessão prévia → markExpired + redirect /login?expired=1&next=/projects.
// Guards são UX; autorização real continua no CORE (AGENTS.md).

import { Link, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import type { JSX } from 'react';
import { Button, Text, View } from 'react-native';
import type { ProjectDTO } from '@uhhu/contracts';
import { ApiError } from '../src/api/client';
import { projectsApi } from '../src/api/projects';
import { useAuth } from '../src/auth/session';
import { Empty } from '../src/ui/Empty';
import { ErrorBanner } from '../src/ui/ErrorBanner';
import { CardSkeleton } from '../src/ui/Skeleton';

type LoadState = 'loading' | 'ready' | 'error';

export default function ProjectsScreen(): JSX.Element {
  const router = useRouter();
  const { user, loading: authLoading, getToken, markExpired } = useAuth();
  const [state, setState] = useState<LoadState>('loading');
  const [items, setItems] = useState<ProjectDTO[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorRequestId, setErrorRequestId] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setState('loading');
    setErrorMessage(null);
    setErrorRequestId(null);
    try {
      const result = await projectsApi.list({ status: 'active' }, { getToken });
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
  }, [getToken, markExpired, router]);

  useEffect(() => {
    if (authLoading) {
      return;
    }
    if (user === null) {
      router.replace({ pathname: '/login', params: { next: '/projects' } });
      return;
    }
    void load();
  }, [authLoading, user, load, router]);

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
        <ErrorBanner
          message={errorMessage ?? 'Erro interno. Tente novamente.'}
          requestId={errorRequestId}
          onRetry={() => void load()}
        />
        <Link href="/login">Voltar ao login</Link>
      </View>
    );
  }

  if (items.length === 0) {
    return (
      <View style={{ flex: 1, padding: 24, gap: 12 }}>
        <Text style={{ fontSize: 24, fontWeight: '600' }}>Projetos</Text>
        <Empty
          title="Nenhum projeto ainda"
          message="Comece uma pesquisa para organizar estratégias, runs e corpus."
          actionLabel="Criar projeto"
          disabled
          disabledHint="disponível na fase 7"
        />
        <Link href="/login">Voltar ao login</Link>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, padding: 24, gap: 12 }}>
      <Text style={{ fontSize: 24, fontWeight: '600' }}>Projetos</Text>
      {items.map((project) => (
        <View key={project.id} style={{ borderWidth: 1, padding: 12, gap: 4 }}>
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
        </View>
      ))}
      <Button title="Nova pesquisa (em breve — fase 7)" onPress={() => undefined} disabled />
      <Link href="/login">Voltar ao login</Link>
    </View>
  );
}
