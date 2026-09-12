// apps/lab — card de estratégia §5 (UI-12, 07-02 task 2).
//
// `SearchCard({ search, getToken, onChanged })`: termos legíveis verbatim,
// resumo de filtros, fontes, runs e última execução com dados reais — sem fingir
// métrica.
// - Bloco de runs: `listRuns(search.id, { limit: 100 }, { getToken })` →
//   `runs: N` (+ "+" se hasMore) + última = items[0] (listRuns ordena
//   desc(executedAt)): `hoje HH:MM` no mesmo dia senão `DD/MM` +
//   `· <coverage.bdtd + coverage.capes> resultados` + rótulo de status
//   (succeeded→"ok", demais verbatim). Erro no fetch → "histórico indisponível"
//   e o card continua.
// - Ações: [Executar] (executeSearch + Idempotency-Key única por toque via
//   `globalThis.crypto.randomUUID()` + push da rota do run como string; 429 →
//   mensagem verbatim no card, sem retry), [Comparar] disabled com hint de
//   fase 9, menu [⋯] com [Editar] (push search-form?searchId=), [Duplicar]
//   (createSearch com projectId/term/filters/sources verbatim, sem sufixo —
//   Search não tem título) e [Excluir] disabled com hint do diálogo de cascata
//   da 07-04 (NÃO exclui aqui).
// - 401 → markExpired + /login com next da lista de estratégias.
// Guards são UX; autorização real continua no CORE (AGENTS.md). Text escapa por
// padrão; sem WebView; sem eval.

import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import type { JSX } from 'react';
import { Button, Text, View } from 'react-native';
import type { ExecutableSource, RunStatus, SearchDTO } from '@uhhu/contracts';
import { ApiError } from '../api/client';
import type { TokenProvider } from '../api/client';
import { labApi } from '../api/lab';
import { useAuth } from '../auth/session';

export interface SearchCardProps {
  search: SearchDTO;
  getToken: TokenProvider;
  onChanged: () => void;
}

type RunsState = 'loading' | 'ready' | 'unavailable';

function sourcesLabel(sources: ExecutableSource[]): string {
  const labels: string[] = [];
  for (const source of sources) {
    labels.push(source === 'bdtd' ? 'BDTD' : 'CAPES');
  }
  return labels.join(' + ');
}

function summarizeFilters(search: SearchDTO): string {
  const filters = search.filters;
  const parts: string[] = [];
  if (filters.yearFrom !== undefined && filters.yearTo !== undefined) {
    parts.push(`${filters.yearFrom}-${filters.yearTo}`);
  } else if (filters.yearFrom !== undefined) {
    parts.push(`desde ${filters.yearFrom}`);
  } else if (filters.yearTo !== undefined) {
    parts.push(`até ${filters.yearTo}`);
  }
  if (filters.docTypes !== undefined && filters.docTypes.length > 0) {
    const labels: string[] = [];
    for (const docType of filters.docTypes) {
      labels.push(docType === 'doctoralThesis' ? 'tese' : 'dissertação');
    }
    parts.push(labels.join(', '));
  }
  if (typeof filters.area === 'string' && filters.area.length > 0) {
    parts.push(`área ${filters.area}`);
  }
  if (typeof filters.institution === 'string' && filters.institution.length > 0) {
    parts.push(filters.institution);
  }
  if (typeof filters.program === 'string' && filters.program.length > 0) {
    parts.push(filters.program);
  }
  return parts.length > 0 ? parts.join(' · ') : 'sem filtros';
}

function statusLabel(status: RunStatus): string {
  return status === 'succeeded' ? 'ok' : status;
}

function formatRunDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  if (sameDay) {
    return `hoje ${hh}:${mm}`;
  }
  const dd = String(date.getDate()).padStart(2, '0');
  const mo = String(date.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mo}`;
}

export function SearchCard({ search, getToken, onChanged }: SearchCardProps): JSX.Element {
  const router = useRouter();
  const { markExpired } = useAuth();
  const [runsState, setRunsState] = useState<RunsState>('loading');
  const [runsLine, setRunsLine] = useState<string>('carregando histórico…');
  const [lastLine, setLastLine] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState<boolean>(false);
  const [busy, setBusy] = useState<boolean>(false);
  const [actionError, setActionError] = useState<{ message: string; requestId: string | null } | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    async function fetchRuns(): Promise<void> {
      try {
        const res = await labApi.listRuns(search.id, { limit: 100 }, { getToken });
        if (cancelled) {
          return;
        }
        setRunsLine(`runs: ${res.items.length}${res.page.hasMore ? '+' : ''}`);
        const last = res.items[0];
        if (last !== undefined) {
          const total = last.metrics.coverage.bdtd + last.metrics.coverage.capes;
          setLastLine(
            `último: ${formatRunDate(last.executedAt)} · ${total} resultados · ${statusLabel(last.status)}`,
          );
        } else {
          setLastLine('nenhuma execução ainda');
        }
        setRunsState('ready');
      } catch {
        if (!cancelled) {
          setRunsState('unavailable');
        }
      }
    }
    void fetchRuns();
    return (): void => {
      cancelled = true;
    };
  }, [search.id, getToken]);

  function handleUnauthorized(): void {
    markExpired();
    router.replace({
      pathname: '/login',
      params: { expired: '1', next: `/project/${search.projectId}/strategies` },
    });
  }

  async function handleExecute(): Promise<void> {
    setActionError(null);
    setBusy(true);
    try {
      const run = await labApi.executeSearch(search.id, {
        getToken,
        idempotencyKey: globalThis.crypto.randomUUID(),
      });
      router.push(`/project/${search.projectId}/run?runId=${run.id}&searchId=${search.id}`);
    } catch (error: unknown) {
      if (error instanceof ApiError && error.status === 401) {
        handleUnauthorized();
        return;
      }
      if (error instanceof ApiError) {
        setActionError({
          message: error.message,
          requestId: error.requestId !== '' ? error.requestId : null,
        });
      } else if (error instanceof Error) {
        setActionError({ message: error.message, requestId: null });
      } else {
        setActionError({ message: 'Erro interno. Tente novamente.', requestId: null });
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleDuplicate(): Promise<void> {
    setActionError(null);
    setBusy(true);
    try {
      await labApi.createSearch(
        {
          projectId: search.projectId,
          term: search.term,
          filters: search.filters,
          sources: search.sources,
        },
        { getToken },
      );
      onChanged();
    } catch (error: unknown) {
      if (error instanceof ApiError && error.status === 401) {
        handleUnauthorized();
        return;
      }
      if (error instanceof ApiError) {
        setActionError({
          message: error.message,
          requestId: error.requestId !== '' ? error.requestId : null,
        });
      } else if (error instanceof Error) {
        setActionError({ message: error.message, requestId: null });
      } else {
        setActionError({ message: 'Erro interno. Tente novamente.', requestId: null });
      }
    } finally {
      setBusy(false);
    }
  }

  function handleEdit(): void {
    router.push({
      pathname: '/project/[id]/search-form',
      params: { id: search.projectId, searchId: search.id },
    });
  }

  return (
    <View style={{ borderWidth: 1, padding: 12, gap: 4 }}>
      <Text numberOfLines={2} style={{ fontWeight: '600' }}>
        {search.term}
      </Text>
      <Text>
        {sourcesLabel(search.sources)} · {summarizeFilters(search)}
      </Text>
      {runsState === 'unavailable' ? (
        <Text>histórico indisponível</Text>
      ) : (
        <View style={{ gap: 2 }}>
          <Text>{runsLine}</Text>
          {lastLine !== null ? <Text>{lastLine}</Text> : null}
        </View>
      )}
      {actionError !== null ? (
        <View style={{ gap: 2 }}>
          <Text style={{ color: '#dc2626' }}>{actionError.message}</Text>
          {actionError.requestId !== null ? (
            <Text style={{ fontSize: 12 }}>(req {actionError.requestId})</Text>
          ) : null}
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
        <Button
          title={busy ? 'Executando…' : 'Executar'}
          onPress={() => void handleExecute()}
          disabled={busy}
        />
        <View style={{ gap: 2 }}>
          <Button title="Comparar" disabled />
          <Text style={{ fontSize: 12 }}>disponível na fase 9</Text>
        </View>
        <Button title="⋯" onPress={() => setMenuOpen((prev: boolean): boolean => !prev)} />
      </View>
      {menuOpen ? (
        <View style={{ gap: 8 }}>
          <Button title="Editar" onPress={handleEdit} disabled={busy} />
          <Button
            title="Duplicar"
            onPress={() => void handleDuplicate()}
            disabled={busy}
          />
          <View style={{ gap: 2 }}>
            <Button title="Excluir" disabled />
            <Text style={{ fontSize: 12 }}>diálogo de cascata na 07-04</Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}
