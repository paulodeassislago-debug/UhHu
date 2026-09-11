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
        borderWidth: 1,
        borderColor: failed ? '#fca5a5' : '#fcd34a',
        backgroundColor: failed ? '#fef2f2' : '#fffbeb',
        padding: 12,
        gap: 8,
      }}
    >
      <Text style={{ fontWeight: '600' }}>{failed ? 'Resultado com falha' : 'Resultado parcial'}</Text>
      <Text>
        Chegaram {whatCame}, faltou {whatMissed}.
      </Text>
      {children}
    </View>
  );
}
