// packages/core — registry + execute() de capabilities (contrato §10, D-54).
//
// A cadeia total executa por aqui: REST/CLI/MCP sao adaptadores finos sobre
// execute(), sem duplicar regra de negocio. Handlers sao injetados no boot
// (05-02); sem mapa injetado nada executa (fail-closed). Este modulo NUNCA
// importa @uhhu/db: persistencia vive nos casos de uso injetados, nao no
// registry (guard D-55 prova estruturalmente).

import { capabilityNameSchema } from '@uhhu/contracts';
import type { CapabilityName } from '@uhhu/contracts';
import type { ActorContext } from './actor.js';

export const CAPABILITY_VERSION = 'v1' as const;

export type CapabilityHandler = (input: unknown, actor: ActorContext) => Promise<unknown>;

export class UnknownCapabilityError extends Error {
  readonly name = 'UnknownCapabilityError';

  constructor(readonly capability: string) {
    super(`Capability desconhecida: ${capability}.`);
  }
}

export type CapabilityExecutor = (
  name: CapabilityName | string,
  input: unknown,
  actor: ActorContext,
) => Promise<unknown>;

// Unico construtor: exige o mapa completo de handlers (fail-closed).
export function createExecutor(
  handlers: Record<CapabilityName, CapabilityHandler>,
): CapabilityExecutor {
  return async function executeCapability(
    name: CapabilityName | string,
    input: unknown,
    actor: ActorContext,
  ): Promise<unknown> {
    const parsed = capabilityNameSchema.safeParse(name);
    if (!parsed.success) {
      throw new UnknownCapabilityError(name);
    }
    const handler: CapabilityHandler = handlers[parsed.data];
    if (handler === undefined) {
      throw new UnknownCapabilityError(name);
    }
    return handler(input, actor);
  };
}
