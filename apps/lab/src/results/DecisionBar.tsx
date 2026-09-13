// apps/lab — barra de decisão mutável por grupo (08-03, UI-19, D-46).
//
// `DecisionBar({ group, getToken, onDecided })`: três botões com os verbos do
// esqueleto §7 `[elegível] [não] [indeciso]` com destaque no `group.decision`
// atual; linha `decidido em DD/MM HH:MM` (de decidedAt) ou `não triado`
// (decidedAt null, D-17 distingue indeciso-explícito de não-triado).
// Toque → busy + `labApi.setGroupDecision(group.id, { decision })` por groupId
// (nunca por resultId) → `onDecided(novoGroup)`; sem diálogo de confirmação
// para decidir ou reverter (basta outro toque); ApiError → mensagem verbatim
// inline sem trocar o estado exibido; 401 → markExpired + login; group null →
// três botões desabilitados + "grupo indisponível". Text escapa por padrão;
// sem WebView; sem eval. Sem `any`.

import { useRouter } from 'expo-router';
import { useState } from 'react';
import type { JSX } from 'react';
import { Button, Text, View } from 'react-native';
import type { DedupGroupDTO, GroupDecision } from '@uhhu/contracts';
import { ApiError } from '../api/client';
import type { TokenProvider } from '../api/client';
import { labApi } from '../api/lab';
import { useAuth } from '../auth/session';
import { decisionForButton, formatDecidedAt } from './decision';
import type { DecisionButtonId } from './decision';

export { decisionForButton, decisionLabel, formatDecidedAt } from './decision';
export type { DecisionButtonId } from './decision';

export interface DecisionBarProps {
  group: DedupGroupDTO | null;
  getToken: TokenProvider;
  onDecided: (group: DedupGroupDTO) => void;
}

function handleNoop(): void {}

export function DecisionBar({ group, getToken, onDecided }: DecisionBarProps): JSX.Element {
  const router = useRouter();
  const { markExpired } = useAuth();
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<{ message: string; requestId: string | null } | null>(null);

  function handleUnauthorized(): void {
    markExpired();
    router.replace({ pathname: '/login', params: { expired: '1' } });
  }

  async function handleDecide(button: DecisionButtonId): Promise<void> {
    if (group === null || busy) {
      return;
    }
    const decision: GroupDecision = decisionForButton(button);
    setBusy(true);
    setError(null);
    try {
      const updated: DedupGroupDTO = await labApi.setGroupDecision(
        group.id,
        { decision },
        { getToken },
      );
      onDecided(updated);
    } catch (unknownError: unknown) {
      if (unknownError instanceof ApiError && unknownError.status === 401) {
        handleUnauthorized();
        return;
      }
      if (unknownError instanceof ApiError) {
        setError({
          message: unknownError.message,
          requestId: unknownError.requestId !== '' ? unknownError.requestId : null,
        });
      } else if (unknownError instanceof Error) {
        setError({ message: unknownError.message, requestId: null });
      } else {
        setError({ message: 'Erro interno. Tente novamente.', requestId: null });
      }
    } finally {
      setBusy(false);
    }
  }

  if (group === null) {
    return (
      <View style={{ gap: 4 }}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button title="elegível" disabled onPress={handleNoop} />
          <Button title="não" disabled onPress={handleNoop} />
          <Button title="indeciso" disabled onPress={handleNoop} />
        </View>
        <Text>grupo indisponível</Text>
        <Text>não triado</Text>
      </View>
    );
  }

  const statusLine: string = formatDecidedAt(group.decidedAt);

  return (
    <View style={{ gap: 4 }}>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button
          title={group.decision === 'eligible' ? '• elegível' : 'elegível'}
          onPress={() => void handleDecide('elegivel')}
          disabled={busy}
        />
        <Button
          title={group.decision === 'ineligible' ? '• não' : 'não'}
          onPress={() => void handleDecide('nao')}
          disabled={busy}
        />
        <Button
          title={group.decision === 'undecided' ? '• indeciso' : 'indeciso'}
          onPress={() => void handleDecide('indeciso')}
          disabled={busy}
        />
      </View>
      <Text>{statusLine}</Text>
      {busy ? <Text>decidindo…</Text> : null}
      {error !== null ? (
        <View style={{ gap: 2 }}>
          <Text style={{ color: '#dc2626' }}>{error.message}</Text>
          {error.requestId !== null ? (
            <Text style={{ fontSize: 12 }}>(req {error.requestId})</Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
