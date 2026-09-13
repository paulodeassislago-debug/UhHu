// apps/lab — estado vazio orientador (§11, UI-03, 06-04 task 1).
//
// `Empty({ title, message, actionLabel, onAction })`: mensagem orientadora +
// ação principal. Textos exatos do esqueleto por tela (sem reinventar):
// - projetos → title "Nenhum projeto ainda", message "Comece uma pesquisa
//   para organizar estratégias, runs e corpus.", action "Criar projeto".
// - projeto sem estratégias (placeholder fase 6) → "Nenhuma estratégia —
//   defina a primeira busca (fase 7)".
// Criar é fase 7: a ação vem desabilitada com dica "disponível na fase 7"
// (sem implementar criar aqui). View model puro de apresentação (props
// locais); DTOs continuam de @uhhu/contracts (AGENTS.md).

import type { JSX } from 'react';
import { Button, Text, View } from 'react-native';
import { theme } from './theme';

export interface EmptyProps {
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  disabled?: boolean;
  disabledHint?: string;
}

export function Empty({
  title,
  message,
  actionLabel,
  onAction,
  disabled = false,
  disabledHint,
}: EmptyProps): JSX.Element {
  return (
    <View
      testID="empty-state"
      style={{ borderWidth: theme.border.thin, padding: theme.space.xl, gap: theme.space.md }}
    >
      <Text style={{ fontSize: theme.type.subtitle, fontWeight: '600' }}>{title}</Text>
      <Text>{message}</Text>
      {actionLabel !== undefined ? (
        <Button
          title={actionLabel}
          onPress={onAction ?? (() => undefined)}
          disabled={disabled || onAction === undefined}
        />
      ) : null}
      {disabled && disabledHint !== undefined ? (
        <Text style={{ fontSize: theme.type.caption }}>{disabledHint}</Text>
      ) : null}
    </View>
  );
}
