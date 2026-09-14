// apps/lab — ScreenHeader da W1 (spec UhHu_Lab_Tela_Shell_e_Primitivas §3/§4).
//
// Fixo (não rola): marca à esquerda · título da rota ao centro · Perfil
// (placeholder inerte — sem tela de perfil nesta wave) + Sair à direita
// (logout do AuthProvider via props; loading enquanto encerra).
// onMenuPress existe só no modo drawer (D8: sidebar oculta precisa do ☰ no
// header); omitido em paisagem. Só slots theme.*.

import type { JSX } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Button } from './Button';
import { theme } from './theme';

export interface ScreenHeaderProps {
  title: string;
  onLogout: () => void;
  logoutLoading?: boolean;
  onMenuPress?: () => void;
}

export function ScreenHeader({
  title,
  onLogout,
  logoutLoading = false,
  onMenuPress,
}: ScreenHeaderProps): JSX.Element {
  return (
    <View
      testID="screen-header"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.space.md,
        paddingHorizontal: theme.space.xl,
        paddingVertical: theme.space.md,
        borderBottomWidth: theme.border.thin,
        borderBottomColor: theme.colors.skeletonStrong,
        backgroundColor: theme.colors.surface,
      }}
    >
      {onMenuPress !== undefined ? (
        <Pressable
          testID="header-menu"
          onPress={onMenuPress}
          accessibilityRole="button"
          accessibilityLabel="Abrir menu"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={{ fontSize: theme.type.title }}>☰</Text>
        </Pressable>
      ) : null}
      <Text testID="header-brand" style={{ fontSize: theme.type.title, fontWeight: '600' }}>
        UhHU Lab
      </Text>
      <Text
        testID="header-title"
        numberOfLines={1}
        style={{ flex: 1, textAlign: 'center', fontSize: theme.type.title }}
      >
        {title}
      </Text>
      <Text testID="header-profile" style={{ fontSize: theme.type.body }}>
        Perfil
      </Text>
      <Button
        testID="header-logout"
        label="Sair"
        variant="secondary"
        loading={logoutLoading}
        onPress={onLogout}
      />
    </View>
  );
}
