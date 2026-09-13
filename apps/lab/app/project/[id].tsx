// apps/lab — Projeto: cabeçalho editável + TabBar com contador vivo (07-01 task 2; 07-06 lápis inline).
//
// Cabeçalho real (D-14, UI-10, UI-11): título com "✎" inline (pedido Paulo
// 12/09/2026) que troca para TextInput + botões Salvar/Cancelar; Salvar chama
// projectsApi.update(projectId, { title: value.trim() }) com validação local
// (não-vazio + max 200 do contrato; erro local sem request) e atualiza o
// estado local com o DTO retornado. Linha "Pergunta: ..." com "✎" inline que
// reusa o fluxo saveQuestion existente — projectsApi.update(projectId,
// { researchQuestion: value.trim().length > 0 ? value.trim() : null }) —
// string vazia salva null (limpa a pergunta); sem botão separado de edição.
// Menu do cabeçalho: botões Arquivar/Reativar (update status + setProject
// local) — sem tela de configurações. Abaixo do cabeçalho, TabBar com 3 itens:
// [Estratégias] (Link /project/[id]/strategies), [Comparação] (Link
// /project/[id]/compare, 09-04), [Corpus: N] (Link /project/[id]/corpus) onde N é
// o contador vivo via labApi.getCorpus(projectId, { limit: 100 }) — número
// reflete o GET corpus; erro do contador mostra "Corpus" sem número (nunca
// quebra o cabeçalho). Contagem é enriquecimento de leitura; nunca decide
// elegibilidade no client. Tab ativa derivada da rota atual via prop opcional
// activeTab (default 'none' nesta tela).
// Estados transversais:
// - Carregando → CardSkeleton por card (nunca spinner solitário).
// - Erro → ErrorBanner com motivo verbatim + Repetir (refaz o listById real).
// - 401 com sessão prévia → markExpired + redirect /login?expired=1&next=
//   /project/<id> (projeto preservado, UI-08).
// - 404 fora do escopo vira "não encontrado" genérico (app nunca distingue
//   "inexistente" de "alheio"; T-07-01-02).
// Guards são UX; autorização real continua no CORE (AGENTS.md). React Native
// escapa Text por padrão; sem WebView; sem eval (T-07-01-04).

import { Link, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import type { JSX } from 'react';
import { Button, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import type { ProjectDTO } from '@uhhu/contracts';
import { ApiError } from '../../src/api/client';
import { projectsApi } from '../../src/api/projects';
import { labApi } from '../../src/api/lab';
import { useAuth } from '../../src/auth/session';
import { ErrorBanner } from '../../src/ui/ErrorBanner';
import { CardSkeleton } from '../../src/ui/Skeleton';
import { formatCorpusCount } from '../../src/projects/counts';

type LoadState = 'loading' | 'ready' | 'error';
type DetailTab = 'strategies' | 'compare' | 'corpus' | 'none';

export interface ProjectDetailProps {
  activeTab?: DetailTab;
}

export default function ProjectDetailScreen({ activeTab = 'none' }: ProjectDetailProps): JSX.Element {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const projectId = typeof params.id === 'string' ? params.id : '';
  const { user, loading: authLoading, getToken, markExpired } = useAuth();
  const [state, setState] = useState<LoadState>('loading');
  const [project, setProject] = useState<ProjectDTO | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorRequestId, setErrorRequestId] = useState<string | null>(null);
  const [editing, setEditing] = useState<boolean>(false);
  const [draft, setDraft] = useState<string>('');
  const [saving, setSaving] = useState<boolean>(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveRequestId, setSaveRequestId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState<boolean>(false);
  const [titleDraft, setTitleDraft] = useState<string>('');
  const [titleSaving, setTitleSaving] = useState<boolean>(false);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [titleRequestId, setTitleRequestId] = useState<string | null>(null);
  const [statusPending, setStatusPending] = useState<boolean>(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [corpusCount, setCorpusCount] = useState<string | null>(null);

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

  // Contador vivo da aba Corpus via getCorpus (items.length + "+" se hasMore).
  useEffect(() => {
    if (state !== 'ready' || project === null) {
      return;
    }
    let cancelled = false;
    async function fetchCorpusCount(): Promise<void> {
      try {
        const res = await labApi.getCorpus(projectId, { limit: 100 }, { getToken });
        if (cancelled) {
          return;
        }
        setCorpusCount(formatCorpusCount(res.items.length, res.page.hasMore));
      } catch {
        // Erro do contador mostra "Corpus" sem número; nunca quebra o cabeçalho.
        if (!cancelled) {
          setCorpusCount(null);
        }
      }
    }
    void fetchCorpusCount();
    return (): void => {
      cancelled = true;
    };
  }, [state, project, projectId, getToken]);

  function handleStartTitleEdit(): void {
    setTitleDraft(project?.title ?? '');
    setTitleError(null);
    setTitleRequestId(null);
    setEditingTitle(true);
  }

  function handleCancelTitleEdit(): void {
    if (titleSaving) {
      return;
    }
    setEditingTitle(false);
    setTitleError(null);
    setTitleRequestId(null);
  }

  async function handleSaveTitle(): Promise<void> {
    const trimmed = titleDraft.trim();
    if (trimmed.length === 0) {
      setTitleError('Título não pode ficar vazio.');
      return;
    }
    if (trimmed.length > 200) {
      setTitleError('Título deve ter no máximo 200 caracteres.');
      return;
    }
    setTitleError(null);
    setTitleRequestId(null);
    setTitleSaving(true);
    try {
      const updated = await projectsApi.update(projectId, { title: trimmed }, { getToken });
      setProject(updated);
      setEditingTitle(false);
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
        setTitleError(error.message);
        setTitleRequestId(error.requestId !== '' ? error.requestId : null);
      } else if (error instanceof Error) {
        setTitleError(error.message);
        setTitleRequestId(null);
      } else {
        setTitleError('Erro interno. Tente novamente.');
        setTitleRequestId(null);
      }
    } finally {
      setTitleSaving(false);
    }
  }

  function handleStartEdit(): void {
    setDraft(project?.researchQuestion ?? '');
    setSaveError(null);
    setSaveRequestId(null);
    setEditing(true);
  }

  function handleCancelEdit(): void {
    if (saving) {
      return;
    }
    setEditing(false);
    setSaveError(null);
    setSaveRequestId(null);
  }

  async function handleSaveQuestion(): Promise<void> {
    setSaveError(null);
    setSaveRequestId(null);
    setSaving(true);
    try {
      const updated = await projectsApi.update(
        projectId,
        { researchQuestion: draft.trim().length > 0 ? draft.trim() : null },
        { getToken },
      );
      setProject(updated);
      setEditing(false);
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
        setSaveError(error.message);
        setSaveRequestId(error.requestId !== '' ? error.requestId : null);
      } else if (error instanceof Error) {
        setSaveError(error.message);
        setSaveRequestId(null);
      } else {
        setSaveError('Erro interno. Tente novamente.');
        setSaveRequestId(null);
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleStatus(): Promise<void> {
    if (project === null) {
      return;
    }
    const nextStatus = project.status === 'active' ? 'archived' : 'active';
    setStatusError(null);
    setStatusPending(true);
    try {
      const updated = await projectsApi.update(project.id, { status: nextStatus }, { getToken });
      setProject(updated);
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
        const detail = error.requestId !== '' ? `${error.message} (req ${error.requestId})` : error.message;
        setStatusError(detail);
      } else if (error instanceof Error) {
        setStatusError(error.message);
      } else {
        setStatusError('Erro interno. Tente novamente.');
      }
    } finally {
      setStatusPending(false);
    }
  }

  if (authLoading || (user !== null && state === 'loading')) {
    return (
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1, padding: 24, gap: 12 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={{ fontSize: 24, fontWeight: '600' }}>Projeto</Text>
        <CardSkeleton count={2} />
      </ScrollView>
    );
  }

  if (user === null) {
    return (
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1, padding: 24, gap: 12 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={{ fontSize: 24, fontWeight: '600' }}>Projeto</Text>
        <Text>Redirecionando para o login…</Text>
        <Link href="/login">Ir para login</Link>
      </ScrollView>
    );
  }

  if (state === 'error') {
    return (
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1, padding: 24, gap: 12 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={{ fontSize: 24, fontWeight: '600' }}>Projeto</Text>
        <ErrorBanner
          message={errorMessage ?? 'Erro interno. Tente novamente.'}
          requestId={errorRequestId}
          onRetry={() => void load()}
        />
        <Link href="/projects">Voltar aos projetos</Link>
      </ScrollView>
    );
  }

  const corpusTabLabel = corpusCount !== null ? `Corpus: ${corpusCount}` : 'Corpus';

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ flexGrow: 1, padding: 24, gap: 12 }}
      keyboardShouldPersistTaps="handled"
    >
      {editingTitle ? (
        <View style={{ gap: 8 }}>
          <TextInput
            value={titleDraft}
            onChangeText={setTitleDraft}
            placeholder="Título do projeto"
            maxLength={200}
            editable={!titleSaving}
          />
          {titleError !== null ? <Text style={{ color: '#dc2626' }}>{titleError}</Text> : null}
          {titleRequestId !== null ? <Text style={{ fontSize: 12 }}>(req {titleRequestId})</Text> : null}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button title={titleSaving ? 'Salvando…' : 'Salvar'} onPress={() => void handleSaveTitle()} disabled={titleSaving} />
            <Button title="Cancelar" onPress={handleCancelTitleEdit} disabled={titleSaving} />
          </View>
        </View>
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ fontSize: 24, fontWeight: '600' }}>{project?.title ?? 'Projeto'}</Text>
          <Pressable
            onPress={handleStartTitleEdit}
            accessibilityRole="button"
            accessibilityLabel="Editar título"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text>✎</Text>
          </Pressable>
        </View>
      )}
      {editing ? (
        <View style={{ gap: 8 }}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Pergunta de pesquisa"
            multiline
            maxLength={2000}
            editable={!saving}
          />
          {saveError !== null ? <Text style={{ color: '#dc2626' }}>{saveError}</Text> : null}
          {saveRequestId !== null ? <Text style={{ fontSize: 12 }}>(req {saveRequestId})</Text> : null}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button title={saving ? 'Salvando…' : 'Salvar'} onPress={() => void handleSaveQuestion()} disabled={saving} />
            <Button title="Cancelar" onPress={handleCancelEdit} disabled={saving} />
          </View>
        </View>
      ) : (
        <View style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text>Pergunta: {project?.researchQuestion ?? '—'}</Text>
            <Pressable
              onPress={handleStartEdit}
              accessibilityRole="button"
              accessibilityLabel="Editar a pergunta"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text>✎</Text>
            </Pressable>
          </View>
        </View>
      )}
      {project !== null ? <Text>Status: {project.status}</Text> : null}
      {statusError !== null ? <Text style={{ color: '#dc2626' }}>{statusError}</Text> : null}
      {project !== null && project.status === 'active' ? (
        <Button title="Arquivar" onPress={() => void handleToggleStatus()} disabled={statusPending} />
      ) : null}
      {project !== null && project.status === 'archived' ? (
        <Button title="Reativar" onPress={() => void handleToggleStatus()} disabled={statusPending} />
      ) : null}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Link
          href={{
            pathname: '/project/[id]/strategies',
            params: { id: projectId },
          }}
        >
          <Text style={{ fontWeight: activeTab === 'strategies' ? '700' : '400' }}>Estratégias</Text>
        </Link>
        <Link
          href={{
            pathname: '/project/[id]/compare',
            params: { id: projectId },
          }}
        >
          <Text style={{ fontWeight: activeTab === 'compare' ? '700' : '400' }}>Comparação</Text>
        </Link>
        <Link
          href={{
            pathname: '/project/[id]/corpus',
            params: { id: projectId },
          }}
        >
          <Text style={{ fontWeight: activeTab === 'corpus' ? '700' : '400' }}>{corpusTabLabel}</Text>
        </Link>
      </View>
      <Link href="/projects">Voltar aos projetos</Link>
    </ScrollView>
  );
}
