// apps/lab — testes puros da barra de decisão (08-03 task 1, UI-19).
//
// Cobre: decisionLabel nos 3 estados (elegível/não elegível/indeciso) +
// fallback para valor desconhecido; mapeamento botão→valor de PUT
// (eligible/ineligible/undecided) via helper puro decisionForButton; e o
// wiring do DecisionBar (PUT por groupId via setGroupDecision, sem rota
// stale, com decidedAt visível) por leitura de fonte — sem importar
// react-native/expo-router no vitest node. Sem rede/timers/`any`.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decisionForButton, decisionLabel, formatDecidedAt } from '../decision';
import type { DecisionButtonId } from '../decision';

describe('decisionLabel nos 3 estados', () => {
  it('eligible vira elegível', () => {
    expect(decisionLabel('eligible')).toBe('elegível');
  });

  it('ineligible vira não elegível', () => {
    expect(decisionLabel('ineligible')).toBe('não elegível');
  });

  it('undecided vira indeciso', () => {
    expect(decisionLabel('undecided')).toBe('indeciso');
  });

  it('valor desconhecido cai em indeciso (fallback)', () => {
    expect(decisionLabel('bogus')).toBe('indeciso');
    expect(decisionLabel('')).toBe('indeciso');
  });
});

describe('decisionForButton mapeia botão→valor de PUT', () => {
  it('elegivel vira eligible', () => {
    const button: DecisionButtonId = 'elegivel';
    expect(decisionForButton(button)).toBe('eligible');
  });

  it('nao vira ineligible', () => {
    const button: DecisionButtonId = 'nao';
    expect(decisionForButton(button)).toBe('ineligible');
  });

  it('indeciso vira undecided', () => {
    const button: DecisionButtonId = 'indeciso';
    expect(decisionForButton(button)).toBe('undecided');
  });
});

describe('formatDecidedAt distingue não triado de decidido em', () => {
  it('null vira não triado', () => {
    expect(formatDecidedAt(null)).toBe('não triado');
  });

  it('ISO vira decidido em DD/MM HH:MM', () => {
    const out: string = formatDecidedAt('2026-09-12T10:05:00.000Z');
    expect(out.startsWith('decidido em ')).toBe(true);
  });
});

function readDecisionBarSource(): string {
  return readFileSync(new URL('../DecisionBar.tsx', import.meta.url), 'utf8');
}

describe('DecisionBar wiring por groupId (sem rota stale)', () => {
  it('chama setGroupDecision por groupId', () => {
    const source: string = readDecisionBarSource();
    expect(source.includes('setGroupDecision')).toBe(true);
    expect(source.includes('group.id')).toBe(true);
  });

  it('exibe decidedAt (decidido em / não triado)', () => {
    const source: string = readDecisionBarSource();
    expect(source.includes('decidido em')).toBe(true);
    expect(source.includes('não triado')).toBe(true);
  });
});
