// apps/lab — Aba Corpus real (09-02 task 2, UI-23/UI-24, esqueleto §10).
//
// View derivada dos elegíveis com contador vivo + filtros tag/fonte/ano.
// - Contagem do GET (`formatCorpusCount(items.length, page.hasMore)`), nunca
//   do filtro local; filtro só oculta na tela.
// - Busca `labApi.getCorpus(projectId, { limit: 100 }, { getToken })`.
// - Filtros client-side via `filterCorpus` (AND puro, molde D-17).
// - Seleção por GRUPO INTEIRO (`selected` de groupIds, um trabalho vale por
//   referência D-14-2) com `selectedIds` derivado para a barra de exportar.
// - Barra de exportar (09-03, UI-25/UI-26, D-22/D-23): formato atual
//   (CSV/BibTeX/JSON) + `Exportar seleção` (grupo inteiro) + `Exportar corpus
//   completo`; entrega via `downloadExportFile` (Blob+anchor na web, Share no
//   nativo); BibTeX sem seleção avisa sem request.
// - Estados §11: skeleton triplo, erro verbatim com Repetir, vazios
//   orientadores, 401 com expired mais next.
// Guards são UX; autorização real continua no CORE. Texto escapa por padrão.

import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { JSX } from 'react';
import { Button, FlatList, Text, TextInput, View } from 'react-native';
import type { ListRenderItemInfo } from 'react-native';
import type { CorpusEntryDTO, PageInfo } from '@uhhu/contracts';
import { ApiError } from '../../../src/api/client';
import { labApi } from '../../../src/api/lab';
import type { ExportFormat, ExportScope } from '../../../src/api/lab';
import { projectsApi } from '../../../src/api/projects';
import { useAuth } from '../../../src/auth/session';
import { filterCorpus } from '../../../src/corpus/corpusFilters';
import type { CorpusFilter } from '../../../src/corpus/corpusFilters';
import {
  buildExportFilename,
  downloadExportFile,
  mimeForFormat,
} from '../../../src/export/exportDelivery';
import { formatCorpusCount } from '../../../src/projects/counts';
import { Empty } from '../../../src/ui/Empty';
import { ErrorBanner } from '../../../src/ui/ErrorBanner';
import { CardSkeleton } from '../../../src/ui/Skeleton';
import { theme } from '../../../src/ui/theme';

type LoadState = 'loading' | 'ready' | 'error';

function formatOrigins(origins: Array<'bdtd' | 'capes'>): string {
  const parts: string[] = [];
  for (const origin of origins) {
    parts.push(origin === 'bdtd' ? 'BDTD' : 'CAPES');
  }
  return parts.join('+');
}

function formatYear(year: number | null): string {
  if (year === null) {
    return 's/ano';
  }
  return String(year);
}

function formatInstitution(institution: string | null): string {
  if (institution === null || institution.trim().length === 0) {
    return 'sem instituição';
  }
  return institution;
}

function formatTags(tags: string[]): string {
  if (tags.length === 0) {
    return 'sem tags';
  }
  return tags.join(', ');
}

function extForFile(value: ExportFormat): 'csv' | 'bib' | 'json' {
  if (value === 'bibtex') {
    return 'bib';
  }
  if (value === 'json') {
    return 'json';
  }
  return 'csv';
}

function todayYYYYMMDD(now: Date): string {
  const year: string = String(now.getFullYear());
  const month: string = String(now.getMonth() + 1).padStart(2, '0');
  const day: string = String(now.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

export default function CorpusScreen(): JSX.Element {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const projectId = typeof params.id === 'string' ? params.id : '';
  const { user, loading: authLoading, getToken, markExpired } = useAuth();
  const [state, setState] = useState<LoadState>('loading');
  const [items, setItems] = useState<CorpusEntryDTO[]>([]);
  const [page, setPage] = useState<PageInfo>({ limit: 100, nextCursor: null, hasMore: false });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorRequestId, setErrorRequestId] = useState<string | null>(null);
  const [tagInput, setTagInput] = useState<string>('');
  const [sourceFilter, setSourceFilter] = useState<'bdtd' | 'capes' | undefined>(undefined);
  const [yearInput, setYearInput] = useState<string>('');
  const [selected, setSelected] = useState<Set<string>>(() => new Set<string>());
  const [format, setFormat] = useState<ExportFormat>('csv');
  const [projectTitle, setProjectTitle] = useState<string | null>(null);
  const [exportBusy, setExportBusy] = useState<boolean>(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportRequestId, setExportRequestId] = useState<string | null>(null);
  const [exportNotice, setExportNotice] = useState<string | null>(null);
  const [lastExport, setLastExport] = useState<{
    scope: ExportScope;
    selection: string | undefined;
  } | null>(null);

  const load = useCallback(async (): Promise<void> => {
    if (projectId.length === 0) {
      setItems([]);
      setErrorMessage('Projeto inválido.');
      setErrorRequestId(null);
      setState('error');
      return;
    }
    setState('loading');
    setErrorMessage(null);
    setErrorRequestId(null);
    try {
      const result = await labApi.getCorpus(projectId, { limit: 100 }, { getToken });
      setItems(result.items);
      setPage(result.page);
      setState('ready');
    } catch (error: unknown) {
      if (error instanceof ApiError && error.status === 401) {
        markExpired();
        router.replace({
          pathname: '/login',
          params: { expired: '1', next: `/project/${projectId}/corpus` },
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
      router.replace({
        pathname: '/login',
        params: { next: `/project/${projectId}/corpus` },
      });
      return;
    }
    void load();
  }, [authLoading, user, load, router, projectId]);

  useEffect(() => {
    if (authLoading || user === null || projectId.length === 0) {
      return;
    }
    let cancelled = false;
    void (async (): Promise<void> => {
      try {
        const project = await projectsApi.listById(projectId, { getToken });
        if (!cancelled) {
          setProjectTitle(project.title);
        }
      } catch {
        if (!cancelled) {
          setProjectTitle(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, user, projectId, getToken]);

  function handleRefresh(): void {
    void load();
  }

  function handleToggleSource(value: 'bdtd' | 'capes'): void {
    setSourceFilter((prev: 'bdtd' | 'capes' | undefined): 'bdtd' | 'capes' | undefined => {
      if (prev === value) {
        return undefined;
      }
      return value;
    });
  }

  function handleYearChange(text: string): void {
    setYearInput(text);
  }

  function handleToggleGroup(groupId: string): void {
    setSelected((prev: Set<string>): Set<string> => {
      const next = new Set<string>(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  }

  async function runExport(scope: ExportScope, selection: string | undefined): Promise<void> {
    if (projectId.length === 0 || exportBusy) {
      return;
    }
    setLastExport({ scope, selection });
    setExportBusy(true);
    setExportError(null);
    setExportRequestId(null);
    try {
      const content: string = await labApi.exportProject(projectId, format, scope, selection, {
        getToken,
      });
      const filename: string = buildExportFilename(
        projectTitle ?? 'projeto',
        todayYYYYMMDD(new Date()),
        extForFile(format),
      );
      await downloadExportFile(content, filename, mimeForFormat(format));
    } catch (error: unknown) {
      if (error instanceof ApiError && error.status === 401) {
        markExpired();
        router.replace({
          pathname: '/login',
          params: { expired: '1', next: `/project/${projectId}/corpus` },
        });
        return;
      }
      if (error instanceof ApiError) {
        setExportError(error.message);
        setExportRequestId(error.requestId !== '' ? error.requestId : null);
      } else if (error instanceof Error) {
        setExportError(error.message);
        setExportRequestId(null);
      } else {
        setExportError('Erro interno. Tente novamente.');
        setExportRequestId(null);
      }
    } finally {
      setExportBusy(false);
    }
  }

  function handleExportSelection(): void {
    if (selectedIds.length === 0) {
      if (format === 'bibtex') {
        setExportNotice('Nada para exportar em BibTeX — selecione ao menos um item.');
      }
      return;
    }
    setExportNotice(null);
    void runExport('selection', selectedIds.join(','));
  }

  function handleExportComplete(): void {
    setExportNotice(null);
    void runExport('corpus', undefined);
  }

  function handleRetryExport(): void {
    if (lastExport === null || exportBusy) {
      return;
    }
    void runExport(lastExport.scope, lastExport.selection);
  }

  const yearFilter: number | undefined = useMemo<number | undefined>(() => {
    const trimmed: string = yearInput.trim();
    if (trimmed.length === 0) {
      return undefined;
    }
    const parsed: number = Number.parseInt(trimmed, 10);
    if (Number.isSafeInteger(parsed)) {
      return parsed;
    }
    return undefined;
  }, [yearInput]);

  const tagFilter: string | undefined = useMemo<string | undefined>(() => {
    const trimmed: string = tagInput.trim();
    if (trimmed.length === 0) {
      return undefined;
    }
    return trimmed;
  }, [tagInput]);

  const visible: CorpusEntryDTO[] = useMemo<CorpusEntryDTO[]>(() => {
    if (tagFilter === undefined && sourceFilter === undefined && yearFilter === undefined) {
      return items;
    }
    const filter: CorpusFilter = {};
    if (tagFilter !== undefined) {
      filter.tag = tagFilter;
    }
    if (sourceFilter !== undefined) {
      filter.source = sourceFilter;
    }
    if (yearFilter !== undefined) {
      filter.year = yearFilter;
    }
    return filterCorpus(items, filter);
  }, [items, tagFilter, sourceFilter, yearFilter]);

  const selectedIds: string[] = useMemo<string[]>(() => Array.from(selected), [selected]);

  if (authLoading || (user !== null && state === 'loading')) {
    return (
      <View style={{ flex: 1, padding: theme.space.xxl, gap: theme.space.lg }}>
        <Text style={{ fontSize: theme.type.heading, fontWeight: '600' }}>
          Corpus: {formatCorpusCount(items.length, page.hasMore)}
        </Text>
        <CardSkeleton count={3} />
      </View>
    );
  }

  if (user === null) {
    return (
      <View style={{ flex: 1, padding: theme.space.xxl, gap: theme.space.lg }}>
        <Text style={{ fontSize: theme.type.heading, fontWeight: '600' }}>Corpus</Text>
        <Text>Redirecionando para o login…</Text>
      </View>
    );
  }

  if (state === 'error') {
    return (
      <View style={{ flex: 1, padding: theme.space.xxl, gap: theme.space.lg }}>
        <Text style={{ fontSize: theme.type.heading, fontWeight: '600' }}>Corpus</Text>
        <ErrorBanner
          message={errorMessage ?? 'Erro interno. Tente novamente.'}
          requestId={errorRequestId}
          onRetry={handleRefresh}
        />
      </View>
    );
  }

  return (
    <FlatList
      data={visible}
      keyExtractor={(entry: CorpusEntryDTO): string => entry.groupId}
      renderItem={({ item: entry }: ListRenderItemInfo<CorpusEntryDTO>): JSX.Element => {
        const isSelected: boolean = selected.has(entry.groupId);
        return (
          <View
            style={{ borderWidth: theme.border.thin, padding: theme.space.lg, gap: theme.space.sm }}
          >
            <Text style={{ fontSize: theme.type.body, fontWeight: '600' }}>
              {entry.title} ({formatYear(entry.year)})
            </Text>
            <Text>{formatInstitution(entry.institution)}</Text>
            <Text>Origens: {formatOrigins(entry.origins)}</Text>
            <Text>Tags: {formatTags(entry.tags)}</Text>
            <Button
              title={isSelected ? 'Selecionado' : 'Selecionar'}
              onPress={() => handleToggleGroup(entry.groupId)}
            />
          </View>
        );
      }}
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: theme.space.xxl, gap: theme.space.lg, flexGrow: 1 }}
      ListHeaderComponent={
        <View style={{ gap: theme.space.lg }}>
          <Text style={{ fontSize: theme.type.heading, fontWeight: '600' }}>
            Corpus: {formatCorpusCount(items.length, page.hasMore)}
          </Text>
          <View style={{ gap: theme.space.md }}>
            <Text style={{ fontWeight: '600' }}>Tag</Text>
            <TextInput
              value={tagInput}
              onChangeText={setTagInput}
              placeholder="todas"
              style={{ borderWidth: theme.border.thin, padding: theme.space.md }}
            />
          </View>
          <View style={{ gap: theme.space.md }}>
            <Text style={{ fontWeight: '600' }}>Fonte</Text>
            <View style={{ flexDirection: 'row', gap: theme.space.md }}>
              <Button
                title={sourceFilter === 'bdtd' ? '• BDTD' : 'BDTD'}
                onPress={() => handleToggleSource('bdtd')}
              />
              <Button
                title={sourceFilter === 'capes' ? '• CAPES' : 'CAPES'}
                onPress={() => handleToggleSource('capes')}
              />
            </View>
          </View>
          <View style={{ gap: theme.space.md }}>
            <Text style={{ fontWeight: '600' }}>Ano</Text>
            <TextInput
              value={yearInput}
              onChangeText={handleYearChange}
              placeholder="todos"
              keyboardType="numeric"
              style={{ borderWidth: theme.border.thin, padding: theme.space.md }}
            />
          </View>
          <View style={{ gap: theme.space.md }}>
            <Text style={{ fontWeight: '600' }}>Exportar</Text>
            <View style={{ flexDirection: 'row', gap: theme.space.md }}>
              <Button title={format === 'csv' ? '• CSV' : 'CSV'} onPress={() => setFormat('csv')} />
              <Button
                title={format === 'bibtex' ? '• BibTeX' : 'BibTeX'}
                onPress={() => setFormat('bibtex')}
              />
              <Button
                title={format === 'json' ? '• JSON' : 'JSON'}
                onPress={() => setFormat('json')}
              />
            </View>
            <Text>
              Seleção: {selectedIds.length} de {items.length}
            </Text>
            <Button
              title="Exportar seleção"
              onPress={handleExportSelection}
              disabled={exportBusy || selectedIds.length === 0}
            />
            <Button
              title="Exportar corpus completo"
              onPress={handleExportComplete}
              disabled={exportBusy}
            />
            {exportNotice !== null ? <Text>{exportNotice}</Text> : null}
            {exportError !== null ? (
              <ErrorBanner
                message={exportError}
                requestId={exportRequestId}
                onRetry={handleRetryExport}
              />
            ) : null}
          </View>
        </View>
      }
      ListEmptyComponent={
        items.length === 0 ? (
          <Empty
            title="Nenhum item elegível ainda — trie os resultados primeiro"
            message="Decida a elegibilidade nos resultados para formar o corpus."
          />
        ) : (
          <Empty title="Nenhum item com estes filtros" message="Ajuste os filtros acima." />
        )
      }
    />
  );
}
