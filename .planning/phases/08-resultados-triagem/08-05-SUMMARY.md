# 08-05 SUMMARY — Gap typecheck raiz (TS2345 closures isNew)

**Plan:** 08-05 (gap_closure, wave 5) · **Status:** complete · **Date:** 2026-09-12
**Gap source:** Auditoria externa Hermes — `pnpm typecheck` raiz vermelho, bloqueador de CI (gates.yml:40)

## What shipped
- `tests/integration/lab-results-isnew.test.ts`: `const api = app;` após o guard do teste D-15 + `api` nas closures `fetchPage` (559) e `fetchSingle` (604). Opção A (mínima); B (`app!`) e C (guard interno) rejeitadas.
- Comportamento do teste idêntico — mudança só de narrowing, zero runtime.

## Proofs
- `pnpm exec tsc --noEmit -p tsconfig.json` → exit 0, output vazio (RAIZ VERDE)
- `pnpm test` → 19 arquivos, 200/200
- vitest `@uhhu/lab` → 11 arquivos, 82/82; typecheck + lint lab exit 0
- 12/12 must-haves revalidados (mudança test-only; teste D-15/H-01 inalterado em comportamento)

## Deviations
None — plano executado como escrito.

## Auditoria rápida do diff
Arquivo-por-arquivo: 3 linhas adicionadas/trocadas em 1 arquivo de teste; nenhuma rota, auth, query ou DTO tocados; nenhum segredo/log/token; `any`/`Math.random` ausentes. Sem autoaprovação pendente — auditoria externa valida no fechamento.

## Residual
- UAT humano de tablet (3 itens) segue pendente — status `human_needed` mantido.
- Lição de processo (3ª ocorrência do padrão): vitest transpila sem checar tipos e typecheck por --filter não cobre `tests/` — considerar job/gate que rode o tsc raiz também em pre-push local, não só no CI.
