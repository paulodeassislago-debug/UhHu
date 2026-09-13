// apps/lab — tela de Execução com acompanhamento (D-07/D-08, UI-14, 07-03 task 2).
//
// Rota /project/[id]/run?runId=<uuid>&searchId=<uuid> (Executar no card e no
// form criam o run e chegam aqui). Blocos fiéis ao esqueleto §7:
// - Cabeçalho: `Execução #<curta> — "<termo>"` + fontes + data + total + duração.
// - Progresso por fonte sempre visível (pedidas em sourcesSnapshot × estado em
//   perSource, linha pura em src/search/pageProgress): "buscando…" no
//   não-terminal, "buscando página X de ~Y" com métricas de páginas (08-06),
//   "<n> itens · <ms>ms" no terminal, "pulada"/"falhou" conforme a fonte.
//   Blocos explícitos por fonte (BDTD/CAPES), sem iteração genérica sobre a
//   lista (tripwire scroll-containers).
// - Botão Cancelar visível enquanto o run está vivo (08-06: sempre — inclui
//   loading/timeout/erro de acompanhamento, quando o servidor ainda executa);
//   some no terminal (o servidor rejeita terminar run terminal). Erro → banner.
// - Banners por desfecho: succeeded → "ok" discreto; partial → PartialBanner âmbar
//   (o que veio + o que faltou com o motivo); failed → ErrorBanner com o motivo
//   verbatim + Repetir (novo executeSearch com Idempotency-Key + replace do runId);
//   cancelled → "Execução cancelada" + Executar novamente (mesmo fluxo repetir).
// - Rodapé terminal com contagem de novos + botão Ver resultados para a
//   lista real da fase 8 (destino /project/[id]/results?runId=<uuid>,
//   succeeded/partial; failed/cancelled mantêm fluxos).
// - Polling via useRunPolling (2500ms, teto 720 ≈ 30min, para em terminal/timeout/unmount;
//   cleanup nunca encerra no servidor — D-08: sair no meio e voltar retoma).
// - runId ausente ou fora do formato uuid → ErrorBanner "Execução inválida" +
//   Voltar, SEM request (query é hostil; T-07-03-01). 401 → expired/next com runId.
// Guards são UX; autorização real continua no CORE (AGENTS.md). Text escapa por
// padrão; sem WebView; sem eval.

import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import type { JSX } from 'react';
import { Button, ScrollView, Text, View } from 'react-native';
import type { SearchRunDTO } from '@uhhu/contracts';
import { ApiError } from '../../../src/api/client';
import { labApi } from '../../../src/api/lab';
import { useAuth } from '../../../src/auth/session';
import { formatDurationMs, isTerminalStatus, useRunPolling } from '../../../src/search/useRunPolling';
import { sourceProgressLine } from '../../../src/search/pageProgress';
import { ErrorBanner } from '../../../src/ui/ErrorBanner';
import { PartialBanner } from '../../../src/ui/PartialBanner';
import { CardSkeleton } from '../../../src/ui/Skeleton';
import { newIdempotencyKey } from '../../../src/utils/uuid';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function formatExecutedAt(iso: string): string {
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

// Linha de progresso por fonte vive em src/search/pageProgress (pura,
// testável sem react-native); a tela só monta o JSX com a string.

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

export default function RunScreen(): JSX.Element {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string; runId?: string; searchId?: string }>();
  const projectId = typeof params.id === 'string' ? params.id : '';
  const rawRunId: string | string[] | undefined = params.runId;
  const runId = typeof rawRunId === 'string' ? rawRunId : '';
  const rawSearchId: string | string[] | undefined = params.searchId;
  const searchId = typeof rawSearchId === 'string' ? rawSearchId : '';
  const runIdValid: boolean = UUID_RE.test(runId);
  const { user, loading: authLoading, expired, getToken, markExpired } = useAuth();
  // runId inválido não dispara request (o hook trata '' como erro local).
  const { run, pollState, error, retry } = useRunPolling(runIdValid ? runId : '', getToken);
  const [cancelledRun, setCancelledRun] = useState<SearchRunDTO | null>(null);
  const [cancelling, setCancelling] = useState<boolean>(false);
  const [repeating, setRepeating] = useState<boolean>(false);
  const [actionError, setActionError] = useState<{
    message: string;
    requestId: string | null;
  } | null>(null);
  const redirectedRef = useRef<boolean>(false);

  const nextAfterLogin =
    searchId.length > 0
      ? `/project/${projectId}/run?runId=${runId}&searchId=${searchId}`
      : `/project/${projectId}/run?runId=${runId}`;

  // Repetir troca o runId na mesma rota sem remontar: limpa o estado local do
  // run anterior (o hook recomeça sozinho pelo runId novo).
  useEffect(() => {
    setCancelledRun(null);
    setActionError(null);
    redirectedRef.current = false;
  }, [runId]);

  useEffect(() => {
    if (authLoading || expired) {
      return;
    }
    if (user === null) {
      router.replace({ pathname: '/login', params: { next: nextAfterLogin } });
    }
  }, [authLoading, expired, user, router, nextAfterLogin]);

  useEffect(() => {
    if (error !== null && error.status === 401 && !redirectedRef.current) {
      redirectedRef.current = true;
      markExpired();
      router.replace({ pathname: '/login', params: { expired: '1', next: nextAfterLogin } });
    }
  }, [error, markExpired, router, nextAfterLogin]);

  async function handleCancel(): Promise<void> {
    const current: SearchRunDTO | null = cancelledRun ?? run;
    if (current === null) {
      return;
    }
    setActionError(null);
    setCancelling(true);
    try {
      const dto: SearchRunDTO = await labApi.cancelJob(current.id, { getToken });
      setCancelledRun(dto);
    } catch (unknownError: unknown) {
      if (unknownError instanceof ApiError && unknownError.status === 401) {
        markExpired();
        router.replace({ pathname: '/login', params: { expired: '1', next: nextAfterLogin } });
        return;
      }
      setActionError(toBanner(unknownError));
    } finally {
      setCancelling(false);
    }
  }

  function handleCancelPress(): void {
    void handleCancel();
  }

  async function handleRepeat(): Promise<void> {
    if (searchId.length === 0) {
      return;
    }
    setActionError(null);
    setRepeating(true);
    try {
      const dto: SearchRunDTO = await labApi.executeSearch(searchId, {
        getToken,
        idempotencyKey: newIdempotencyKey(),
      });
      router.replace(`/project/${projectId}/run?runId=${dto.id}&searchId=${searchId}`);
    } catch (unknownError: unknown) {
      if (unknownError instanceof ApiError && unknownError.status === 401) {
        markExpired();
        router.replace({ pathname: '/login', params: { expired: '1', next: nextAfterLogin } });
        return;
      }
      setActionError(toBanner(unknownError));
    } finally {
      setRepeating(false);
    }
  }

  function handleRepeatPress(): void {
    void handleRepeat();
  }

  function handleBack(): void {
    router.back();
  }

  function handleOpenResults(): void {
    const current: SearchRunDTO | null = cancelledRun ?? run;
    if (current === null) {
      return;
    }
    if (searchId.length > 0) {
      router.push(`/project/${projectId}/results?runId=${current.id}&searchId=${searchId}`);
    } else {
      router.push(`/project/${projectId}/results?runId=${current.id}`);
    }
  }

  if (authLoading) {
    return (
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1, padding: 24, gap: 12 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={{ fontSize: 24, fontWeight: '600' }}>Execução</Text>
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
        <Text style={{ fontSize: 24, fontWeight: '600' }}>Execução</Text>
        <Text>Redirecionando para o login…</Text>
      </ScrollView>
    );
  }

  if (projectId.length === 0) {
    return (
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1, padding: 24, gap: 12 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={{ fontSize: 24, fontWeight: '600' }}>Execução</Text>
        <ErrorBanner message="Projeto inválido." onBack={handleBack} />
      </ScrollView>
    );
  }

  if (!runIdValid) {
    return (
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1, padding: 24, gap: 12 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={{ fontSize: 24, fontWeight: '600' }}>Execução</Text>
        <ErrorBanner message="Execução inválida." onBack={handleBack} />
      </ScrollView>
    );
  }

  // 401 mostra o aviso de redirecionamento (o efeito acima já navegou).
  if (error !== null && error.status === 401) {
    return (
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1, padding: 24, gap: 12 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={{ fontSize: 24, fontWeight: '600' }}>Execução</Text>
        <Text>Redirecionando para o login…</Text>
      </ScrollView>
    );
  }

  const effectiveRun: SearchRunDTO | null = cancelledRun ?? run;

  if (effectiveRun === null) {
    if (pollState === 'loading') {
      return (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ flexGrow: 1, padding: 24, gap: 12 }}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={{ fontSize: 24, fontWeight: '600' }}>
            Execução #{runId.slice(0, 8)}
          </Text>
          <CardSkeleton count={2} />
        </ScrollView>
      );
    }
    if (pollState === 'timeout') {
      return (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ flexGrow: 1, padding: 24, gap: 12 }}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={{ fontSize: 24, fontWeight: '600' }}>
            Execução #{runId.slice(0, 8)}
          </Text>
          <ErrorBanner
            message="Acompanhamento excedido — reabra a tela."
            onRetry={retry}
            onBack={handleBack}
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
        <Text style={{ fontSize: 24, fontWeight: '600' }}>Execução #{runId.slice(0, 8)}</Text>
        <ErrorBanner
          message={error?.message ?? 'Erro interno. Tente novamente.'}
          requestId={error !== null && error.requestId !== '' ? error.requestId : null}
          onRetry={retry}
          onBack={handleBack}
        />
      </ScrollView>
    );
  }

  const total: number = effectiveRun.metrics.coverage.bdtd + effectiveRun.metrics.coverage.capes;
  const duration: string = formatDurationMs(
    effectiveRun.startedAt,
    effectiveRun.finishedAt,
    Date.now(),
  );
  const showsBdtd: boolean = effectiveRun.sourcesSnapshot.includes('bdtd');
  const showsCapes: boolean = effectiveRun.sourcesSnapshot.includes('capes');
  const terminal: boolean = isTerminalStatus(effectiveRun.status);
  // Botão Cancelar visível enquanto o run está vivo (08-06: sempre — inclui
  // loading/timeout/erro de acompanhamento, quando o servidor ainda executa).
  // Some no terminal (o servidor rejeita terminar run terminal), no
  // cancelamento em voo e sem estado confirmado. D-08 preservado: sair da
  // tela nunca cancela no servidor (o hook limpa só o timer).
  const cancellable: boolean = !terminal && !cancelling;

  const okLabels: string[] = [];
  const missedLabels: string[] = [];
  if (showsBdtd) {
    if (effectiveRun.metrics.perSource.bdtd.status === 'ok') {
      okLabels.push('BDTD');
    } else {
      missedLabels.push('BDTD');
    }
  }
  if (showsCapes) {
    if (effectiveRun.metrics.perSource.capes.status === 'ok') {
      okLabels.push('CAPES');
    } else {
      missedLabels.push('CAPES');
    }
  }
  const whatCame: string = `${total} itens (${okLabels.join(' + ')})`;
  const missedSources: string = missedLabels.length > 0 ? missedLabels.join(' + ') : 'fontes';
  const whatMissed: string = `${missedSources} (motivo: ${effectiveRun.error?.message ?? 'fonte indisponível'})`;

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ flexGrow: 1, padding: 24, gap: 12 }}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={{ fontSize: 24, fontWeight: '600' }}>
        Execução #{runId.slice(0, 8)} — &quot;{effectiveRun.termSnapshot}&quot;
      </Text>
      <Text>
        {effectiveRun.sourcesSnapshot.join(' + ').toUpperCase()} ·{' '}
        {formatExecutedAt(effectiveRun.executedAt)} · {total} resultados · {duration}
      </Text>
      {showsBdtd ? (
        <View style={{ borderWidth: 1, padding: 12, gap: 4 }}>
          <Text style={{ fontWeight: '600' }}>BDTD</Text>
          <Text>BDTD: {sourceProgressLine('bdtd', effectiveRun)}</Text>
        </View>
      ) : null}
      {showsCapes ? (
        <View style={{ borderWidth: 1, padding: 12, gap: 4 }}>
          <Text style={{ fontWeight: '600' }}>CAPES</Text>
          <Text>CAPES: {sourceProgressLine('capes', effectiveRun)}</Text>
        </View>
      ) : null}
      {cancellable ? (
        <Button
          title={cancelling ? 'Cancelando…' : 'Cancelar'}
          onPress={handleCancelPress}
          disabled={cancelling}
        />
      ) : null}
      {actionError !== null ? (
        <ErrorBanner message={actionError.message} requestId={actionError.requestId} />
      ) : null}
      {pollState === 'timeout' && !terminal ? (
        <ErrorBanner message="Acompanhamento excedido — reabra a tela." onRetry={retry} />
      ) : null}
      {pollState === 'error' && error !== null && !terminal ? (
        <ErrorBanner
          message={error.message}
          requestId={error.requestId !== '' ? error.requestId : null}
          onRetry={retry}
        />
      ) : null}
      {effectiveRun.status === 'succeeded' ? <Text>ok</Text> : null}
      {effectiveRun.status === 'partial' ? (
        <PartialBanner status="partial" whatCame={whatCame} whatMissed={whatMissed} />
      ) : null}
      {effectiveRun.status === 'failed' ? (
        <ErrorBanner
          message={effectiveRun.error?.message ?? 'Erro interno. Tente novamente.'}
          {...(searchId.length > 0 ? { onRetry: handleRepeatPress } : {})}
        />
      ) : null}
      {effectiveRun.status === 'cancelled' ? (
        <View style={{ gap: 8 }}>
          <Text>Execução cancelada</Text>
          {searchId.length > 0 ? (
            <Button
              title={repeating ? 'Executando…' : 'Executar novamente'}
              onPress={handleRepeatPress}
              disabled={repeating}
            />
          ) : null}
        </View>
      ) : null}
      {(terminal && effectiveRun.status === 'succeeded') ||
      (terminal && effectiveRun.status === 'partial') ? (
        <View style={{ gap: 4 }}>
          <Text>
            {effectiveRun.metrics.newCount} NOVOS desde a última execução
          </Text>
          <Button title="Ver resultados" onPress={handleOpenResults} />
        </View>
      ) : null}
    </ScrollView>
  );
}
