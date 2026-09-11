# Phase 6: Fundação do app + auth + suporte CORE - Context

**Gathered:** 2026-09-11
**Status:** Ready for planning

## Phase Boundary

Fase 6 tira o app do zero e prepara o CORE para a UI: scaffold Expo em `apps/lab` (web + nativo), autenticação nos dois canais (web cookie / nativo PAT), e as 3 entregas CORE de suporte (§14 + CORS). Ao final, o pesquisador abre o app, autentica e vê dados reais do CORE — sem telas de domínio ainda (projetos/buscas/resultados são fases 7–9).

## Implementation Decisions

### Provisionamento do PAT nativo
- **D-01:** Primeiro PAT via login com e-mail+senha dentro do app → `POST /api/v1/auth/token` → guarda em secure storage (ex.: expo-secure-store). Sem fluxo via web, sem QR.
- **D-02:** `deviceName` automático (modelo do device + data); reinstalação gera novo PAT. Revogação de PATs antigos pela web fica para fase futura (não é fase 6).

### Acesso beta + CORS
- **D-03:** Web beta roda na VPS dev com acesso via tailnet/local (sem exposição pública). Tablet acessa pela rede tailnet.
- **D-04:** CORS em allowlist exata da(s) origem(ns) do beta; demais origens bloqueadas. Provar com `curl` de Origin válido e Origin adulterado. Sem modo permissivo/espelhado nem em dev.

### Escopo nativo na fase 6
- **D-05:** Nativo validado via Expo Go (+ web) na fase 6; build EAS só quando houver target/testador real. Nada de conta EAS, assinatura ou store na fase 6.
- **D-06:** Android primeiro (tablet do Paulo); iOS entra quando houver device/testador.

### OpenCode's Discretion
- Versão do SDK Expo, template inicial, ajustes metro/bundler para pnpm workspace (node-linker), estrutura de pastas do app, client HTTP (fetch wrapper), gerenciamento de estado/data-fetching, e ordem interna dos planos (CORE-first vs app-first) — pesquisador e planejador decidem com base no ecossistema atual, respeitando TS strict, contratos em definição única e `any` proibido.

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Esqueleto e spec do Lab
- `dev-docs/10-lab-esqueleto-telas.md` §2 (Login/Convite), §11 (estados transversais), §14 (5 decisões validadas) — telas e regras que a fase 6 prepara
- `dev-docs/03-lab-spec-v1.md` §5 (API/auth) e §9 (frontend Expo) — endpoints e stack decidida

### Contrato e segurança
- `dev-docs/07-core-contract.md` §8 (identidade/PAT Bearer), §11.1 (rotas auth) — sessão cookie + PAT 30d sliding
- `dev-docs/08-security-baseline.md` — IDOR/404, segredos nunca no bundle, Zod na fronteira, auditoria antes de patch

### Código existente (integração)
- `apps/core-api/src/routes/auth.ts` (`POST /api/v1/auth/token`, D-60/D-63: e-mail+senha+deviceName, lockout compartilhado, raw uma única vez) — endpoint que o login nativo consome
- `apps/core-api/src/auth/pat.ts` (sliding 30d, revogação) e `apps/core-api/src/auth/requireAuth.ts` (Bearer-first) — comportamento do PAT
- `apps/core-api/src/index.ts` (sem plugin CORS hoje — UI-32 cria) — ponto de integração do CORS
- `packages/contracts/src/` (`auth.ts`, `projects.ts`, `lab.ts`, `errors.ts`) — definição única dos tipos que o client do app deriva
- `apps/lab/README.md` — fronteira reservada (substituir pelo scaffold)

## Existing Code Insights

### Reusable Assets
- `POST /api/v1/auth/token` (login por senha → PAT com deviceName): consumido direto pelo app nativo, sem mudança de contrato
- Sessão cookie httpOnly (`setSessionCookie` em routes/auth.ts): consumida direto pela web, sem mudança
- Schemas Zod em `packages/contracts`: base do client tipado do app (derivação, sem cópia local)
- Envelope de erro PT-BR + `x-request-id`: padrão de tratamento de erro da UI

### Established Patterns
- `execute()` + capabilities fail-closed: novas rotas/mudanças CORE seguem o mesmo padrão (nenhuma regra duplicada por superfície)
- Migration versionada via Drizzle (`packages/db`): `referenceSearchId` entra como migration nova, mesmo ritual das 0001–0004
- `any` proibido, `import type` para tipos, view models só com mapeamento explícito

### Integration Points
- CORS: registrar plugin/allowlist em `apps/core-api/src/index.ts` a partir de env (origem(ns) do beta tailnet)
- `referenceSearchId`: coluna nullable em projects + GET expõe + PATCH persiste (isolado por owner)
- `isNew`: campo derivado on-read no GET results (regra D-35), sem coluna, sem mudar shape persistido

## Specific Ideas

No specific requirements — open to standard approaches (Expo + expo-secure-store são as referências citadas na instrução; confirmar versão vigente na pesquisa).

## Deferred Ideas

None — discussion stayed within phase scope (EAS build, iOS, revogação de PATs pela web e link público beta ficam para fases futuras por decisão acima, não como ideias soltas).

---

*Phase: 6-Fundação do app + auth + suporte CORE*
*Context gathered: 2026-09-11*
