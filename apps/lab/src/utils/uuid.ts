// apps/lab — gerador de UUIDv4 cross-platform (gap UAT 12/09/2026, 07-05).
//
// `globalThis.crypto.randomUUID()` só existe em contexto seguro
// (HTTPS/localhost); o beta web roda via HTTP (tailnet) e o EXECUTAR AGORA
// quebrava com "crypto.randomUUID is not a function" — sem navegação, sem run.
// Este wrapper gera a Idempotency-Key dos 3 toques (search-form, run,
// SearchCard) em qualquer contexto — HTTPS, localhost, HTTP tailnet, Hermes.
//
// Cadeia (sempre CSPRNG local, nunca o PRNG fraco não-criptográfico — AGENTS.md):
// 1. `expo-crypto` `randomUUID()` (nativo sempre; web só em contexto seguro —
//    a implementação web delega para o atalho do global, que falta no beta
//    HTTP; por isso o try/catch abaixo é o próprio fix, não defesa morta).
// 2. `expo-crypto` `getRandomValues()` (nativo + web insegura) com formatação
//    UUIDv4 manual (version/variant bits RFC 4122). `getRandomBytes` NÃO é
//    usado: em `__DEV__` com remote debugging ele cai no PRNG fraco.
// 3. `globalThis.crypto.getRandomValues` direto (cinto + suspensório caso o
//    módulo nativo esteja parcialmente indisponível).
// Sem fonte válida o wrapper lança (inacessível na prática; melhor falhar alto
// que assinar a key com entropia fraca — T-07-05-01).
// A key é opaca por toque e viaja SÓ no header Idempotency-Key, como antes;
// sem auto-retry em 429 (T-07-02-02 preservado). Zero `any` (unknown+narrowing).

import { getRandomValues, randomUUID } from 'expo-crypto';

const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function byteHex(value: number): string {
  return (value & 0xff).toString(16).padStart(2, '0');
}

// 16 bytes CSPRNG → string UUIDv4 (8-4-4-4-12, version 4 + variant 10xxxxxx).
function formatUuidV4(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < 16; i += 1) {
    let b: number = bytes[i] ?? 0;
    if (i === 6) {
      b = (b & 0x0f) | 0x40;
    }
    if (i === 8) {
      b = (b & 0x3f) | 0x80;
    }
    if (i === 4 || i === 6 || i === 8 || i === 10) {
      out += '-';
    }
    out += byteHex(b);
  }
  return out;
}

// `getRandomValues` global direto (disponível em contexto inseguro, ao
// contrário de `randomUUID`). Último recurso antes de falhar alto.
function globalGetRandomValues(): Uint8Array | null {
  try {
    const holder: unknown = (globalThis as unknown as Record<string, unknown>)['crypto'];
    if (typeof holder !== 'object' || holder === null) {
      return null;
    }
    const fn: unknown = (holder as Record<string, unknown>)['getRandomValues'];
    if (typeof fn !== 'function') {
      return null;
    }
    const target = new Uint8Array(16);
    const filled: unknown = (fn as (data: Uint8Array) => Uint8Array).call(holder, target);
    if (filled instanceof Uint8Array && filled.length === 16) {
      return filled;
    }
    return null;
  } catch {
    return null;
  }
}

// `newIdempotencyKey()`: UUIDv4 único por chamada para o header Idempotency-Key (um por toque).
export function newIdempotencyKey(): string {
  try {
    const candidate: string = randomUUID();
    if (UUID_V4_PATTERN.test(candidate)) {
      return candidate;
    }
  } catch {
    // Contexto inseguro (beta HTTP) ou nativo sem o atalho: CSPRNG bruto abaixo.
  }
  try {
    const bytes: Uint8Array = getRandomValues(new Uint8Array(16));
    if (bytes.length === 16) {
      return formatUuidV4(bytes);
    }
  } catch {
    // Módulo parcialmente indisponível: tenta o global direto abaixo.
  }
  const direct: Uint8Array | null = globalGetRandomValues();
  if (direct !== null) {
    return formatUuidV4(direct);
  }
  throw new Error('Gerador de UUID indisponível (sem CSPRNG no runtime).');
}
