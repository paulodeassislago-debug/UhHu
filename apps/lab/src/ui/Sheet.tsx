// apps/lab — primitiva Sheet (modal) da W1 (spec UhHu_Lab_Tela_Shell_e_Primitivas).
//
// Props mínimas (visible, title, onClose, footer, children); fecha por `x`,
// backdrop e Esc (web). Backdrop transparente: captura o toque sem exigir
// token de cor novo (fase visual adiada). Sem uso na W1 (abre nas W2+);
// view model puro de apresentação.

import { useEffect } from 'react';
import type { JSX, ReactNode } from 'react';
import { Modal, Platform, Pressable, Text, View } from 'react-native';
import { theme } from './theme';

export interface SheetProps {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  testID?: string;
}

export function Sheet({
  visible,
  title,
  onClose,
  children,
  footer,
  testID = 'ui-sheet',
}: SheetProps): JSX.Element {
  useEffect(() => {
    if (!visible || Platform.OS !== 'web' || typeof document === 'undefined') {
      return;
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return (): void => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [visible, onClose]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View testID={testID} style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Pressable
          testID="sheet-backdrop"
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Fechar"
          style={{ position: 'absolute', top: 0, left: 0, bottom: 0, right: 0 }}
        />
        <View
          testID="sheet-panel"
          style={{
            backgroundColor: theme.colors.surface,
            borderWidth: theme.border.thin,
            padding: theme.space.xxl,
            gap: theme.space.lg,
            width: '90%',
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: theme.space.md,
            }}
          >
            <Text
              testID="sheet-title"
              style={{ flex: 1, fontSize: theme.type.title, fontWeight: '600' }}
            >
              {title}
            </Text>
            <Pressable
              testID="sheet-close"
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Fechar"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={{ fontSize: theme.type.title }}>x</Text>
            </Pressable>
          </View>
          {children}
          {footer !== undefined ? <View testID="sheet-footer">{footer}</View> : null}
        </View>
      </View>
    </Modal>
  );
}
