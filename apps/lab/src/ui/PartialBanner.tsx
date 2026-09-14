// apps/lab — banner parcial âmbar (§11, UI-03, 06-04 task 1).
//
// `PartialBanner({ whatCame, whatMissed, status, children })`: banner âmbar
// "Chegaram X, faltou Y" + slot para decisões sobre o que veio (placeholder
// na fase 6; wire real nas fases 8-9). A prop `status` aceita
// 'ok' | 'partial' | 'failed' para reuso nos runs futuros: com 'ok' não há
// nada a advertir (renderiza null); com 'partial' mostra o âmbar parcial;
// com 'failed' mostra o mesmo quadro em tom de falha. View model puro de
// apresentação; sem DTO de domínio.

import type { JSX, ReactNode } from 'react';
import { Text, View } from 'react-native';
import { theme } from './theme';

export type PartialStatus = 'ok' | 'partial' | 'failed';

export interface PartialBannerProps {
  whatCame: string;
  whatMissed: string;
  status?: PartialStatus;
  children?: ReactNode;
}

export function PartialBanner({
  whatCame,
  whatMissed,
  status = 'partial',
  children,
}: PartialBannerProps): JSX.Element | null {
  if (status === 'ok') {
    return null;
  }
  const failed = status === 'failed';
  return (
    <View
      testID="partial-banner"
      style={{
        borderWidth: theme.border.thin,
        borderColor: failed ? theme.colors.dangerBorder : theme.colors.warningBorder,
        backgroundColor: failed ? theme.colors.dangerSurface : theme.colors.warningSurface,
        padding: theme.space.lg,
        gap: theme.space.md,
      }}
    >
      <Text style={{ fontWeight: '600' }}>
        {failed ? 'Resultado com falha' : 'Resultado parcial'}
      </Text>
      <Text>
        Chegaram {whatCame}, faltou {whatMissed}.
      </Text>
      {children}
    </View>
  );
}
