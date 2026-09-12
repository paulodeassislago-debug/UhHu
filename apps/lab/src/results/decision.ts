// apps/lab — helpers puros da decisão por grupo (08-03, UI-19, D-46).
//
// Definição única dos rótulos e do mapeamento botão→PUT; `DecisionBar.tsx`
// importa e re-exporta (testes importam daqui para não puxar react-native /
// expo-router no vitest node). Sem `any`.

import type { GroupDecision } from '@uhhu/contracts';

export type DecisionButtonId = 'elegivel' | 'nao' | 'indeciso';

export function decisionLabel(decision: string): 'elegível' | 'não elegível' | 'indeciso' {
  if (decision === 'eligible') {
    return 'elegível';
  }
  if (decision === 'ineligible') {
    return 'não elegível';
  }
  return 'indeciso';
}

export function decisionForButton(button: DecisionButtonId): GroupDecision {
  if (button === 'elegivel') {
    return 'eligible';
  }
  if (button === 'nao') {
    return 'ineligible';
  }
  return 'undecided';
}

export function formatDecidedAt(decidedAt: string | null): string {
  if (decidedAt === null) {
    return 'não triado';
  }
  const date = new Date(decidedAt);
  if (Number.isNaN(date.getTime())) {
    return `decidido em ${decidedAt}`;
  }
  const dd = String(date.getDate()).padStart(2, '0');
  const mo = String(date.getMonth() + 1).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `decidido em ${dd}/${mo} ${hh}:${mm}`;
}
