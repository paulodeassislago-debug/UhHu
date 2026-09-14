// apps/lab — primitiva Field da W1 (spec UhHu_Lab_Tela_Shell_e_Primitivas §4).
//
// Props mínimas (label, value, onChange, multiline, maxLength, error);
// estados default/focado/disabled/erro. Foco = borda grossa, erro = borda e
// texto na família danger, disabled = fundo skeletonWeak (slots existentes).
// View model puro de apresentação; validação de domínio continua no CORE.

import { useState } from 'react';
import type { JSX } from 'react';
import { Text, TextInput, View } from 'react-native';
import { theme } from './theme';

export interface FieldProps {
  label: string;
  value: string;
  onChange?: (text: string) => void;
  placeholder?: string;
  multiline?: boolean;
  maxLength?: number;
  error?: string | null;
  editable?: boolean;
  testID?: string;
}

export function Field({
  label,
  value,
  onChange,
  placeholder,
  multiline = false,
  maxLength,
  error = null,
  editable = true,
  testID = 'ui-field',
}: FieldProps): JSX.Element {
  const [focused, setFocused] = useState<boolean>(false);
  const hasError = typeof error === 'string' && error.length > 0;
  return (
    <View style={{ gap: theme.space.xs }} testID={testID}>
      <Text style={{ fontSize: theme.type.caption }}>{label}</Text>
      <TextInput
        testID={`${testID}-input`}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        multiline={multiline}
        maxLength={maxLength}
        editable={editable}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          borderWidth: focused ? theme.border.thick : theme.border.thin,
          borderColor: hasError ? theme.colors.dangerBorder : undefined,
          backgroundColor: editable ? theme.colors.surface : theme.colors.skeletonWeak,
          padding: theme.space.md,
          fontSize: theme.type.body,
        }}
      />
      {hasError ? (
        <Text
          testID={`${testID}-error`}
          style={{ fontSize: theme.type.caption, color: theme.colors.danger }}
        >
          {error}
        </Text>
      ) : null}
    </View>
  );
}
