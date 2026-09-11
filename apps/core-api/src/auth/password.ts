// apps/core-api — hash de senha com argon2id (D-17, T-02-02-01).
//
// Parametros fixos: argon2id, 19 MiB (19456 KiB), 2 iteracoes, 1 thread —
// custo proposital contra dicionario/GPU sem travar o monolitico.
// NUNCA logar senha em claro; erros de formato viram `false` no verify
// (hash corrompido nao pode virar 500 com stack).

import argon2 from 'argon2';

export async function hashPassword(pw: string): Promise<string> {
  return argon2.hash(pw, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
}

export async function verifyPassword(hash: string, pw: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, pw);
  } catch {
    return false;
  }
}
