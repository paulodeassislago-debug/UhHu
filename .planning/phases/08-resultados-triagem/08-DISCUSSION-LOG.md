# Phase 8: Resultados e triagem - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-12
**Phase:** 8-Resultados e triagem
**Areas discussed:** H-01 isNew (obrigatória), Paginar resultados, Ficha on-demand, Gestão de tags

---

## H-01: isNew com 3+ runs (decisão Paulo, obrigatória pré-fase 8)

| Option | Description | Selected |
|--------|-------------|----------|
| Só anteriores | isNew = ausente nos runs ANTERIORES (texto D-35); histórico estável, newCount consistente. Fix pequeno no CORE. | ✓ |
| Todos + vivo | isNew considera todos os runs e contadores recalculados ao vivo; histórico muda com o tempo. | |

**User's choice:** Só anteriores (Recommended)
**Notes:** Contexto dado: on-read atual olha todos os outros runs — run posterior apaga NOVO de itens antigos enquanto newCount congelado os conta. Vira fix CORE D-15 na fase 8 + teste 3 runs.

---

## Como carregar 200+ resultados

| Option | Description | Selected |
|--------|-------------|----------|
| Scroll infinito | Rolou até o fim, busca mais (cursor) automaticamente. | ✓ |
| Botão carregar mais | Botão 'Carregar mais' ao fim; usuário controla. | |

**User's choice:** Scroll infinito (Recommended)
**Notes:** Client já tem cursor limit+nextCursor; FlatList virtualiza.

## Filtros na tela de resultados

| Option | Description | Selected |
|--------|-------------|----------|
| Filtros completos | Estado + tag + fonte + ano, combináveis. | ✓ |
| Só por estado | Só estado de decisão; resto no Corpus (fase 9). | |

**User's choice:** Filtros completos (Recommended)
**Notes:** Client-side quando o CORE não filtrar (padrão pós-filtro); sem nova rota.

---

## Onde abre a ficha completa

| Option | Description | Selected |
|--------|-------------|----------|
| Tela dedicada | Tela cheia com ficha + decisão também ali. | ✓ |
| Modal | Modal por cima; fecha e volta à posição. | |

**User's choice:** Tela dedicada (Recommended)
**Notes:** Nenhuma.

## Carregamento da ficha

| Option | Description | Selected |
|--------|-------------|----------|
| Skeleton + retry | Enrich ao abrir com skeleton; falha com erro + repetir (§11). | ✓ |
| Preenche quieto | Abre vazia e preenche; sem erro explícito. | |

**User's choice:** Skeleton + retry (Recommended)
**Notes:** Nunca pré-carrega a lista (contrato §6).

---

## Associar tag no card

| Option | Description | Selected |
|--------|-------------|----------|
| Autocomplete + criar | Filtra existentes; inexistente cria na hora; defaults sugeridos. | ✓ |
| Só existentes | Só escolhe entre tags existentes. | |

**User's choice:** Autocomplete + criar (Recommended)
**Notes:** Nenhuma.

## Onde gerenciar as tags

| Option | Description | Selected |
|--------|-------------|----------|
| Modal | Modal simples sem sair da triagem. | ✓ |
| Seção na tela | Seção fixa na tela de resultados. | |

**User's choice:** Modal (Recommended)
**Notes:** Molde: ProjectModal da fase 7.

---

## OpenCode's Discretion

Threshold do infinito, layout do card/grupo, debounce autocomplete, mensagens, divisão dos planos.

## Deferred Ideas

None.
