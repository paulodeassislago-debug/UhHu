# Phase 3: Buscas e adapters - Discussion Log

**Date:** 2026-09-11
**Mode:** discuss (4/4 areas, user chose "all")

## Areas → Decisions

### 1. Execução sync/async + jobs + cancelamento → D-28, D-29, D-30
- Q: 201 sync vs 202 async? A: 25s sync, resto async + polling.
- Q: Timeout + cancel? A: fila 60s + preserva parciais.
- Q: Job↔Run mapping? A: 1:1 mesmos estados.

### 2. Busca declarativa + filtros + pós-filtro → D-31, D-32, D-33
- Q: sintaxe booleanos? A (custom): "a opcao com melhor compatibilidade com as apis da capes e do bdtd" → string livre AND/OR/NOT + aspas, pass-through + pós-filtro Core.
- Q: filtros v1? A: todos da spec + pós-filtro.
- Q: edição + oasisbr? A: editável, runs congelam; oasisbr → 400.

### 3. Proveniência + enriquecimento + diff → D-34, D-35, D-36
- Q: rawMetadata? A: integral + normalizado.
- Q: novos? A: por source+sourceId (sem dedup aqui).
- Q: ordenação? A: fonte + ordem da fonte, cursor estável.

### 4. Partial + health + idempotência + cortesia → D-37, D-38, D-39
- Q: partial vs failed? A: 1 falha = partial, 2 = failed.
- Q: retry + health? A: 1 retry/fonte; ok/degraded/offline com counts sem segredos.
- Q: Idempotency-Key + rate-limit? A: janela 24h; 10 runs/h por usuário.
