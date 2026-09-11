// packages/integrations — barrel do pacote (fronteira integrations).
//
// Adapters (bdtd/capes, 03-03) sao importados pelos proprios modulos e pelo
// executor (03-04); este barrel expoe tipos, SourceClient, registry e health.
// (health entra na task 2 deste plano.)

export * from './types.js';
export * from './sourceClient.js';
export * from './registry.js';
