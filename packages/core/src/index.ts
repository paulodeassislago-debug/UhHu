// packages/core — fronteira de dominio compartilhado (capabilities).
// Re-exporta o contexto do ator; casos de uso dos modulos vivem aqui.

export { isAdmin, requireUser, UnauthenticatedError, type ActorContext } from './actor.js';
