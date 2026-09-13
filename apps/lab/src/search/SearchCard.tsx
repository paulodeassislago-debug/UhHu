// apps/lab — card de estratégia §5 (UI-12/UI-15/UI-16, 07-02 task 2 + 07-04 task 2).
//
// `SearchCard({ search, getToken, onChanged, onDeleted })`: termos legíveis
// verbatim, resumo de filtros, fontes, runs e última execução com dados
// reais — sem fingir métrica.
// - Bloco de runs: `listRuns(search.id, { limit: 100 }, { getToken })` →
//   `runs: N` (+ "+" se hasMore) + última = items[0] (listRuns ordena
//   desc(executedAt)): `hoje HH:MM` no mesmo dia senão `DD/MM` +
//   `· <coverage.bdtd + coverage.capes> resultados` + rótulo de status
//   (succeeded→"ok", demais verbatim). Erro no fetch → "histórico indisponível"
//   e o card continua.
// - Histórico expansível: `<RunHistory>` sempre montado abaixo das ações,
//   colapsado por default (D-11: mora no card, sem aba nova).
// - Ações: [Executar] (executeSearch + Idempotency-Key única por toque via
//   `newIdempotencyKey()` de ../utils/uuid (gap UAT 12/09/2026, 07-05 — o
//   atalho de UUID do global quebra no beta HTTP) + push da rota do run como
//   string; 429 → mensagem verbatim no card, sem retry), [Comparar] disabled com hint de
//   fase 9, menu [⋯] com [Editar] (push search-form?searchId=), [Duplicar]
//   (createSearch com projectId/term/filters/sources verbatim, sem sufixo —
//   Search não tem título) e [Excluir] abrindo o diálogo de cascata
//   (DeleteSearchDialog; o card some via onDeleted da lista).
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
import { DeleteSearchDialog } from './DeleteSearchDialog';
import { RunHistory } from './RunHistory';
import { newIdempotencyKey } from '../utils/uuid';

export interface SearchCardProps {
  search: SearchDTO;
  getToken: TokenProvider;
  onChanged: () => void;
  onDeleted: (searchId: string) => void;
  projectId: string;
  isReference: boolean;
  onSetReference: (searchId: string) => void;
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
      if (docType === 'doctoralThesis') {
        labels.push('tese');
      } else if (docType === 'professionalMaster') {
        labels.push('mestrado profissional');
      } else {
        labels.push('dissertação');
      }
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

export function SearchCard({
  search,
  getToken,
  onChanged,
  onDeleted,
  projectId,
  isReference,
  onSetReference,
}: SearchCardProps): JSX.Element {
  const router = useRouter();
  const { markExpired } = useAuth();
  const [runsState, setRunsState] = useState<RunsState>('loading');
  const [runsLine, setRunsLine] = useState<string>('carregando histórico…');
  const [lastLine, setLastLine] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState<boolean>(false);
  const [deleteOpen, setDeleteOpen] = useState<boolean>(false);
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
    const nextProjectId = projectId.length > 0 ? projectId : search.projectId;
    router.replace({
      pathname: '/login',
      params: { expired: '1', next: `/project/${nextProjectId}/strategies` },
    });
  }

  async function handleExecute(): Promise<void> {
    setActionError(null);
    setBusy(true);
    try {
      const run = await labApi.executeSearch(search.id, {
        getToken,
        idempotencyKey: newIdempotencyKey(),
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
      {isReference ? (
        <Text style={{ fontWeight: '700' }}>Referência</Text>
      ) : (
        <Button
          title="Usar como referência"
          onPress={() => onSetReference(search.id)}
          disabled={busy}
        />
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
          <Button title="Excluir" onPress={() => setDeleteOpen(true)} disabled={busy} />
        </View>
      ) : null}
      <RunHistory searchId={search.id} projectId={search.projectId} getToken={getToken} />
      <DeleteSearchDialog
        search={search}
        visible={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onDeleted={onDeleted}
        getToken={getToken}
      />
    </View>
  );
}
