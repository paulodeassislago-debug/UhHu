// apps/lab — ficha completa sob demanda em tela dedicada (08-04, UI-22, D-18/D-19).
//
// Rota /project/[id]/result?resultId=<uuid> (só resultId; grupo achado via
// `listGroups` + memberIds para decisão/tags — reaproveita o join da 08-02).
// Busca FRESCA `getResult(resultId)` ao montar (mesmo vindo do card — prova do
// sob-demanda) + `listGroups` para o grupo com overrides locais (decisão/tags/
// divergência atualizam sem refetch, mesmo mapa da 08-03) + `listProjectTags`
// para o `TagInput`; skeleton (CardSkeleton) até resolver; erro → ErrorBanner
// verbatim + [repetir] (§11); nunca lista, nunca prefetch. Corpo: todos os
// campos do ResultDTO (título, autores, ano ou 'ano desconhecido', tipo label,
// instituição/programa, resumo/abstract verbatim ou "sem resumo",
// originUrl/sourceUrl tocáveis https com fallback texto, proveniência
// formatProvenance, badge NOVO) + `<DecisionBar/>` + `<TagInput/>` (decisão
// também ali, D-18) + grupo expansível (`DedupGroupSection` com cache local de
// 1) se originCount>1. resultId inválido → ErrorBanner "Ficha inválida" +
// [Voltar], sem request; 401 → expired+next da ficha. ScrollView raiz.
// Text escapa; sem WebView. Sem `any`.

import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { JSX } from 'react';
import { Linking, ScrollView, Text, View } from 'react-native';
import type { DedupGroupDTO, PageInfo, ResultDTO } from '@uhhu/contracts';
import { ApiError } from '../../../src/api/client';
import { labApi } from '../../../src/api/lab';
import type { ProjectTag } from '../../../src/api/lab';
import { useAuth } from '../../../src/auth/session';
import { DecisionBar } from '../../../src/results/DecisionBar';
import { DedupGroupSection } from '../../../src/results/DedupGroupSection';
import { TagInput } from '../../../src/results/TagInput';
import { docTypeLabel, formatProvenance } from '../../../src/results/triage';
import { ErrorBanner } from '../../../src/ui/ErrorBanner';
import { CardSkeleton } from '../../../src/ui/Skeleton';
import { theme } from '../../../src/ui/theme';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const GROUPS_PAGE_SIZE = 100;

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

function isHttpsUrl(url: string | null): url is string {
  return typeof url === 'string' && url.startsWith('https://');
}

export default function ResultScreen(): JSX.Element {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string; resultId?: string }>();
  const projectId = typeof params.id === 'string' ? params.id : '';
  const rawResultId: string | string[] | undefined = params.resultId;
  const resultId = typeof rawResultId === 'string' ? rawResultId : '';
  const resultIdValid: boolean = UUID_RE.test(resultId);
  const { user, loading: authLoading, expired, getToken, markExpired } = useAuth();
  const [result, setResult] = useState<ResultDTO | null>(null);
  const [groupBase, setGroupBase] = useState<DedupGroupDTO | null>(null);
  const [groupOverrides, setGroupOverrides] = useState<Map<string, DedupGroupDTO>>(
    () => new Map<string, DedupGroupDTO>(),
  );
  const [projectTags, setProjectTags] = useState<ProjectTag[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<{ message: string; requestId: string | null } | null>(null);
  const [nonce, setNonce] = useState<number>(0);
  const redirectedRef = useRef<boolean>(false);

  const nextAfterLogin = `/project/${projectId}/result?resultId=${resultId}`;

  useEffect(() => {
    if (authLoading || expired) {
      return;
    }
    if (user === null) {
      router.replace({ pathname: '/login', params: { next: nextAfterLogin } });
    }
  }, [authLoading, expired, user, router, nextAfterLogin]);

  useEffect(() => {
    redirectedRef.current = false;
  }, [resultId]);

  useEffect(() => {
    if (!resultIdValid || projectId.length === 0) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    async function load(): Promise<void> {
      setLoading(true);
      setError(null);
      try {
        const fetched: ResultDTO = await labApi.getResult(resultId, { getToken });
        if (cancelled) {
          return;
        }
        setResult(fetched);
        try {
          const tagList: ProjectTag[] = await labApi.listProjectTags(projectId, { getToken });
          if (!cancelled) {
            setProjectTags(tagList);
          }
        } catch (tagError: unknown) {
          if (tagError instanceof ApiError && tagError.status === 401) {
            throw tagError;
          }
          if (!cancelled) {
            setProjectTags([]);
          }
        }
        if (cancelled) {
          return;
        }
        try {
          let found: DedupGroupDTO | null = null;
          let cursor: string | undefined = undefined;
          for (;;) {
            const page: { items: DedupGroupDTO[]; page: PageInfo } =
              cursor === undefined
                ? await labApi.listGroups(projectId, { limit: GROUPS_PAGE_SIZE }, { getToken })
                : await labApi.listGroups(
                    projectId,
                    { limit: GROUPS_PAGE_SIZE, cursor },
                    { getToken },
                  );
            for (const group of page.items) {
              if (group.memberIds.includes(resultId)) {
                found = group;
                break;
              }
            }
            if (found !== null || !page.page.hasMore || page.page.nextCursor === null) {
              break;
            }
            cursor = page.page.nextCursor;
          }
          if (!cancelled) {
            setGroupBase(found);
          }
        } catch (groupError: unknown) {
          if (groupError instanceof ApiError && groupError.status === 401) {
            throw groupError;
          }
          if (!cancelled) {
            setGroupBase(null);
          }
        }
      } catch (unknownError: unknown) {
        if (cancelled) {
          return;
        }
        if (unknownError instanceof ApiError && unknownError.status === 401) {
          if (!redirectedRef.current) {
            redirectedRef.current = true;
            markExpired();
            router.replace({ pathname: '/login', params: { expired: '1', next: nextAfterLogin } });
          }
          return;
        }
        setError(toBanner(unknownError));
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }
    void load();
    return (): void => {
      cancelled = true;
    };
  }, [resultIdValid, resultId, projectId, getToken, nonce, markExpired, router, nextAfterLogin]);

  function handleBack(): void {
    router.back();
  }

  function handleRetry(): void {
    setNonce((n: number): number => n + 1);
  }

  function handleGroupUpdated(novo: DedupGroupDTO): void {
    const next = new Map<string, DedupGroupDTO>(groupOverrides);
    next.set(novo.id, novo);
    setGroupOverrides(next);
  }

  const effectiveGroup: DedupGroupDTO | null =
    groupBase !== null ? (groupOverrides.get(groupBase.id) ?? groupBase) : null;

  const resultCache: Map<string, ResultDTO> = useMemo<Map<string, ResultDTO>>(() => {
    const cache = new Map<string, ResultDTO>();
    if (result !== null) {
      cache.set(result.id, result);
    }
    return cache;
  }, [result]);

  if (authLoading) {
    return (
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1, padding: theme.space.xxl, gap: theme.space.lg }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={{ fontSize: theme.type.heading, fontWeight: '600' }}>Ficha</Text>
        <CardSkeleton count={2} />
      </ScrollView>
    );
  }

  if (user === null) {
    return (
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1, padding: theme.space.xxl, gap: theme.space.lg }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={{ fontSize: theme.type.heading, fontWeight: '600' }}>Ficha</Text>
        <Text>Redirecionando para o login…</Text>
      </ScrollView>
    );
  }

  if (projectId.length === 0 || !resultIdValid) {
    return (
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1, padding: theme.space.xxl, gap: theme.space.lg }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={{ fontSize: theme.type.heading, fontWeight: '600' }}>Ficha</Text>
        <ErrorBanner message="Ficha inválida." onBack={handleBack} />
      </ScrollView>
    );
  }

  if (loading && result === null) {
    return (
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1, padding: theme.space.xxl, gap: theme.space.lg }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={{ fontSize: theme.type.heading, fontWeight: '600' }}>Ficha</Text>
        <CardSkeleton count={2} />
      </ScrollView>
    );
  }

  if (error !== null && result === null) {
    return (
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1, padding: theme.space.xxl, gap: theme.space.lg }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={{ fontSize: theme.type.heading, fontWeight: '600' }}>Ficha</Text>
        <ErrorBanner
          message={error.message}
          requestId={error.requestId}
          onRetry={handleRetry}
          onBack={handleBack}
        />
      </ScrollView>
    );
  }

  if (result === null) {
    return (
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1, padding: theme.space.xxl, gap: theme.space.lg }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={{ fontSize: theme.type.heading, fontWeight: '600' }}>Ficha</Text>
        <ErrorBanner message="Ficha inválida." onBack={handleBack} />
      </ScrollView>
    );
  }

  const authorsLine: string =
    result.authors.length > 0 ? result.authors.join(', ') : 'autoria desconhecida';
  const yearLine: string = result.year !== null ? String(result.year) : 'ano desconhecido';
  const typeLabel: string | null = docTypeLabel(result.docType);
  const metaLine: string =
    typeLabel !== null
      ? `${authorsLine} · ${yearLine} · ${typeLabel}`
      : `${authorsLine} · ${yearLine}`;
  const provenanceLine: string = formatProvenance(result);
  const abstractLine: string = result.abstract !== null ? result.abstract : 'sem resumo';
  const httpsOrigin: string | null = isHttpsUrl(result.originUrl) ? result.originUrl : null;
  const rawOrigin: string | null = httpsOrigin === null ? result.originUrl : null;
  const httpsSource: string | null = isHttpsUrl(result.sourceUrl) ? result.sourceUrl : null;
  const rawSource: string | null = httpsSource === null ? result.sourceUrl : null;

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ flexGrow: 1, padding: theme.space.xxl, gap: theme.space.lg }}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={{ fontSize: theme.type.heading, fontWeight: '600' }}>Ficha</Text>
      <View
        style={{ borderWidth: theme.border.thin, padding: theme.space.lg, gap: theme.space.xs }}
      >
        <Text style={{ fontWeight: '600' }}>{result.title}</Text>
        <Text>{metaLine}</Text>
        {result.institution !== null ? <Text>{result.institution}</Text> : null}
        {result.program !== null ? <Text>{result.program}</Text> : null}
        <Text>{abstractLine}</Text>
        {httpsOrigin !== null ? (
          <Text onPress={() => void Linking.openURL(httpsOrigin)}>origem: {httpsOrigin}</Text>
        ) : rawOrigin !== null ? (
          <Text>origem: {rawOrigin}</Text>
        ) : null}
        {httpsSource !== null ? (
          <Text onPress={() => void Linking.openURL(httpsSource)}>fonte: {httpsSource}</Text>
        ) : rawSource !== null ? (
          <Text>fonte: {rawSource}</Text>
        ) : null}
        <Text>{provenanceLine}</Text>
        {result.isNew ? <Text>NOVO</Text> : null}
        <DecisionBar group={effectiveGroup} getToken={getToken} onDecided={handleGroupUpdated} />
        <TagInput
          group={effectiveGroup}
          projectId={projectId}
          projectTags={projectTags}
          getToken={getToken}
          onGroupUpdated={handleGroupUpdated}
        />
        {effectiveGroup !== null && effectiveGroup.originCount > 1 ? (
          <DedupGroupSection
            group={effectiveGroup}
            resultCache={resultCache}
            getToken={getToken}
            onGroupUpdated={handleGroupUpdated}
          />
        ) : null}
        {effectiveGroup === null ? <Text>grupo indisponível</Text> : null}
      </View>
    </ScrollView>
  );
}
