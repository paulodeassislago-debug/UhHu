// apps/lab — primitivas Card/ListItem da W1 (spec UhHu_Lab_Tela_Shell_e_Primitivas).
//
// Blocos de conteúdo por slot (surface, space, border.thin); `highlighted`
// usa o slot novo activeHighlight (destaque do projeto atual, sem literal).
// pressed = borda grossa; sem onPress, renderiza View estática.
// Criadas na W1 para as telas W2+ adotarem; view models de apresentação.

import type { JSX, ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import type { ViewStyle } from 'react-native';
import { theme } from './theme';

export interface CardProps {
  children: ReactNode;
  onPress?: () => void;
  highlighted?: boolean;
  testID?: string;
}

function cardStyle(highlighted: boolean, pressed: boolean): ViewStyle {
  return {
    borderWidth: pressed ? theme.border.thick : theme.border.thin,
    backgroundColor: highlighted ? theme.colors.activeHighlight : theme.colors.surface,
    padding: theme.space.xl,
    gap: theme.space.md,
  };
}

export function Card({
  children,
  onPress,
  highlighted = false,
  testID = 'ui-card',
}: CardProps): JSX.Element {
  if (onPress === undefined) {
    return (
      <View testID={testID} style={cardStyle(highlighted, false)}>
        {children}
      </View>
    );
  }
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }: { pressed: boolean }): ViewStyle => cardStyle(highlighted, pressed)}
    >
      {children}
    </Pressable>
  );
}

export interface ListItemProps {
  children: ReactNode;
  onPress?: () => void;
  active?: boolean;
  testID?: string;
}

export function ListItem({
  children,
  onPress,
  active = false,
  testID = 'ui-list-item',
}: ListItemProps): JSX.Element {
  const style: ViewStyle = {
    borderWidth: theme.border.thin,
    backgroundColor: active ? theme.colors.activeHighlight : theme.colors.surface,
    padding: theme.space.lg,
    gap: theme.space.md,
    flexDirection: 'row',
    alignItems: 'center',
  };
  if (onPress === undefined) {
    return (
      <View testID={testID} style={style}>
        {children}
      </View>
    );
  }
  return (
    <Pressable testID={testID} onPress={onPress} accessibilityRole="button" style={style}>
      {children}
    </Pressable>
  );
}
