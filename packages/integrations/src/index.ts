// packages/integrations — barrel do pacote (fronteira integrations).
//
// Barrel único e estável para o executor (03-04) e as rotas (03-05): tipos,
// SourceClient, registry, health, adapters e postFilter. Adapters continuam
// importáveis pelo módulo direto; nenhuma colisão de nomes (verificado:
// getSourceAdapter/getAdapter/postFilter/describePostFilter são distintos).

export * from './types.js';
export * from './sourceClient.js';
export * from './registry.js';
export * from './health.js';
export * from './adapters.js';
export * from './postFilter.js';
