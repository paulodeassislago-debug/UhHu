// apps/lab — Projeto: cabeçalho + abas com estados §11 (UI-03, 06-04 task 1).
//
// Cabeçalho: pergunta de pesquisa + status via GET /api/v1/projects/:id
// (owner-scoped; 404 idêntico fora do escopo, IDOR §2.3). Abas: Estratégias /
// Comparação / Corpus com contador placeholder "Corpus: 0" (contador vivo na
// fase 9; sem decisão de elegibilidade aqui — fase 8).
// Estados transversais:
// - Carregando → CardSkeleton por card (nunca spinner solitário).
// - Erro → ErrorBanner com motivo verbatim + Repetir (refaz o listById real).
// - Sem estratégias (placeholder fase 6) → Empty "Nenhuma estratégia —
//   defina a primeira busca (fase 7)".
// - Runs futuros → PartialBanner com status 'ok'|'partial'|'failed' (fase 6:
//   'ok' renderiza null; wire real nas fases 8-9, sem fingir dado —
//   T-06-04-03).
// - 401 com sessão prévia → markExpired + redirect /login?expired=1&next=
//   /project/<id> (projeto preservado, UI-08).
// Guards são UX; autorização real continua no CORE (AGENTS.md).

import { Link, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import type { JSX } from 'react';
import { Text, View } from 'react-native';
import type { ProjectDTO } from '@uhhu/contracts';
import { ApiError } from '../../src/api/client';
import { projectsApi } from '../../src/api/projects';
import { useAuth } from '../../src/auth/session';
import { Empty } from '../../src/ui/Empty';
import { ErrorBanner } from '../../src/ui/ErrorBanner';
import { PartialBanner } from '../../src/ui/PartialBanner';
import { CardSkeleton } from '../../src/ui/Skeleton';

type LoadState = 'loading' | 'ready' | 'error';

export default function ProjectDetailScreen(): JSX.Element {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const projectId = typeof params.id === 'string' ? params.id : '';
  const { user, loading: authLoading, getToken, markExpired } = useAuth();
  const [state, setState] = useState<LoadState>('loading');
  const [project, setProject] = useState<ProjectDTO | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorRequestId, setErrorRequestId] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    if (projectId.length === 0) {
      setProject(null);
      setErrorMessage('Projeto inválido.');
      setErrorRequestId(null);
      setState('error');
      return;
    }
    setState('loading');
    setErrorMessage(null);
    setErrorRequestId(null);
    try {
      const found = await projectsApi.listById(projectId, { getToken });
      setProject(found);
      setState('ready');
    } catch (error: unknown) {
      if (error instanceof ApiError && error.status === 401) {
        markExpired();
        router.replace({
          pathname: '/login',
          params: { expired: '1', next: `/project/${projectId}` },
        });
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
  }, [projectId, getToken, markExpired, router]);

  useEffect(() => {
    if (authLoading) {
      return;
    }
    if (user === null) {
      router.replace({ pathname: '/login', params: { next: `/project/${projectId}` } });
      return;
    }
    void load();
  }, [authLoading, user, load, router, projectId]);

  if (authLoading || (user !== null && state === 'loading')) {
    return (
      <View style={{ flex: 1, padding: 24, gap: 12 }}>
        <Text style={{ fontSize: 24, fontWeight: '600' }}>Projeto</Text>
        <CardSkeleton count={2} />
      </View>
    );
  }

  if (user === null) {
    return (
      <View style={{ flex: 1, padding: 24, gap: 12 }}>
        <Text style={{ fontSize: 24, fontWeight: '600' }}>Projeto</Text>
        <Text>Redirecionando para o login…</Text>
        <Link href="/login">Ir para login</Link>
      </View>
    );
  }

  if (state === 'error') {
    return (
      <View style={{ flex: 1, padding: 24, gap: 12 }}>
        <Text style={{ fontSize: 24, fontWeight: '600' }}>Projeto</Text>
        <ErrorBanner
          message={errorMessage ?? 'Erro interno. Tente novamente.'}
          requestId={errorRequestId}
          onRetry={() => void load()}
        />
        <Link href="/projects">Voltar aos projetos</Link>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, padding: 24, gap: 12 }}>
      <Text style={{ fontSize: 24, fontWeight: '600' }}>{project?.title ?? 'Projeto'}</Text>
      {project?.researchQuestion !== undefined &&
      project.researchQuestion !== null &&
      project.researchQuestion.length > 0 ? (
        <Text>Pergunta: {project.researchQuestion}</Text>
      ) : null}
      {project !== null ? <Text>Status: {project.status}</Text> : null}
      <Text>Abas: Estratégias / Comparação / Corpus: 0 (contador vivo na fase 9).</Text>
      <PartialBanner whatCame="cabeçalho do projeto" whatMissed="runs e corpus" status="ok" />
      <Empty
        title="Nenhuma estratégia"
        message="Defina a primeira busca (fase 7) — as estratégias entram na fase 7."
        actionLabel="Nova estratégia"
        disabled
        disabledHint="disponível na fase 7"
      />
      <Link
        href={{
          pathname: '/project/[id]/strategies',
          params: { id: projectId },
        }}
      >
        Aba Estratégias
      </Link>
      <Link
        href={{
          pathname: '/project/[id]/corpus',
          params: { id: projectId },
        }}
      >
        Aba Corpus
      </Link>
      <Link href="/projects">Voltar aos projetos</Link>
    </View>
  );
}
