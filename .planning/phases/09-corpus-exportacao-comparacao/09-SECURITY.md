---
phase: 09-corpus-exportacao-comparacao
slug: 09-corpus-exportacao-comparacao
status: verified
threats_open: 0
asvs_level: 1
created: 2026-09-13
---

# Phase 09 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| export serializer -> HTTP attachment | strings formatadas viram arquivo baixado | BibTeX/CSV/JSON (dados do próprio usuário) |
| client -> GET corpus/export/compare | projectId da rota, selection UUIDs, base+with UUIDs | IDs + DTOs agregados (auth via getToken/cookie) |
| client -> PATCH projects | referenceSearchId UUID | UUID + ProjectDTO (owner derivado no servidor) |
| beta -> API | origem aprovada via CORS exato | cookie/PAT (inalterados) |
| tabela compare | agregados numéricos + termos do próprio usuário | CompareDTO (4 blocos) |
| filtro local | nunca decide elegibilidade, só oculta | CorpusEntryDTO[] client-side |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-09-01-01 | I (Tampering) | toBibTeX `type=` | mitigate | valor literal fixo `Mestrado profissional` via `escapeBibtex`, só quando `docType === 'professionalMaster'` — `apps/core-api/src/lib/exports.ts:129`, 3 its em `dedup-exports.test.ts` (28/28) | closed |
| T-09-01-02 | I (Injection) | BibTeX/CSV | accept | guards existentes intocados (`csvCell` anti `=+@`, `escapeBibtex`, brace-protection); nenhum campo novo com input livre | closed |
| T-09-02-01 | I (IDOR) | corpus.tsx projectId | mitigate | projectId só da rota, auth via getToken/cookie; 401 → expired+next; 404 alheio genérico; owner no servidor; IDOR 4x4 no 09-06 (200/404/404/401) | closed |
| T-09-02-02 | X (XSS) | titulo/tags/instituicao | mitigate | só `Text` (escapa por padrão); sem WebView/`dangerouslySetInnerHTML`/`eval` | closed |
| T-09-02-03 | S (Spoofing filtro) | filterCorpus | accept | filtro é UX puro sobre elegíveis do servidor; D-25: referência nunca filtra (`grep filter+reference` = 0) | closed |
| T-09-03-01 | I (IDOR) | exportProject selection | mitigate | selection só de groupIds visíveis do próprio corpus; owner no servidor; 401 expired+next; IDOR 16/16 no 09-06 | closed |
| T-09-03-02 | I (Injection) | filename/mime | mitigate | slug ASCII próprio `[a-z0-9-]` + ext allowlist `csv\|bib\|json` + mime mapa fixo; anchor `download` sem HTML | closed |
| T-09-03-03 | D (DoS) | export gigante | accept | UI limita 100 + servidor 1000 IDs; sem retry auto; `busy` trava duplo-toque | closed |
| T-09-04-01 | I (IDOR/enumeração) | compareSearches with | mitigate | with só de IDs listados do próprio projeto + guard UUID client-side; servidor 404/401; IDOR 4x4 no 09-06 | closed |
| T-09-04-02 | X (XSS) | term/header | mitigate | `Text` escapa; sem WebView/innerHTML/links externos | closed |
| T-09-04-03 | I (Fabrico de métrica) | vencedora | accept | `mostInclusive` pura (max de totals, empate = primeiro); zero `menos ruído` (grep = 0); manual final no 09-05 | closed |
| T-09-05-01 | I (IDOR) | referenceSearchId cross-projeto | mitigate | servidor 404 quando `search.projectId != projectId` ou owner difere; UI só oferece IDs da lista; 401 expired+next; IDOR 4x4 no 09-06 | closed |
| T-09-05-02 | T (Tampering memória) | troca sem confirmação | accept | decisão D-24 explícita (mutável, 1 toque); re-PATCH reverte; sem efeito em corpus/filtros (D-25 grep = 0) | closed |
| T-09-06-01 | S/E (AuthZ) | corpus/export/compare/reference | mitigate | matriz IDOR 4x4 na beta 16/16 (dono 200 / estranho 404 / adulterado 404 / sem-auth 401); owner do ator; RLS só defesa em profundidade | closed |
| T-09-06-02 | I (Secrets/logs) | beta + SUMMARY | mitigate | Gitleaks via CI, bundle 1.8MB grep segredos = 0, logs sem cookie/Authorization/signed-URL; `pnpm audit` só toolchain Expo dev-only pré-existente (aceite desde 06-02) | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| R-09-01-02 | T-09-01-02 | Guards BibTeX/CSV existentes suficientes; nenhum campo novo com input livre — aceitar | executor 09-01 + auditoria 09-06 (0 crit/0 high) | 2026-09-13 |
| R-09-02-03 | T-09-02-03 | Filtro client-side é só UX; corpus real vem do servidor; D-25 provado por grep — aceitar | executor 09-02 + 09-05 gate | 2026-09-13 |
| R-09-03-03 | T-09-03-03 | Limites 100 (UI) + 1000 IDs (servidor) + busy-guard suficientes para v1.1 beta — aceitar | executor 09-03 + auditoria 09-06 | 2026-09-13 |
| R-09-04-03 | T-09-04-03 | Vencedora é max determinístico do DTO; sem heurística de ruído por desenho (D-14-1); manual no 09-05 — aceitar | executor 09-04 + gate 09-06 | 2026-09-13 |
| R-09-05-02 | T-09-05-02 | Troca 1-toque sem confirmação é decisão D-24 explícita do usuário; reversível em 1 toque — aceitar | Paulo (D-24) via 09-CONTEXT + executor 09-05 | 2026-09-13 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-09-13 | 15 | 15 | 0 | secure-phase (state B, from PLAN threat models + SUMMARY Self-Check PASSED + 09-06 beta IDOR 16/16 + UAT 7/7) |

### Evidence (09-06 gate, revalidated 2026-09-13)

- `typecheck` exit 0 (lab + core-api) · `lint` 0 errors · lab vitest 121/121 · `src/corpus+export+compare` 21/21 · smoke 28/28 · integração `lab-corpus` 20/20 PG real
- 3 greps = 0 (`as any|: any|@ts-ignore` em corpus/export/compare/project · `expo-sharing|expo-file-system` em apps/lab · `menos.*ru` em compare)
- 3 attachments `corpus-projeto-corpus-90-2026-09-13.{csv,bib,json}` com `Content-Disposition: attachment` + BibTeX MP `@mastersthesis` + `type={Mestrado profissional}` (`/tmp/opencode/09-06-evidence/`)
- Compare 4 blocos (`searches,totals,yearHistogram,bySource,pairwiseOverlap`) · PATCH reference 200 + selo
- IDOR 16/16 · CORS exato · `pnpm audit` só toolchain Expo dev-only · bundle sem segredos · auditoria adversarial 0 crit/0 high · UAT 7/7 (`09-UAT.md` complete)

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-09-13
