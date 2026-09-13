# Phase 9: Corpus, exportação e comparação - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-13
**Phase:** 9-Corpus, exportação e comparação
**Areas discussed:** Entregar arquivo, Referência visível, BibTeX do MP

---

## Como o usuário recebe o arquivo em cada plataforma

| Option | Description | Selected |
|--------|-------------|----------|
| Download + Share | Web: download via blob+anchor. Nativo: Share nativo built-in. Zero dependência nova. | ✓ |
| Libs Expo | expo-sharing/expo-file-system para salvar/abrir no device. Mais deps e permissões. | |

**User's choice:** Download + Share (Recommended)
**Notes:** exportProject já retorna attachment verbatim (raw).

## Formatos sempre visíveis ou contextuais

| Option | Description | Selected |
|--------|-------------|----------|
| Três sempre | CSV/BibTeX/JSON sempre oferecidos; BibTeX vazio avisa. | ✓ |
| Contextual | Só formatos válidos para a seleção atual. | |

**User's choice:** Três sempre (Recommended)
**Notes:** Nenhuma.

---

## Após marcar a base, o que o usuário vê

| Option | Description | Selected |
|--------|-------------|----------|
| Selo + destaque | Selo 'Referência' no card + coluna destacada no compare; trocar num toque. | ✓ |
| Silenciosa | Só persiste; nada muda visualmente. | |

**User's choice:** Selo + destaque (Recommended)
**Notes:** Nenhuma.

## A referência tem efeito funcional

| Option | Description | Selected |
|--------|-------------|----------|
| Só memória | Nenhum efeito em corpus/filtros/resultados. | ✓ |
| Com efeito funcional | Referência filtra ou ordena algo. | |

**User's choice:** Só memória (Recommended)
**Notes:** Nenhuma.

---

## Como o MP sai no BibTeX

| Option | Description | Selected |
|--------|-------------|----------|
| Master + nota | @mastersthesis com note/type profissional. Mudança mínima + teste. | ✓ |
| Puro (zero mudança) | @mastersthesis indistinguível. | |

**User's choice:** Master + nota (Recommended)
**Notes:** exports.ts:117 hoje manda todo não-doutorado para @mastersthesis silenciosamente.

---

## OpenCode's Discretion

Layout do compare, posição do exportar/seleção, textos, divisão dos planos.

## Deferred Ideas

None.
