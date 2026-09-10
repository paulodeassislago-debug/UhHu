# Phase 2: Plataforma e isolamento - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-10
**Phase:** 2-Plataforma e isolamento
**Areas discussed:** Convites e registro, Sessão e dispositivos, Projetos e isolamento, Erros e limites

---

## Convites e registro

| Option | Description | Selected |
|--------|-------------|----------|
| Só admin emite | Beta fechado: só admin gera convites, sem auto-registro público | ✓ |
| Usuários convidam | Cada usuário pode gerar N convites | |

**User's choice:** Só admin emite
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| Uso único, 7 dias | Seguro por padrão | |
| Uso único, 30 dias | Mais folga para convidados que demoram a entrar | ✓ |
| Sem expiração | Vale até ser usado ou revogado | |

**User's choice:** Uso único, 30 dias
**Notes:** Usuário preferiu folga maior que os 7 dias recomendados.

| Option | Description | Selected |
|--------|-------------|----------|
| Nome + e-mail + senha | Mínimo para identificar o pesquisador | ✓ (ajustado) |
| Só e-mail + senha | Cadastro o mais curto possível | |

**User's choice (freeform):** "Nome + email + senha OU google oauth"
**Notes:** OAuth conflita com escopo travado (PROJECT.md Out of Scope + FUT-04: SSO/OAuth fora do v1). Follow-up em texto livre: usuário escolheu **opção A** — manter v1 só e-mail+senha; Google OAuth virou ideia diferida pós-v1. Sem mudança silenciosa de escopo.

| Option | Description | Selected |
|--------|-------------|----------|
| Reset por e-mail | Link com token de uso único e expiração curta | ✓ |
| Só via admin | Sem infra de e-mail no v1 | |
| Sem reset no v1 | Conta perdida = conta nova | |

**User's choice:** Reset por e-mail
**Notes:** —

---

## Sessão e dispositivos

| Option | Description | Selected |
|--------|-------------|----------|
| 30 dias deslizante | Equilíbrio conveniência/segurança | ✓ |
| 7 dias | Reloga toda semana | |
| 12 horas | Máximo rigor | |

**User's choice:** 30 dias deslizante

| Option | Description | Selected |
|--------|-------------|----------|
| Checkbox no login | Marcado = 30 dias; desmarcado = 24h | ✓ |
| Sem checkbox | Duração única | |

**User's choice:** Checkbox no login

| Option | Description | Selected |
|--------|-------------|----------|
| Vários + gerenciar | Ver aparelhos ativos e encerrar qualquer um | ✓ |
| Um por vez | Login novo invalida o antigo | |

**User's choice:** Vários + gerenciar

| Option | Description | Selected |
|--------|-------------|----------|
| Só este aparelho | Padrão esperado; limpeza geral só quando pedir | ✓ |
| Todas sempre | Qualquer logout limpa tudo | |

**User's choice:** Só este aparelho

---

## Projetos e isolamento

| Option | Description | Selected |
|--------|-------------|----------|
| Título+pergunta+descr | Título + pergunta obrigatórios; descrição opcional | ✓ (ajustado) |
| Só título + pergunta | Estrutura mínima | |
| Com área e instituição | Classifica desde o v1 | |

**User's choice (freeform):** "Titulo obrigatorio, pergunta opcional, descricao opcional. Todos facilmente EDITAVEIS pelo usuario"
**Notes:** Pergunta virou opcional (contra o default título+pergunta obrigatórios); fluxo de edição importa.

| Option | Description | Selected |
|--------|-------------|----------|
| Só ownerId no v1 | Cada usuário vê só o seu; workspace futuro | ✓ |
| workspaceId já agora | Prepara multiusuário por projeto | |

**User's choice:** Só ownerId no v1

| Option | Description | Selected |
|--------|-------------|----------|
| Apaga tudo | Confirmação explícita e apaga tudo do projeto | ✓ |
| Lixeira 30 dias | Restaura em até 30 dias | |

**User's choice:** Apaga tudo

| Option | Description | Selected |
|--------|-------------|----------|
| Sim, arquivar | Some da lista sem apagar; reativa quando quiser | ✓ |
| Não, só excluir | Lista única | |

**User's choice:** Sim, arquivar

---

## Erros e limites

| Option | Description | Selected |
|--------|-------------|----------|
| PT-BR + code | Pesquisador lê PT-BR; code estável para cliente | ✓ (ajustado) |
| Inglês | Tudo em inglês técnico | |

**User's choice (freeform):** "PTbr por enquanto. deixar possibilidade de outros idiomas no futuro"
**Notes:** Virou D-25 i18n-ready (codes estáveis, mensagens catalogadas).

| Option | Description | Selected |
|--------|-------------|----------|
| Bloqueio 15min | 5 falhas → 15min; sem captcha no v1 | ✓ (ajustado) |
| Só rate limit | Desacelera sem bloquear | |
| Bloqueio total | Conta trava até reset | |

**User's choice (freeform):** "Bloqueio de 15 min, com a opcao de reset por email para o usuario nao ter que esperar"
**Notes:** Combo: bloqueio + reset como saída imediata para o usuário legítimo.

| Option | Description | Selected |
|--------|-------------|----------|
| 20, máx 100 | Padrão enxuto | ✓ |
| 50, máx 200 | Páginas maiores | |

**User's choice:** 20, máx 100

| Option | Description | Selected |
|--------|-------------|----------|
| Genérico | Não revela se o e-mail está cadastrado | ✓ (após alerta) |
| Específico | Diz exatamente o que está errado | |

**User's choice (freeform):** Inicialmente "Específico" → após alerta de enumeração (user enumeration via login + reset, baseline proíbe), usuário escolheu **opção A**: genérico no login e no reset. Alternativa B (aceite formal em `aceites-seguranca.md`) foi oferecida e recusada.

---

## OpenCode's Discretion

Nenhuma — usuário decidiu todas as áreas; apenas parâmetros técnicos delegados (argon2id, formato de tokens, storage de sessão, nomes de cookies/rotas) registrados em CONTEXT.md.

## Deferred Ideas

- Login com Google (OAuth) — pós-v1
- `workspaceId` / colaboração no mesmo projeto — pós-v1
