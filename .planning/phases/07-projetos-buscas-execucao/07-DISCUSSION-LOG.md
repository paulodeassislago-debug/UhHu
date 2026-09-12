# Phase 7: Projetos, buscas e execução - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-11
**Phase:** 7-Projetos, buscas e execução
**Areas discussed:** Acompanhar execução, Form de busca, Histórico de runs, Criar projeto

---

## Acompanhar execução

| Option | Description | Selected |
|--------|-------------|----------|
| Polling automático | Tela de execução com progresso por fonte, atualizando sozinha; botão Cancelar visível. | ✓ |
| Atualizar manual | Mostra 'em execução', usuário toca Atualizar para ver o progresso. | |

**User's choice:** Polling automático (Recommended)
**Notes:** CORE responde 201 (25s) ou 202 + polling job; buscas reais levam dezenas de segundos.

## Se sair da tela com run rodando

| Option | Description | Selected |
|--------|-------------|----------|
| Retoma de onde parou | Run vive no servidor; voltar à tela mostra o estado atual (concluído mostra resultados). | ✓ |
| Sair abandona a tela | Sair cancela o acompanhamento; histórico mostra o run depois. | |

**User's choice:** Retoma de onde parou (Recommended)
**Notes:** Resultados desembocam em placeholder (fase 8 constrói a triagem).

---

## Como montar os termos booleanos

| Option | Description | Selected |
|--------|-------------|----------|
| Linhas booleanas | Linhas adicionáveis de termo + seletor AND/OR/NOT entre elas, fiel ao esqueleto §6. | ✓ |
| Expressão livre | Um campo só onde o usuário digita a expressão. Menos toques, mais erro. | |

**User's choice:** Linhas booleanas (Recommended)
**Notes:** Nenhuma.

## Quais filtros no formulário

| Option | Description | Selected |
|--------|-------------|----------|
| Completos §6 | Ano + tipo + fontes + área/instituição/programa, com selo pós-filtro e status das fontes. | ✓ |
| Mínimos primeiro | Só ano + tipo + fontes no v1.1; resto entra se o uso pedir. | |

**User's choice:** Completos §6 (Recommended)
**Notes:** Salvar ≠ Executar mantido (dois CTAs).

---

## Onde mora o histórico de runs

| Option | Description | Selected |
|--------|-------------|----------|
| Expand no card | Cada card de estratégia expande o histórico. Sem aba extra. | ✓ |
| Quarta aba | Quarta aba 'Histórico' listando todos os runs do projeto. | |

**User's choice:** Expand no card (Recommended)
**Notes:** Resolve ambiguidade esqueleto §1 (mapa cita aba Histórico) vs §4 (3 abas): 3 abas mantidas.

## O que cada entrada mostra

| Option | Description | Selected |
|--------|-------------|----------|
| Resumo + parcial | Data/hora, status, total, novos desde o anterior, duração; parcial mostra o que faltou. | ✓ |
| Só essencial | Só data + status + total; detalhe abre a tela de resultados do run. | |

**User's choice:** Resumo + parcial (Recommended)
**Notes:** Entrada toca para abrir resultados (placeholder fase 8).

---

## Como criar projeto

| Option | Description | Selected |
|--------|-------------|----------|
| Modal | Modal com título + pergunta, valida e cria; volta à lista atualizada. | ✓ |
| Tela dedicada | Tela cheia dedicada com o formulário de criação. | |

**User's choice:** Modal (Recommended)
**Notes:** Habilita o CTA hoje desabilitado na lista.

## Editar pergunta e arquivar onde

| Option | Description | Selected |
|--------|-------------|----------|
| Inline + menu | Editar no próprio cabeçalho (toque edita, salva); arquivar em menu do cabeçalho/lista. | ✓ |
| Tela de configs | Tela de configurações do projeto com tudo. | |

**User's choice:** Inline + menu (Recommended)
**Notes:** Nenhuma.

---

## OpenCode's Discretion

Intervalo de polling/backoff, paginação, layout do modal/expansível, mensagens de validação, divisão dos planos.

## Deferred Ideas

None.
