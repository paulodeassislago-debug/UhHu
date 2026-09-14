// apps/lab — banner de erro com ação (§11, UI-03, 06-04 task 1).
//
// `ErrorBanner({ message, requestId, onRetry, onBack })`: banner vermelho
// claro com motivo legível verbatim do ApiError (ex.: fonte offline, fila
// cheia, timeout 60s) + requestId em caption + botões "Repetir" (onRetry
// refaz o fetch real — ação manual por toque, sem auto-retry, T-06-04-05) e
// "Voltar" quando houver navegação. Login usa para 401/429/500; projetos
// usa para falha de list. T-06-04-02: exibe message verbatim + requestId +
// Repetir que refaz o fetch real (nunca erro genérico que esconde a ação).

import type { JSX } from 'react';
import { Button, Text, View } from 'react-native';
import { theme } from './theme';

export interface ErrorBannerProps {
  message: string;
  requestId?: string | null;
  onRetry?: () => void;
  onBack?: () => void;
}

export function ErrorBanner({
  message,
  requestId,
  onRetry,
  onBack,
}: ErrorBannerProps): JSX.Element {
  return (
    <View
      testID="error-banner"
      style={{
        borderWidth: theme.border.thin,
        borderColor: theme.colors.dangerBorder,
        backgroundColor: theme.colors.dangerSurface,
        padding: theme.space.lg,
        gap: theme.space.md,
      }}
    >
      <Text style={{ fontWeight: '600' }}>Algo falhou</Text>
      <Text>{message}</Text>
      {typeof requestId === 'string' && requestId.length > 0 ? (
        <Text style={{ fontSize: theme.type.caption }}>(req {requestId})</Text>
      ) : null}
      {onRetry !== undefined ? <Button title="Repetir" onPress={onRetry} /> : null}
      {onBack !== undefined ? <Button title="Voltar" onPress={onBack} /> : null}
    </View>
  );
}
