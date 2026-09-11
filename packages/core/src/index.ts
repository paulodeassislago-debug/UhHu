// packages/core — fronteira de dominio compartilhado (capabilities).
// Re-exporta o contexto do ator; casos de uso dos modulos vivem aqui.

export { isAdmin, requireUser, UnauthenticatedError, type ActorContext } from './actor.js';
export {
  createExecutor,
  UnknownCapabilityError,
  CAPABILITY_VERSION,
  type CapabilityExecutor,
  type CapabilityHandler,
} from './capabilities.js';
export type { CapabilityName } from '@uhhu/contracts';
