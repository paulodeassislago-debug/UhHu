// apps/lab — primitiva Button da W1 (spec UhHu_Lab_Tela_Shell_e_Primitivas §4).
//
// Props mínimas (label, onPress, variant primary|secondary|danger, disabled,
// loading); estados default/pressed/disabled/loading. pressed = borda grossa
// (slots border.thin/thick); loading = sufixo de reticências + desativado
// (mesmo padrão das telas: "Salvando…"); disabled = não-interativo.
// Sem cor de destaque própria: a fase visual tema os slots (W1 é indireção).
// View model puro de apresentação; sem DTO de domínio.

import type { JSX } from 'react';
import { Pressable, Text } from 'react-native';
import type { ViewStyle } from 'react-native';
import { theme } from './theme';

export type ButtonVariant = 'primary' | 'secondary' | 'danger';

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  testID?: string;
}

function containerStyle(variant: ButtonVariant, pressed: boolean): ViewStyle {
  const base: ViewStyle = {
    borderWidth: pressed ? theme.border.thick : theme.border.thin,
    backgroundColor: theme.colors.surface,
    paddingVertical: theme.space.md,
    paddingHorizontal: theme.space.lg,
    gap: theme.space.xs,
    alignItems: 'center',
    justifyContent: 'center',
  };
  if (variant === 'danger') {
    base.backgroundColor = theme.colors.dangerSurface;
    base.borderColor = theme.colors.dangerBorder;
  }
  if (variant === 'secondary') {
    base.backgroundColor = undefined;
  }
  return base;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  testID = 'ui-button',
}: ButtonProps): JSX.Element {
  const inactive = disabled || loading;
  const text = loading ? `${label}…` : label;
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      style={({ pressed }: { pressed: boolean }): ViewStyle => containerStyle(variant, pressed)}
    >
      <Text
        style={{
          fontSize: theme.type.body,
          fontWeight: variant === 'primary' ? '600' : '400',
          color: variant === 'danger' ? theme.colors.danger : undefined,
        }}
      >
        {text}
      </Text>
    </Pressable>
  );
}
