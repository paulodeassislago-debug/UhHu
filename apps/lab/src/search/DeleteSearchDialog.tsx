// apps/lab — diálogo de cascata antes do hard-delete (UI-15, 07-04 task 2).
//
// `DeleteSearchDialog({ search, visible, onClose, onDeleted, getToken })`:
// ao abrir (visible true) busca `listRuns(search.id, { limit: 100 },
// { getToken })` → Nº de execuções (+ "+" se hasMore) e Nº de resultados
// (soma de coverage.bdtd + coverage.capes dos runs fetched). Falha na
// contagem → "contagem indisponível", mas o diálogo continua (contagem é
// informativa, nunca bloqueia nem autoriza — T-07-04-02).
// - Corpo: título "Excluir estratégia?", termo verbatim, 3 linhas de cascata
//   (execuções, resultados, decisões de elegibilidade e tags que serão
//   perdidas — sem número de decisões: sem endpoint barato na fase 7) +
//   aviso "Esta ação não pode ser desfeita (hard-delete).".
// - [Excluir] destrutivo chama `deleteSearch` (DELETE ?confirm=true, 204)
//   SÓ após o toque explícito — sem exclusão por gesto ambíguo, sem
//   auto-delete (T-07-04-01; sem ?confirm=true o servidor responde 400).
//   Sucesso → onDeleted(search.id) + onClose (a lista remove o card);
//   ApiError → mensagem verbatim dentro do diálogo, sem fechar.
// - Modal transparent como ProjectModal. Guards são UX; autorização real
//   continua no CORE (endpoints já owner-scoped, 404 genérico).
//   Text escapa por padrão; sem WebView; sem eval.

import { useEffect, useState } from 'react';
import type { JSX } from 'react';
import { Button, Modal, Text, View } from 'react-native';
import type { SearchDTO } from '@uhhu/contracts';
import { ApiError } from '../api/client';
import type { TokenProvider } from '../api/client';
import { labApi } from '../api/lab';

export interface DeleteSearchDialogProps {
  search: SearchDTO;
  visible: boolean;
  onClose: () => void;
  onDeleted: (searchId: string) => void;
  getToken: TokenProvider;
}

const CASCADE_FETCH_LIMIT = 100;

export function DeleteSearchDialog({
  search,
  visible,
  onClose,
  onDeleted,
  getToken,
}: DeleteSearchDialogProps): JSX.Element {
  const [runsCount, setRunsCount] = useState<number | null>(null);
  const [runsPlus, setRunsPlus] = useState<boolean>(false);
  const [resultsCount, setResultsCount] = useState<number | null>(null);
  const [countsReady, setCountsReady] = useState<boolean>(false);
  const [deleting, setDeleting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorRequestId, setErrorRequestId] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) {
      return;
    }
    let cancelled = false;
    async function fetchCounts(): Promise<void> {
      setCountsReady(false);
      setRunsCount(null);
      setRunsPlus(false);
      setResultsCount(null);
      try {
        const res = await labApi.listRuns(search.id, { limit: CASCADE_FETCH_LIMIT }, { getToken });
        if (cancelled) {
          return;
        }
        let total = 0;
        for (const run of res.items) {
          total += run.metrics.coverage.bdtd + run.metrics.coverage.capes;
        }
        setRunsCount(res.items.length);
        setRunsPlus(res.page.hasMore);
        setResultsCount(total);
        setCountsReady(true);
      } catch {
        // Contagem indisponível nunca bloqueia o diálogo (T-07-04-02).
        if (!cancelled) {
          setCountsReady(true);
        }
      }
    }
    void fetchCounts();
    return (): void => {
      cancelled = true;
    };
  }, [visible, search.id, getToken]);

  function handleClose(): void {
    if (deleting) {
      return;
    }
    setErrorMessage(null);
    setErrorRequestId(null);
    onClose();
  }

  async function handleDelete(): Promise<void> {
    setErrorMessage(null);
    setErrorRequestId(null);
    setDeleting(true);
    try {
      await labApi.deleteSearch(search.id, { getToken });
      onDeleted(search.id);
      onClose();
    } catch (error: unknown) {
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
    } finally {
      setDeleting(false);
    }
  }

  const runsLine =
    runsCount !== null
      ? `• ${runsCount}${runsPlus ? '+' : ''} execução(ões)`
      : '• contagem de execuções indisponível';
  const resultsLine =
    resultsCount !== null
      ? `• ~${resultsCount} resultado(s) (soma da cobertura)`
      : '• contagem de resultados indisponível';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <View
        style={{ flex: 1, justifyContent: 'center', padding: 24, backgroundColor: 'rgba(0,0,0,0.4)' }}
      >
        <View style={{ backgroundColor: '#ffffff', padding: 16, gap: 12 }}>
          <Text style={{ fontSize: 20, fontWeight: '600' }}>Excluir estratégia?</Text>
          <Text numberOfLines={2}>{search.term}</Text>
          {countsReady ? (
            <View style={{ gap: 2 }}>
              <Text>{runsLine}</Text>
              <Text>{resultsLine}</Text>
              <Text>• decisões de elegibilidade e tags associadas serão perdidas</Text>
            </View>
          ) : (
            <Text>carregando contagem…</Text>
          )}
          <Text>Esta ação não pode ser desfeita (hard-delete).</Text>
          {errorMessage !== null ? (
            <View style={{ gap: 2 }}>
              <Text style={{ color: '#dc2626' }}>{errorMessage}</Text>
              {errorRequestId !== null ? (
                <Text style={{ fontSize: 12 }}>(req {errorRequestId})</Text>
              ) : null}
            </View>
          ) : null}
          <Button title="Cancelar" onPress={handleClose} disabled={deleting} />
          <Button
            title={deleting ? 'Excluindo…' : 'Excluir'}
            onPress={() => void handleDelete()}
            disabled={deleting}
            color="#dc2626"
          />
        </View>
      </View>
    </Modal>
  );
}
