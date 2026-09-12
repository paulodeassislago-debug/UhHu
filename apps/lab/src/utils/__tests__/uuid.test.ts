// apps/lab — testes do gerador de UUID cross-platform (gap UAT 12/09/2026, 07-05).
//
// `newIdempotencyKey()` alimenta o header Idempotency-Key dos 3 toques
// (search-form, run, SearchCard). O `expo-crypto` real não carrega no vitest
// (módulo nativo + resolução Metro), então é mockado aqui simulando a web em
// contexto inseguro: `randomUUID()` lança (como a build web no beta HTTP via
// tailnet) e `getRandomValues()` preenche com o CSPRNG real do node.
// Sem `any` (unknown + narrowing só onde o runtime exige); sem rede; sem segredo.

import { afterEach, describe, expect, it, vi } from 'vitest';

const expoCtl = vi.hoisted(() => ({ mode: 'insecure' as string }));

vi.mock('expo-crypto', () => {
  return {
    randomUUID: (): string => {
      if (expoCtl.mode === 'secure') {
        return globalThis.crypto.randomUUID();
      }
      throw new Error('globalThis.crypto.randomUUID is not a function');
    },
    getRandomValues: (arr: Uint8Array): Uint8Array => {
      if (expoCtl.mode === 'no-expo') {
        throw new Error('expo-crypto indisponível');
      }
      globalThis.crypto.getRandomValues(arr);
      return arr;
    },
  };
});

import { newIdempotencyKey } from '../uuid';

const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

afterEach(() => {
  expoCtl.mode = 'insecure';
});

describe('newIdempotencyKey (gap UAT 12/09/2026 — beta HTTP sem randomUUID)', () => {
  it('retorna string no formato UUIDv4 mesmo com randomUUID indisponível', () => {
    const key: string = newIdempotencyKey();
    expect(typeof key).toBe('string');
    expect(UUID_V4_RE.test(key)).toBe(true);
  });

  it('duas chamadas seguidas geram keys diferentes (uma por toque)', () => {
    const first: string = newIdempotencyKey();
    const second: string = newIdempotencyKey();
    expect(first).not.toBe(second);
  });

  it('1000 chamadas não colidem', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i += 1) {
      seen.add(newIdempotencyKey());
    }
    expect(seen.size).toBe(1000);
  });

  it('gera mesmo sem crypto.randomUUID no global (cenário exato do beta HTTP)', () => {
    const holder: Crypto = globalThis.crypto;
    const original: Crypto['randomUUID'] = holder.randomUUID.bind(holder);
    Object.defineProperty(holder, 'randomUUID', {
      value: undefined,
      configurable: true,
      writable: true,
    });
    try {
      const key: string = newIdempotencyKey();
      expect(UUID_V4_RE.test(key)).toBe(true);
    } finally {
      Object.defineProperty(holder, 'randomUUID', {
        value: original,
        configurable: true,
        writable: true,
      });
    }
    expect(typeof holder.randomUUID).toBe('function');
  });

  it('usa o atalho nativo quando disponível (contexto seguro)', () => {
    expoCtl.mode = 'secure';
    const key: string = newIdempotencyKey();
    expect(UUID_V4_RE.test(key)).toBe(true);
  });

  it('degrada para o getRandomValues global quando o expo falha por inteiro', () => {
    expoCtl.mode = 'no-expo';
    const key: string = newIdempotencyKey();
    expect(UUID_V4_RE.test(key)).toBe(true);
  });
});
