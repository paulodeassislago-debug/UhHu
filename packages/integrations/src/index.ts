// packages/integrations — barrel do pacote (fronteira integrations).
//
// Adapters (bdtd/capes, 03-03) sao importados pelos proprios modulos e pelo
// executor (03-04); este barrel expoe tipos, SourceClient, registry e health.

export * from './types.js';
export * from './sourceClient.js';
export * from './registry.js';
export * from './health.js';
