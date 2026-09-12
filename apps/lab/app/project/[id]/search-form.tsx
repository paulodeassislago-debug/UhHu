// apps/lab — tela Formulário de Busca fiel ao esqueleto §6 (D-09/D-10, UI-13, 07-02 task 1).
//
// ScrollView raiz com SearchForm (§6: linhas AND/OR/NOT sem expressão livre,
// filtros ano/tipo/área/instituição/programa, fontes BDTD/CAPES + selo
// "filtro garantido pelo Core (pós-filtro)" + status das fontes antes de executar).
// - Saúde das fontes: `listSources` + `getSourceHealth` por fonte ({getToken});
//   falha → "indisponível" sem bloquear o form (informativo; nunca autoriza nem
//   bloqueia a execução — a decisão é do servidor; T-07-02).
// - Modo criar (sem ?searchId=) ou editar (?searchId=: getSearch + initial).
// - Salvar → createSearch ou updateSearch + router.back().
// - Executar agora → salva (cria/atualiza) e em seguida executeSearch com
//   Idempotency-Key única por toque via `newIdempotencyKey()` (wrapper
//   cross-platform em src/utils/uuid.ts — o atalho de UUID do global só
//   existe em contexto seguro e quebra no beta HTTP; gap UAT 12/09/2026,
//   07-05; replay idempotente vira 200 sem novo run; sem auto-retry em 429; T-07-02-02) +
//   push `/project/[id]/run?runId=<id>&searchId=<sid>` como string literal
//   (tela criada na 07-03; sem import).
// - 429/422/400 → ErrorBanner verbatim + sem navegação; 401 → expired/next.
// - Estados §11: skeleton no load de edição, erro com Repetir.
// Guards são UX; autorização real continua no CORE (AGENTS.md). Text escapa por
// padrão; sem WebView; sem eval.

import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import type { JSX } from 'react';
import { ScrollView, Text, View } from 'react-native';
import type { SourceHealthDTO } from '@uhhu/contracts';
import { ApiError } from '../../../src/api/client';
import type { TokenProvider } from '../../../src/api/client';
import { labApi } from '../../../src/api/lab';
import type { LabSourceEntry } from '../../../src/api/lab';
import { useAuth } from '../../../src/auth/session';
import { SearchForm } from '../../../src/search/SearchForm';
import type { SearchFormInitial, SearchFormPayload, SourceHealthLabels } from '../../../src/search/SearchForm';
import { ErrorBanner } from '../../../src/ui/ErrorBanner';
import { CardSkeleton } from '../../../src/ui/Skeleton';
import { newIdempotencyKey } from '../../../src/utils/uuid';

type ScreenState = 'loading' | 'ready' | 'error';

const HEALTH_LOADING: SourceHealthLabels = { bdtd: 'carregando…', capes: 'carregando…' };
const HEALTH_UNAVAILABLE: SourceHealthLabels = { bdtd: 'indisponível', capes: 'indisponível' };

function healthLabel(status: SourceHealthDTO['status']): string {
  if (status === 'ok') {
    return 'operacional';
  }
  if (status === 'degraded') {
    return 'degradada';
  }
  return 'offline';
}

function toBanner(error: unknown): { message: string; requestId: string | null } {
  if (error instanceof ApiError) {
    return {
      message: error.message,
      requestId: error.requestId !== '' ? error.requestId : null,
    };
  }
  if (error instanceof Error) {
    return { message: error.message, requestId: null };
  }
  return { message: 'Erro interno. Tente novamente.', requestId: null };
}

export default function SearchFormScreen(): JSX.Element {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string; searchId?: string }>();
  const projectId = typeof params.id === 'string' ? params.id : '';
  const rawSearchId: string | string[] | undefined = params.searchId;
  const searchId = typeof rawSearchId === 'string' && rawSearchId.length > 0 ? rawSearchId : null;
  const editing = searchId !== null;
  const { user, loading: authLoading, getToken, markExpired } = useAuth();
  const [state, setState] = useState<ScreenState>(editing ? 'loading' : 'ready');
  const [initial, setInitial] = useState<SearchFormInitial | null>(null);
  const [health, setHealth] = useState<SourceHealthLabels>(HEALTH_LOADING);
  const [banner, setBanner] = useState<{ message: string; requestId: string | null } | null>(null);
  const [loadError, setLoadError] = useState<{ message: string; requestId: string | null } | null>(null);
  const [loadRequestId, setLoadRequestId] = useState<string | null>(null);
  const [saving, setSaving] = useState<boolean>(false);

  const nextAfterLogin =
    editing && searchId !== null
      ? `/project/${projectId}/search-form?searchId=${searchId}`
      : `/project/${projectId}/search-form`;

  const handleUnauthorized = useCallback((): void => {
    markExpired();
    router.replace({ pathname: '/login', params: { expired: '1', next: nextAfterLogin } });
  }, [markExpired, router, nextAfterLogin]);

  const loadHealth = useCallback(
    async (token: TokenProvider): Promise<void> => {
      try {
        const entries: LabSourceEntry[] = await labApi.listSources({ getToken: token });
        let bdtdLabel = HEALTH_UNAVAILABLE.bdtd;
        let capesLabel = HEALTH_UNAVAILABLE.capes;
        for (const entry of entries) {
          if (entry.name !== 'bdtd' && entry.name !== 'capes') {
            continue;
          }
          try {
            const dto: SourceHealthDTO = await labApi.getSourceHealth(entry.name, {
              getToken: token,
            });
            if (entry.name === 'bdtd') {
              bdtdLabel = healthLabel(dto.status);
            } else {
              capesLabel = healthLabel(dto.status);
            }
          } catch {
            // Saúde de uma fonte falhou: "indisponível" sem bloquear o form.
          }
        }
        setHealth({ bdtd: bdtdLabel, capes: capesLabel });
      } catch {
        setHealth(HEALTH_UNAVAILABLE);
      }
    },
    [],
  );

  const load = useCallback(async (): Promise<void> => {
    if (projectId.length === 0) {
      setLoadError({ message: 'Projeto inválido.', requestId: null });
      setLoadRequestId(null);
      setState('error');
      return;
    }
    if (!editing || searchId === null) {
      setState('ready');
      void loadHealth(getToken);
      return;
    }
    setState('loading');
    setLoadError(null);
    setLoadRequestId(null);
    try {
      const found = await labApi.getSearch(searchId, { getToken });
      setInitial({ term: found.term, filters: found.filters, sources: found.sources });
      setState('ready');
    } catch (error: unknown) {
      if (error instanceof ApiError && error.status === 401) {
        handleUnauthorized();
        return;
      }
      const detail = toBanner(error);
      setLoadError(detail);
      setLoadRequestId(detail.requestId);
      setState('error');
    }
    void loadHealth(getToken);
  }, [projectId, editing, searchId, getToken, loadHealth, handleUnauthorized]);

  useEffect(() => {
    if (authLoading) {
      return;
    }
    if (user === null) {
      router.replace({ pathname: '/login', params: { next: nextAfterLogin } });
      return;
    }
    void load();
  }, [authLoading, user, load, router, nextAfterLogin]);

  async function handleSave(payload: SearchFormPayload): Promise<void> {
    setBanner(null);
    setSaving(true);
    try {
      if (editing && searchId !== null) {
        await labApi.updateSearch(
          searchId,
          { term: payload.term, filters: payload.filters, sources: payload.sources },
          { getToken },
        );
      } else {
        await labApi.createSearch(
          {
            projectId,
            term: payload.term,
            filters: payload.filters,
            sources: payload.sources,
          },
          { getToken },
        );
      }
      router.back();
    } catch (error: unknown) {
      if (error instanceof ApiError && error.status === 401) {
        handleUnauthorized();
        return;
      }
      setBanner(toBanner(error));
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveAndRun(payload: SearchFormPayload): Promise<void> {
    setBanner(null);
    setSaving(true);
    try {
      const saved =
        editing && searchId !== null
          ? await labApi.updateSearch(
              searchId,
              { term: payload.term, filters: payload.filters, sources: payload.sources },
              { getToken },
            )
          : await labApi.createSearch(
              {
                projectId,
                term: payload.term,
                filters: payload.filters,
                sources: payload.sources,
              },
              { getToken },
            );
      const run = await labApi.executeSearch(saved.id, {
        getToken,
        idempotencyKey: newIdempotencyKey(),
      });
      router.push(`/project/${projectId}/run?runId=${run.id}&searchId=${saved.id}`);
    } catch (error: unknown) {
      if (error instanceof ApiError && error.status === 401) {
        handleUnauthorized();
        return;
      }
      setBanner(toBanner(error));
    } finally {
      setSaving(false);
    }
  }

  if (authLoading || (user !== null && state === 'loading')) {
    return (
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1, padding: 24, gap: 12 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={{ fontSize: 24, fontWeight: '600' }}>
          {editing ? 'Editar estratégia' : 'Nova estratégia de busca'}
        </Text>
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
        <Text style={{ fontSize: 24, fontWeight: '600' }}>Buscar</Text>
        <Text>Redirecionando para o login…</Text>
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
        <Text style={{ fontSize: 24, fontWeight: '600' }}>
          {editing ? 'Editar estratégia' : 'Nova estratégia de busca'}
        </Text>
        <ErrorBanner
          message={loadError?.message ?? 'Erro interno. Tente novamente.'}
          requestId={loadRequestId}
          onRetry={() => void load()}
        />
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ flexGrow: 1, padding: 24, gap: 12 }}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={{ fontSize: 24, fontWeight: '600' }}>
        {editing ? 'Editar estratégia' : 'Nova estratégia de busca'}
      </Text>
      {banner !== null ? (
        <ErrorBanner message={banner.message} requestId={banner.requestId} />
      ) : null}
      <SearchForm
        key={editing && searchId !== null ? searchId : 'new'}
        projectId={projectId}
        {...(initial !== null ? { initial } : {})}
        sourcesHealth={health}
        onSave={(payload: SearchFormPayload): void => void handleSave(payload)}
        onSaveAndRun={(payload: SearchFormPayload): void => void handleSaveAndRun(payload)}
        saving={saving}
      />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Text>Projeto: {projectId}</Text>
      </View>
    </ScrollView>
  );
}
