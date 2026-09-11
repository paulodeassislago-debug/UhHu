# Phase 4: Corpus e exportação - Research

**Researched:** 2026-09-11
**Domain:** Dedup bibliográfico (canonical key + fuzzy), decisões/tags por grupo, corpus derivado, comparação de buscas, exportação CSV/BibTeX/JSON no CORE headless
**Confidence:** HIGH (stack verificada no npm registry) / MEDIUM (arquitetura — síntese de decisões locked + código existente)

## Summary

A Phase 4 constrói a camada de revisão sobre os resultados da Phase 3: agrupar a mesma obra entre BDTD/CAPES, decidir elegibilidade por grupo, derivar o corpus e exportar. Todo o alicerce já existe — `*ForActor` owner-first, cursor `source|rank|id`, envelope PT-BR, `sha256hex` com `node:crypto`, migration mold (0000–0002 aplicadas no PG DEV), harness de integração com 2 usuários + fixtures.

A descoberta arquitetural central: **identidade por chave de conteúdo, não por row ID**. Re-runs criam novos `lab_results` com novos UUIDs (snapshot congelado D-33), então grupos, decisões, pins, divergências e pareamentos rejeitados devem ser endereçados pela `canonicalKey` (SHA-256) escopada por `projectId`. Sem isso, D-42 (rejeição lembrada cruza runs), D-43 (auto-attach) e D-45 (pin sobrevive a re-runs) são impossíveis de implementar corretamente.

Para similaridade fuzzy, `fastest-levenshtein@1.0.16` (MIT, API `distance(a,b)` verificada no readme do registry [VERIFIED: npm registry]) é a escolha: `string-similarity` está oficialmente descontinuado no npm ("Package no longer supported" [VERIFIED: npm registry]) e `jaro-winkler@0.2.8` está parado desde 2022 sem tipos. CSV e BibTeX são geradores pequenos e determinísticos — hand-roll justificado e delimitado (quoter RFC 4180 + mapa de escapes BibTeX verificado em múltiplas fontes); a regra "Don't Hand-Roll" aplica-se ao algoritmo de distância, não ao escaping.

**Primary recommendation:** Implementar grupos de dedup escopados por projeto e endereçados por `canonicalKey` SHA-256 (normalização NFKD + `node:crypto`), fuzzy via `fastest-levenshtein` (similaridade normalizada ≥ 0.9 sobre títulos normalizados, mesma trava de ano), decisão única por grupo + divergência como anotação, corpus como view resolvida server-side sobre o último run concluído de cada busca, e exportadores CSV/BibTeX/JSON com guards contra CSV-injection e sanitização de filename.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-40:** Grupos fuzzy (similaridade ≥0.9) não confirmados vivem em fila pending, fora do corpus, até aceite/rejeição explícita por grupo.
- **D-41:** Confirmação é do dono do projeto, por grupo de duplicatas, persistente por projeto.
- **D-42:** Rejeitar um grupo fuzzy o divide em candidatos singles independentes, cada um com decisão própria; o pareamento rejeitado é lembrado para que re-runs não reagrupem.
- **D-43:** Novos runs anexam automaticamente: resultados com chave exata entram em grupos existentes (confirmados ou pending); novos matches fuzzy vão para a fila pending — sem reconfirmar o já decidido.
- **D-44:** Registro canônico do grupo = origem com metadados mais completos (score por campos preenchidos: abstract, autores, ano, URLs); desempate determinístico por source+sourceId.
- **D-45:** Dono pode fixar (pin) qualquer origem como canônica por grupo; override persiste por projeto e sobrevive a re-runs e auto-attach.
- **D-46:** Decisão de elegibilidade é UMA por grupo e dirige o corpus; qualquer origem pode carregar nota de divergência (ex. metadados da CAPES diferem) sem alterar a decisão do grupo — divergência é anotação, não segunda decisão.
- **D-47:** Overlap entre buscas = chaves canônicas de dedup compartilhadas (dedup-aware, cross-fonte, reusa a chave LAB-07).
- **D-48:** Cada busca contribui com seu último run concluído (fixo); comparação é estratégia-atual vs estratégia-atual.
- **D-49:** Saída contém exatamente os quatro locked (totais, histograma de anos, counts por fonte, overlaps par-a-par) — sem listas de itens.
- **D-50:** Seleção = lista explícita de IDs de resultados/grupos; escopo corpus = todos os eligible resolvido server-side.
- **D-51:** Colisão de chave BibTeX resolve com sufixos -a, -b deterministicamente por ordem de grupo; primeira chave fica com o slug base.
- **D-52:** Exportação entrega arquivo direto (Content-Disposition attachment, filename `corpus-<projeto>-<data>.csv|bib|json`).
- **D-53:** CSV tem uma linha por grupo (registro canônico) com decisão do grupo, tags, contagem de origens e lista de origens — sem duplicar decisões por linha.

### OpenCode's Discretion
Nenhuma — usuário escolheu todas as opções recomendadas explicitamente; sem itens "you decide".

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| LAB-06 | Lista resultados por run com paginação/ordenação estável + ficha individual | Já existe (`listResultsForActor`, cursor `source\|rank\|id`, `getResultForActor`) [VERIFIED: codebase `apps/core-api/src/lib/searches.ts`]; corpus/comparação reutilizam o molde de cursor |
| LAB-07 | Dedup automático (chave canônica título+ano+autores SHA-256; `exact\|fuzzy`, fuzzy ≥0.9 com confirmação); card com N origens sem apagar proveniência | `## Standard Stack` (normalização + `node:crypto` + `fastest-levenshtein`), `Pattern 1–2` (content-key identity, lifecycle pending→confirmed) |
| LAB-08 | Decisão de elegibilidade (`eligible\|ineligible\|undecided` + motivo/tag); corpus = view derivada dos `eligible`, reflete na hora | `Pattern 3` (corpus-as-view, sem tabela de cópia); decisão endereçada por group key para sobreviver a re-runs |
| LAB-09 | Tags do projeto (defaults: incluir, excluir, duplicado, indisponível, revisar); decisão no grupo com `duplicate-divergence` por fonte | Seed preguiçoso de tags (sem data migration); divergência como anotação `UNIQUE(group, source)` |
| LAB-10 | Comparação 2+ buscas (totais, anos, fontes, sobreposição) | `Pattern 4` (agregados sobre último run concluído + overlap por chaves exatas); exatamente 4 outputs (D-49) |
| LAB-11 | Exportação seleção/corpus em CSV, BibTeX (`@phdthesis`/`@mastersthesis`, `school`=instituição, key slug autor+ano+fonte), JSON (bruto+proveniência+grupos) | `Pattern 5` + `Code Examples` (quoter CSV com guard de injection, escaper BibTeX verificado, slug de filename ASCII) |
</phase_requirements>

## Project Constraints (from AGENTS.md)

Diretivas com autoridade de decisão locked — o plano não pode violá-las:

- **CORE compartilhado headless:** sem backend independente para o Lab; REST/CLI/MCP chamam os mesmos casos de uso (Phase 5 consome; Phase 4 expõe libs reutilizáveis, não rotas paralelas).
- **PostgreSQL canônico;** SQLite só cache/local — novas tabelas via migration Drizzle versionada (0003), testadas contra PG real.
- **Nenhuma UI acessa PG/storage/serviço externo** — corpus/compare/export resolvidos server-side.
- **TS `strict`; tipos de domínio/DTOs com definição única em `packages/contracts`;** `import type` quando aplicável; sem view-model duplicando contrato.
- **`any` proibido sem exceção** (produção, testes, mocks, utils) — usar `unknown` + narrowing; nunca enfraquecer `tsconfig`.
- **Autorização no backend:** `ownerId` sempre da sessão; toda rota com ID verifica escopo no servidor → fora do escopo = 404 idêntico; testes dono/estranho/ID-adulterado via `curl`.
- **Input hostil:** Zod na fronteira, limites, queries parametrizadas, sem `eval`/`new Function`, sem `Math.random` para tokens/IDs (UUID vem do PG `defaultRandom()`).
- **Segredos:** nunca em código/bundle/Git/logs/respostas; Gitleaks tree+histórico.
- **Auditoria adversarial** arquivo-por-arquivo antes de auto-correção + gates (typecheck, lint, testes, IDOR, SAST, `pnpm audit`, integração PG).
- **Escopo:** não modificar decisões do CORE silenciosamente; antes de "concluído", executar testes reais e reportar.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Dedup (chave canônica, fuzzy, grupos) | API / Backend | — | Regra de negócio + acesso PG; deve ser reutilizável por CLI/MCP na Phase 5 sem duplicação |
| Decisões/tags/divergências/pins | API / Backend | — | Estado mutável com autorização owner-first; frontend só UX |
| Corpus (view de elegíveis) | API / Backend | — | Derivação server-side "na hora" (D-50 exige resolução server-side); nunca montado no cliente |
| Comparação de buscas | API / Backend | — | Agregação sobre runs com escopo do ator; saída fixa de 4 blocos |
| Exportação (CSV/BibTeX/JSON) | API / Backend | — | Geração de arquivo + `Content-Disposition`; download direto |
| Renderização (grupo expansível, cards, telas) | Browser / Client (futuro) | — | Fora desta fase — Phase 4 entrega comportamento observável via REST + `curl`, sem UI |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `fastest-levenshtein` | 1.0.16 [VERIFIED: npm registry] | Distância de Levenshtein (`distance(a,b)`) para similaridade fuzzy de títulos | MIT, zero-dep (~21KB), API verificada no readme do registry; `string-similarity` está deprecated no npm ("Package no longer supported" [VERIFIED: npm registry]); `jaro-winkler` parado desde 2022 sem tipos |
| `node:crypto` (built-in) | Node 22.17.0 [VERIFIED: `node --version`] | SHA-256 da chave canônica (`createHash('sha256')`) | Já usado no repo (`sha256hex` em `searchRuns.ts` [VERIFIED: codebase]); sem `Math.random`, sem nova dep |
| `zod` | ^4.5.4 (já no monorepo) | Schemas de fronteira: decisão, tags, divergência, pin, compare query, export query | Padrão do repo; contratos têm definição única em `packages/contracts` |
| `drizzle-orm` | ^0.45.2 (já no monorepo) | Novas tabelas lab + queries owner-first via JOIN →Project | Padrão do repo; CHECKs no banco espelham o Zod (convenção T-02-01-03/T-03-01-01) |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| *(nenhuma nova)* | — | CSV/BibTeX/filename são geradores determinísticos pequenos | Hand-roll delimitado com especificação verificada (ver `## Don't Hand-Roll`) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `fastest-levenshtein` | `natural` (Jaro-Winkler + mais) | Pesado (dependências nativas opcionais, bundle grande) para um único uso; threshold ≥0.9 teria semântica diferente por métrica — trocar exige revalidar o threshold |
| `fastest-levenshtein` | `talisman@1.1.4` | Toolkit amplo, última publicação 2022 [VERIFIED: npm registry]; overkill para uma distância |
| `fastest-levenshtein` | pg_trgm (`similarity()` no PG) | Empurraria regra de negócio para o banco e acoplária threshold a extensão do PG DEV/prod; fuzzy em JS é testável em unit sem PG e portável |
| Hand-rolled CSV quoter | `csv-stringify@6.8.3` [VERIFIED: npm registry] | Justificável se o CSV ganhar streaming; no v1 (uma linha por grupo, volume de tese/dissertação) o quoter de ~10 linhas é mais auditável; reavaliar se export >10k grupos exigir paginação streaming |
| Hand-rolled BibTeX | `citation-js` | Pesado e voltado a parsing/conversão CSL; geração dirigida pelo contrato (2 entry types, campos fixos) é menor e determinística |

**Installation:**
```bash
pnpm --filter @uhhu/core-api add fastest-levenshtein
```

**Version verification:** `fastest-levenshtein@1.0.16`, MIT, `time.modified 2022-08-02` = biblioteca mínima estável (não abandonada — completa), `dist.unpackedSize` 21KB [VERIFIED: npm registry, 2026-09-11]. `string-similarity@4.0.4` marcada deprecated no registry [VERIFIED: npm registry, 2026-09-11]. `csv-stringify@6.8.3` apenas como alternativa documentada [VERIFIED: npm registry, 2026-09-11].

## Architecture Patterns

### System Architecture Diagram

```text
                    ┌─────────────────────────────────────────────────┐
                    │              PROJECT (owner-first)               │
                    │  todas as queries filtram projects.owner_id     │
                    │  = actor.userId via JOIN (fora → 404)           │
                    └───────────────────────┬─────────────────────────┘
                                            │
   ┌────────────────┬───────────────────────┼───────────────────┬──────────────┐
   │                │                       │                   │              │
   ▼                ▼                       ▼                   ▼              ▼
Search(es) → SearchRuns (snapshots) → lab_results ──► DEDUP ENGINE ──► DedupGroups
   │              │ (latest terminal         │         (exact key match          │  (project-scoped,
   │              │  per search)              │          + fuzzy ≥0.9            │   key-addressed)
   │              │                           │          + rejected-pair veto)   │
   │              │                           │                                 ├── canonical (score/pin)
   │              │                           │                                 ├── decision (1/group)
   │              │                           │                                 ├── tags (N/group)
   │              │                           │                                 └── divergences (1/source)
   │              │                           │
   │              └───────────┬───────────────┘
   │                          │ latest completed run per search (D-48)
   │                          ▼
   │                      COMPARE ──► { totals, yearHistogram, bySource, pairwiseOverlap }
   │                      (4 blocos exatos, sem item lists — D-49)
   │
   └──── eligible groups ──► CORPUS VIEW ──► EXPORT (selection | corpus)
        (resolvida na hora,     │               ├── CSV (1 linha/grupo, canônico)
         server-side)           │               ├── BibTeX (@phdthesis/@mastersthesis, -a/-b)
                                │               └── JSON (bruto+proveniência+grupos)
                                ▼
                        Content-Disposition: attachment
                        filename corpus-<slug>-<data>.ext (ASCII)
```

### Recommended Project Structure

```text
apps/core-api/src/lib/
├── dedup.ts          # FUNÇÕES PURAS: normalizeTitle/Key, canonicalKey, similarity, completenessScore
├── corpus.ts         # *ForActor: groups, confirm/reject, decision, tags, divergence, pin, corpus view, compare
├── exports.ts        # FUNÇÕES PURAS: toCSV, toBibTeX, toJSON, bibtexKey, slugifyFilename + guards
packages/contracts/src/
└── lab.ts            # ESTENDER: DedupGroupDTO, CorpusEntryDTO, CompareDTO, ExportQuery, decision/tag/divergence/pin schemas
packages/db/src/
└── schema.ts         # + migration 0003: groups, members, decisions, divergences, tags, group_tags, rejected_pairs, pins
apps/core-api/src/routes/
└── lab.ts            # ESTENDER no molde: Zod + requireAuth + 404 idêntico (ver Pattern 6)
tests/integration/
├── lab-corpus.test.ts       # NOVO (Wave 0): dedup/decisão/tags/corpus/compare/export contra PG real
└── fixtures/
    ├── dedup-overlap.json   # NOVO (Wave 0): BDTD+CAPES com títulos sobrepostos (exatos + fuzzy + distintos)
```

### Pattern 1: Content-Key Identity (grupos endereçados por chave, não por row ID)
**What:** Toda entidade de revisão (grupo, decisão, pin, divergência, par rejeitado) é endereçada por `(projectId, canonicalKey)`; `lab_results.id` aparece só como membro. Re-runs criam novas linhas de resultado — a chave de conteúdo é o único identificador estável entre runs [ASSUMED — síntese das decisões D-42/D-43/D-45 com o snapshot congelado D-33; verificado que runs criam novos result UUIDs em `searchRuns.ts`].
**When to use:** Sempre nesta fase; qualquer plano que enderece decisão por `resultId` quebra D-42/D-45 no primeiro re-run.
**Example:**
```typescript
// packages/contracts/src/lab.ts (estender — definição única)
export interface DedupGroupDTO {
  id: string;                 // uuid da linha (opaco, para URLs)
  projectId: string;
  canonicalKey: string;       // sha256 hex — identidade estável entre runs
  confidence: 'exact' | 'fuzzy' | 'single';
  status: 'confirmed' | 'pending';   // fuzzy não confirmado = pending, fora do corpus (D-40)
  canonicalResultId: string;  // registro canônico vigente (score D-44 ou pin D-45)
  memberIds: string[];        // proveniência intacta: source/sourceId/runId via ResultDTO
  decision: 'eligible' | 'ineligible' | 'undecided';
  originCount: number;
  origins: Array<'bdtd' | 'capes'>;
}
```

### Pattern 2: Exact-first + Fuzzy-gated Dedup
**What:** Passo 1 — agrupamento exato por `canonicalKey` (O(n), Map). Passo 2 — pares fuzzy só entre chaves distintas **travadas pelo mesmo ano** (blocking evita O(n²) global), similaridade `1 - distance/maxLen ≥ 0.9` sobre títulos normalizados; candidatos fuzzy entram como `pending` (D-40), nunca auto-confirmados; pares em `rejected_pairs` vetam reagrupamento (D-42). Auto-attach de novos runs (D-43): chave exata → entra no grupo existente (mantém status); fuzzy novo → fila pending.
**When to use:** Na computação de grupos por projeto (após cada run e sob demanda); compare (D-47) usa só chaves exatas + grupos confirmados.
**Example:**
```typescript
// apps/core-api/src/lib/dedup.ts — puras, unit-testáveis sem PG
import { createHash } from 'node:crypto';
import { distance } from 'fastest-levenshtein'; // [VERIFIED: npm registry — exports distance/closest]

export function normalizeTitle(raw: string): string {
  return raw
    .normalize('NFKD')                    // separa diacríticos…
    .replace(/[\u0300-\u036f]/g, '')      // …e remove (Educação ≡ Educacao cross-fonte)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')         // pontuação → espaço
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeAuthor(raw: string): string {
  return raw.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function canonicalKey(title: string, year: number | null, authors: string[]): string {
  const parts = [normalizeTitle(title), year === null ? '' : String(year),
    ...authors.map(normalizeAuthor).filter(Boolean).sort()];
  return createHash('sha256').update(parts.join('|'), 'utf8').digest('hex');
}

export function titleSimilarity(a: string, b: string): number {
  const na = normalizeTitle(a); const nb = normalizeTitle(b);
  if (na === nb) return 1;
  const maxLen = Math.max(na.length, nb.length);
  if (maxLen === 0) return 0;
  return 1 - distance(na, nb) / maxLen;   // ≥ 0.9 = fuzzy (D-40)
}

/** Completude D-44: 1 ponto por campo preenchido. */
export function completenessScore(r: { abstract: string | null; authors: string[]; year: number | null; originUrl: string | null; sourceUrl: string | null }): number {
  return (r.abstract ? 1 : 0) + (r.authors.length > 0 ? 1 : 0) + (r.year !== null ? 1 : 0)
    + (r.originUrl || r.sourceUrl ? 1 : 0);
}
// Desempate determinístico: score DESC, source ASC ('bdtd'<'capes'), sourceId ASC (D-44).
```

### Pattern 3: Corpus-as-View (sem tabela de cópia)
**What:** O contrato já define: "O corpus não é uma tabela de cópia: é uma visão derivada dos resultados com decisão `eligible`" [CITED: `dev-docs/07-core-contract.md` §12]. Implementação: resolver na hora — grupos do projeto com `decision = eligible` e `status = confirmed` (ou `single`/`exact`), projetados para o registro canônico vigente. Decisão mutável reflete imediatamente porque não há snapshot (UC-05). Escopo de runs recomendado: membros vindos do **último run concluído de cada busca do projeto** (consistência com a base do compare D-48; evita ressuscitar resultados de runs antigos) [ASSUMED — detalhe não locked; ver A3].
**When to use:** `GET /lab/projects/:projectId/corpus` + `scope=corpus` do export (D-50, resolução server-side).

### Pattern 4: Compare de 4 Blocos sobre Runs Fixos
**What:** Por busca: último run com status terminal de sucesso (`succeeded` ou `partial`; `failed` contribui com zeros + sinalização — nunca `queued`/`running`/`cancelled`) [ASSUMED — "concluído" em D-48; ver A4]. Totais = counts desse run; histograma de anos e counts por fonte do mesmo run; overlap par-a-par = interseção de `canonicalKey`s exatas (+ grupos fuzzy confirmados compartilhados) entre os dois runs [CITED: D-47]. Sem listas de itens (D-49) — saída O(buscas²) pequena, sem paginação.
**When to use:** `GET /lab/searches/:searchId/compare?with=<id1,id2...>` (molde existente §5 da lab-spec).

### Pattern 5: Exportadores Puros + Entrega ASCII-Segura
**What:** `toCSV/toBibTeX/toJSON` como funções puras sobre `CorpusEntryDTO[]` (unit-testáveis com fixtures); a rota só resolve escopo + autorização + headers. CSV: uma linha por grupo com registro canônico + decisão + tags + `originCount` + `origins` (D-53). BibTeX: `@phdthesis` (tese/doutorado) / `@mastersthesis` (dissertação/mestrado), `school`=instituição, key `slug(primeiroAutor)+ano+fonte` com colisão `-a`/`-b` por ordem de grupo (D-51). Filename: slug ASCII do título do projeto + data — evita RFC 5987/`filename*` e header injection (ver Pitfalls).
**When to use:** `GET /lab/projects/:projectId/export?format=csv|bibtex|json&scope=selection|corpus`.

### Pattern 6: Molde de Rota Lab (copiar, não reinventar)
**What:** Toda rota nova segue `routes/lab.ts` [VERIFIED: codebase]: `requireAuth(db)` → `resolveRequestId` + header `x-request-id` → `request.actor` (401 `UNAUTHENTICATED`) → `schema.safeParse` (400 `VALIDATION_ERROR`; params UUID malformados → 404 `NOT_FOUND`) → lib `*ForActor` (null → 404 idêntico) → `buildEnvelope(code, requestId, …)` — nunca mensagem inline. `limit` com clamp DoS via `withClampedLimit` + `resultsQuerySchema`-like.
**When to use:** corpus, dedup confirm/reject, decision, tags, divergence, pin, compare, export.

### Anti-Patterns to Avoid
- **Endereçar decisão/divergência/pin por `resultId`:** quebra em todo re-run (IDs novos). Usar `(projectId, canonicalKey)` — Pattern 1.
- **Fuzzy sem normalização nem blocking:** comparar títulos crus O(n²) gera falsos negativos (acentos/pontuação cross-fonte) e custo explosivo; normalizar + travar por ano primeiro.
- **Threshold aplicado à distância bruta:** `distance ≤ k` não é escala-invariante; usar similaridade normalizada `1 - d/maxLen ≥ 0.9`.
- **Snapshot de corpus em tabela:** decisão mutável + "reflete na hora" proíbe cópia; corpus é view (contrato §12).
- **Compare com item lists ou sobre runs `running`:** viola D-49 e produz números instáveis; 4 blocos sobre runs terminais fixos.
- **Exportar CSV sem guard de injection / filename com título cru:** XSS de planilha e header injection (ver Pitfalls).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Distância de edição / similaridade fuzzy | Comparador próprio (bigramas, Levenshtein manual) | `fastest-levenshtein` (`distance`) | Casos de borda ( attrs unicode, performance O(n·m), tipos); lib auditada, MIT, zero-dep; threshold ≥0.9 calibrado sobre métrica padrão |
| Geração de IDs/UUIDs | `Math.random` / contador | PG `defaultRandom()` + `node:crypto` | Proibido por AGENTS.md; `sha256hex` já é o padrão do repo |
| Paginação/cursor | Novo formato de cursor | `encodeCursor/decodeCursor` + `encodeResultsCursor` (molde D-36) | Convenção testada; decode nunca lança (null em malformado) |
| Envelope de erro | Mensagem inline | `ERROR_CATALOG` + `buildEnvelope` (adicionar códigos só se preciso) | Contrato §9.3; i18n-ready; sem vazamento de stack/SQL |
| Rate limit | Contador próprio | Plugin `registerRateLimits` (global 200/min/IP) + entrada fina para export + limite contratual no banco quando aplicável | PLAT-05 exige rate limit em exportação — o hook atual cobre `lab/searches/*/runs` a 30/min/IP; export precisa de entrada análoga |

**Key insight:** A fronteira hand-roll vs lib nesta fase é: **algoritmo (distância) = lib; serialização determinística pequena (CSV quoter ~10 linhas, escaper BibTeX = mapa fixo, slug ASCII) = hand-roll especificado e testado.** Serializadores têm spec fechada e são mais auditáveis inline do que uma dependência pesada (citation-js/csv) que traria parsing e dialetos desnecessários.

## Common Pitfalls

### Pitfall 1: CSV Formula Injection
**What goes wrong:** Célula começando com `=`, `+`, `-` ou `@` (ex. título `=CMD(...)` ou `-2+3`) executa como fórmula ao abrir no Excel/LibreOffice.
**Why it happens:** Exportador cita corretamente (RFC 4180) mas não neutraliza o prefixo ativo da planilha.
**How to avoid:** Prefixar com apóstrofo (`'`) — ou tab — toda célula cujo primeiro char após quoting esteja em `=+-@`. Teste unit com título adversarial.
**Warning signs:** Teste de export só com dados "limpos" das fixtures.

### Pitfall 2: Filename com título cru (header injection / ick)
**What goes wrong:** `Content-Disposition: attachment; filename="corpus-X<projeto>.csv"` com acentos/aspas/quebras de linha do título vaza header ou quebra download.
**Why it happens:** Título do projeto é input do usuário embutido em header HTTP.
**How to avoid:** Slug ASCII: NFKD → remove diacríticos → `[^a-z0-9]+` → `-`, trim, max 60 chars, fallback `projeto`; data `YYYY-MM-DD`; `filename="<slug>-<data>.<ext>"` só ASCII. Validar com teste (título ` snapshots "../../etc" `).
**Warning signs:** Concatenar título direto no header.

### Pitfall 3: Fuzzy sem trava de ano reagrupa obras distintas
**What goes wrong:** Títulos quase idênticos de anos diferentes (ex. dissertação 2019 → tese 2023 do mesmo autor) entram na fila pending ou, pior, são auto-confirmados por pressa.
**Why it happens:** Similaridade de título ignora a dimensão temporal que a chave exata inclui.
**How to avoid:** Blocking: só comparar pares fuzzy com `year` igual (ambos non-null); `year` null de um lado = sem fuzzy (vira single). Documentar na API que fuzzy exige ano.
**Warning signs:** Fila pending cheia de pares cross-ano.

### Pitfall 4: Decisão por `resultId` evapora no re-run
**What goes wrong:** Reexecução cria novos UUIDs de resultado; decisões/tags/pins antigos "somem".
**Why it happens:** Snapshot congelado por run (D-33) + identidade por row ID.
**How to avoid:** Pattern 1 — identidade por `(projectId, canonicalKey)`; migração dos testes para provar decisão sobrevivendo a re-run com fixtures.
**Warning signs:** JOIN de decisão direto em `lab_results.id` sem passar pela chave.

### Pitfall 5: Pending vazando para corpus/compare/export
**What goes wrong:** Grupo fuzzy não confirmado aparece no corpus ou conta no overlap.
**Why it happens:** Filtro `status = confirmed` esquecido em uma das três leituras.
**How to avoid:** Predicado único compartilhado (`isCorpusEligible(group)`) usado por corpus, compare-overlap e export-scope-corpus; teste que cria pending e asserta ausência nos três.
**Warning signs:** Cada rota com sua própria condição WHERE divergente.

### Pitfall 6: Pin / rejeição perdidos no auto-attach
**What goes wrong:** Novo run recria grupo, recalcula canônico por score e ignora pin; ou reagrupa par rejeitado.
**Why it happens:** Auto-attach (D-43) implementado como "recomputa tudo".
**How to avoid:** Ordem de precedência no attach: (1) veto de `rejected_pairs`, (2) grupo existente por chave exata (mantém status + pin + decisão), (3) fuzzy novo → pending. Pin lido antes do score em toda projeção canônica.
**Warning signs:** Teste de re-run sem assert de pin/rejeição persistidos.

### Pitfall 7: BibTeX que não compila
**What goes wrong:** `&`, `%`, `_`, `#`, `$` crus ou chaves desbalanceadas quebram o `.bbl`; títulos com siglas perdem caixa alta em estilos que fazem case-fold.
**Why it happens:** Metadados BDTD/CAPES contêm `&` (ex. "Genes & Development"-like), `%` em URLs, acentos UTF-8.
**How to avoid:** Escaper verificado (ver Code Examples) + brace-protection de tokens ALL-CAPS no título + teste de balanceamento de chaves na saída.
**Warning signs:** Export BibTeX sem teste de compilação/parse (ao menos round-trip de chaves balanceadas).

## Code Examples

### Chave canônica + fuzzy (ver Pattern 2 para o código completo)
```typescript
// apps/core-api/src/lib/dedup.ts
import { distance } from 'fastest-levenshtein'; // Source: npm readme fastest-levenshtein@1.0.16
const sim = 1 - distance(normalizeTitle(a), normalizeTitle(b)) / Math.max(a.length, b.length, 1);
const isFuzzy = sim >= 0.9; // D-40 — sobre títulos NORMALIZADOS, mesmo ano
```

### CSV RFC 4180 + guard de formula injection
```typescript
// apps/core-api/src/lib/exports.ts
function csvCell(value: string): string {
  const guarded = /^[=+\-@]/.test(value) ? `'${value}` : value; // anti formula-injection
  return /[",\n\r]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}
// Linha por grupo (D-53): canônico + decisão + tags + originCount + origins
// Ex.: "Silva 2021 ...",eligible,"incluir;revisar",2,"bdtd|capes"
```

### BibTeX escape + entry (conjunto verificado em múltiplas fontes)
```typescript
// Source: scholarbits.me/blog/bibtex-special-characters-errors + commit pvliesdonk/scholar-mcp b34c63b
// (ambos concordam no conjunto & % # _ $ ~ ^)
const BIBTEX_ESCAPES: Record<string, string> = {
  '&': '\\&', '%': '\\%', '#': '\\#', '_': '\\_', '$': '\\$',
  '~': '\\textasciitilde{}', '^': '\\textasciicircum{}',
  '{': '\\{', '}': '\\}',
};
export function escapeBibtex(raw: string): string {
  return [...raw.normalize('NFC')].map((ch) => BIBTEX_ESCAPES[ch] ?? ch).join('');
}
// Títulos: proteger siglas ALL-CAPS contra case-fold do estilo:
// "DNA repair in RNA viruses" → "{DNA} repair in {RNA} viruses"
// Autores: join(' and ') — separador BibTeX; key: slug(ultimoNome1)+ano+fonte, colisão → -a/-b (D-51).
// Entry: @phdthesis{tese} / @mastersthesis{dissertação}, school={instituição}.
```

### Filename ASCII-seguro (D-52)
```typescript
export function exportFilename(projectTitle: string, date: string, ext: 'csv' | 'bib' | 'json'): string {
  const slug = projectTitle.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'projeto';
  return `corpus-${slug}-${date}.${ext}`; // ASCII puro → filename= basta, sem filename*
}
// Rota: reply.header('Content-Disposition', `attachment; filename="${name}"`)
// + reply.type('text/csv; charset=utf-8' | 'application/x-bibtex; charset=utf-8' | 'application/json; charset=utf-8')
```

### Query owner-first de grupos (molde searches.ts)
```typescript
// TODA query filtra projects.owner_id = actor.userId via JOIN (fora → null → 404)
const rows = await db.select({ group: labDedupGroups }).from(labDedupGroups)
  .innerJoin(projects, eq(labDedupGroups.projectId, projects.id))
  .where(and(eq(labDedupGroups.id, groupId), eq(projects.ownerId, actor.userId))).limit(1);
// Confirmação (D-41): só o dono — garantido pelo JOIN; sem checagem extra de role.
```

### Compare overlap (D-47)
```typescript
// Chaves exatas do último run concluído de cada busca → interseção de Sets
const keysA = new Set(resultsA.map((r) => canonicalKey(r.title, r.year, r.authors)));
const keysB = new Set(resultsB.map((r) => canonicalKey(r.title, r.year, r.authors)));
const overlap = [...keysA].filter((k) => keysB.has(k)).length; // pairwise; +grupos fuzzy confirmados
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `string-similarity` (Dice) para fuzzy em JS | `fastest-levenshtein` (Levenshtein normalizado) | `string-similarity` deprecated no npm (verificado 2026-09-11) | Usar lib descontinuada = risco de supply-chain sem patches; threshold ≥0.9 deve ser calibrado na métrica Levenshtein normalizada |
| `Decision.resultId` (contrato §12, era Phase 3) | Decisão UMA por grupo (D-46 locked) | Discussão Phase 4 (D-46) | Planner deve superseder o campo `resultId` do contrato — decisão endereçada por group key; divergência vira tabela de anotação |
| `DedupGroup.runId` (contrato §12) | Grupos escopados por projeto, estáveis entre runs | Decisões D-41–D-45 (persistência por projeto, auto-attach) | Planner deve superseder `runId` → `projectId` + `canonicalKey UNIQUE(project)`; membros referenciam runs via `lab_results` |

**Deprecated/outdated:**
- `string-similarity`: deprecated oficial — não usar.
- Decisão/divergência por resultado individual: substituídas por decisão por grupo + anotação por origem (D-46).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Similaridade fuzzy = `1 - lev/maxLen` sobre títulos normalizados, trava de ano igual | Pattern 2, Pitfall 3 | Médio — threshold ≥0.9 tem semântica por métrica; se o planner trocar a métrica sem recalibrar, fuzzy gera falsos ±. Validar com fixtures reais BDTD/CAPES |
| A2 | Entidades de revisão endereçadas por `(projectId, canonicalKey)`; `rejected_pairs` guarda par de chaves (não result IDs) | Pattern 1 | Alto se errado — mas é consequência lógica de D-42/D-43/D-45 + snapshot D-33; plan-check deve confirmar |
| A3 | Corpus resolve sobre o último run concluído de cada busca do projeto | Pattern 3 | Médio — detalhe não locked; alternativa (todos os runs) infla com duplicatas temporais. Confirmar no plan-check |
| A4 | "Último run concluído" = `succeeded\|partial` (latest `executedAt`); `failed` contribui zeros; nunca `queued\|running\|cancelled` | Pattern 4 | Baixo-médio — `partial` incluído porque D-37 o trata como sucesso parcial com resultados válidos |
| A5 | `Content-Disposition: attachment; filename="<ascii>"` basta (sem `filename*`) porque o slug é ASCII puro | Pattern 5, Pitfall 2 | Baixo — ASCII-only elimina a necessidade de RFC 5987; teste deve cobrir títulos com acentos/aspas |
| A6 | Seed preguiçoso de tags default no primeiro uso (sem data migration) cobre projetos pré-existentes da Phase 2 | LAB-09 | Baixo — alternativa é backfill na migration 0003; lazy é mais simples e idempotente por `UNIQUE(project,name)` |
| A7 | Export cabe em resposta sync; se exceder 25s, segue o molde 202+polling Job=Run (D-28) | Validation/Patterns | Baixo — volume v1 (teses/dissertações por projeto) dificilmente estoura; prever flag no plano sem implementar antes da necessidade (não antecipação) |

**Nota:** Nenhum claim de compliance/segurança/retenção marcado `[ASSUMED]` — controles seguem AGENTS.md + security baseline verificados no repo.

## Open Questions (RESOLVED)

1. **Calibragem do threshold fuzzy em dados reais**
   - What we know: ≥0.9 normalizado sobre títulos NFKD é estrito (~10% de edições); trava de ano reduz falsos positivos.
   - What's unclear: Variação real BDTD×CAPES (subtítulos, pontuação, acentos) — pode exigir normalização extra (remoção de subtítulo após `:`) ou ajuste documentado.
   - Recommendation: Wave 0 inclui fixture com pares reais BDTD/CAPES (exato + fuzzy + distinto); teste ancora a taxa; ajuste só com ADR/documentação.
   - **RESOLVED:** Fixture `dedup-overlap.json` com pares exato/fuzzy/distinto/cross-ano em 04-02-t3 + unit `dedup-exports.test.ts` ancorando threshold 0.9 em 04-01-t3.

2. **Limite de tamanho para export sync vs async**
   - What we know: Molde 25s→202 existe (D-28); export v1 é pequeno.
   - What's unclear: Ponto de corte em nº de grupos.
   - Recommendation: Implementar sync direto; documentar o corte como follow-up (não antecipar job de export).
   - **RESOLVED:** Sync direto com DoS guard de 1000 grupos em 04-04-t2 — `scope=corpus` resolve server-side até 1000 grupos, excedente retorna 400 `VALIDATION_ERROR` PT-BR via catálogo.

3. **Cores das tags default**
   - What we know: Nomes locked (incluir, excluir, duplicado, indisponível, revisar).
   - What's unclear: `color` é opcional no contrato; sem decisão de paleta.
   - Recommendation: `color: null` no seed; apresentação decide depois (fora desta fase, sem UI).
   - **RESOLVED:** Seed preguiçoso com `color: null` em 04-03-t2 (`ensureDefaultTags`); paleta de apresentação fora desta fase.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node | Runtime + `node:crypto` + `fastest-levenshtein` | ✓ | 22.17.0 | — |
| pnpm | Instalação da nova dep | ✓ | 9.15.0 | — |
| PostgreSQL DEV | Migration 0003 + integração | ✓ (via API `/health` `db:ok`, `migrationsApplied:3`) | PG 16 (conhecido do checkpoint Phase 1) | — |
| API DEV local | Prova `curl-corpus.sh` | ✓ (`/health` 200) | `0.1.0-fase1` | — |
| npm registry | Instalar `fastest-levenshtein` | ✓ (consultas `npm view` OK) | — | Vendorizar função de distância (último recurso, documentar) |
| `psql` / `pg_isready` CLI | Inspeção manual do banco | ✗ (não instalados) | — | `drizzle-kit studio` / scripts `db:migrate` + testes de integração |
| Docker CLI | Verificação de containers | ✗ (neste container) | — | PG já acessível via rede; sem ação |

**Missing dependencies with no fallback:** Nenhum bloqueante.
**Missing dependencies with fallback:** `psql` (usar integração + migrate scripts); Docker (infra já no ar).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 3.0.5 (workspace `smoke` + `integration`) [VERIFIED: codebase `vitest.config.ts`, root `package.json`] |
| Config file | `vitest.config.ts` (raiz) — smoke `tests/smoke/**`, integration `tests/integration/**`, skip gracioso sem PG |
| Quick run command | `pnpm vitest run --project smoke` (ou `pnpm test` = tudo) |
| Full suite command | `pnpm test:integration` (exige `APP/MIGRATION_DATABASE_URL`; CI com `postgres:16-alpine`) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| LAB-06 | Lista/ficha de resultados (regressão Phase 3) | integration (existente) | `pnpm test:integration -- lab-search-runs` | ✅ existe |
| LAB-07 | Dedup exato agrupa BDTD+CAPES; fuzzy ≥0.9 → pending; confirm/reject; veto de reagrupamento; auto-attach em re-run | unit (puras) + integration | `pnpm vitest run --project smoke -- dedup` (se unit em smoke) + `pnpm test:integration -- lab-corpus` | ❌ Wave 0 |
| LAB-08 | Decisão por grupo persiste; corpus reflete na hora; pending fora do corpus | integration | `pnpm test:integration -- lab-corpus` | ❌ Wave 0 |
| LAB-09 | Seed defaults; tags por grupo; divergência por origem sem mudar decisão | integration | `pnpm test:integration -- lab-corpus` | ❌ Wave 0 |
| LAB-10 | Compare 2+ buscas: 4 blocos exatos, overlap por chaves, último run fixo | integration | `pnpm test:integration -- lab-corpus` | ❌ Wave 0 |
| LAB-11 | CSV (1 linha/grupo) / BibTeX (2 types, `-a/-b`, escapes) / JSON + `Content-Disposition` + seleção explícita + guards (injection, filename) | unit (serializadores) + integration | `pnpm test:integration -- lab-corpus` + `bash scripts/curl-corpus.sh` (novo) | ❌ Wave 0 |
| IDOR | Dono/estranho/adulterado em TODA rota nova com ID | integration + curl | `pnpm test:integration -- idor-matrix` (estender) + `curl-corpus.sh` | ❌ Wave 0 (extensão) |

### Sampling Rate
- **Per task commit:** `pnpm typecheck` + escopo de teste afetado (`-- lab-corpus`)
- **Per wave merge:** `pnpm test` (smoke+integration contra PG DEV)
- **Phase gate:** Full suite verde + `curl-corpus.sh ALL PASS` + auditoria adversarial + checkpoint humano (padrão 03-06) antes de `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `tests/integration/lab-corpus.test.ts` — cobre LAB-07–LAB-11 + IDOR das rotas novas (harness = `lab-search-runs.test.ts`: Fastify in-memory + 2 usuários + cookie real)
- [ ] `tests/integration/fixtures/dedup-overlap.json` — pares BDTD/CAPES: exatos, fuzzy (typo/pontuação), distintos mesmo autor, cross-ano (anti-fuzzy)
- [ ] `tests/unit/dedup-exports.test.ts` (ou casos no corpus test) — `normalizeTitle/canonicalKey/similarity/csvCell/escapeBibtex/slug` puros, incl. adversariais (`=CMD`, título com `"`, `%`, `&`)
- [ ] `scripts/curl-corpus.sh` — molde `curl-lab.sh`: fluxo dedup→decisão→corpus→compare→export + 404s de estranho/adulterado + 401
- [ ] Framework install: `pnpm --filter @uhhu/core-api add fastest-levenshtein` (única dep nova)
- [ ] Migration 0003 (drizzle-kit generate, mold 0002): `lab_dedup_groups`, `lab_dedup_members`, `lab_group_decisions`, `lab_divergences`, `lab_tags`, `lab_group_tags`, `lab_rejected_pairs`, `lab_canonical_pins` — CHECKs espelhando Zod, FKs `onDelete: cascade`, `UNIQUE(project, canonicalKey)`, `UNIQUE(group, source)` em divergências, `UNIQUE(project, name)` em tags

## Security Domain

Nível ASVS 1 (`security_asvs_level: 1`, bloqueio em `high` [VERIFIED: `.planning/config.json`]).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | `requireAuth(db)` em toda rota nova (molde `lab.ts`); confirmação D-41 herda sessão do dono — sem bypass |
| V3 Session Management | no | Nenhuma mudança de sessão nesta fase |
| V4 Access Control | yes | `*ForActor` JOIN →Project em groups/decisions/tags/corpus/compare/export; fora do escopo → 404 idêntico; matriz IDOR estendida |
| V5 Input Validation | yes | Zod na fronteira (decisão enum, motivo ≤ limite, tag nome ≤ 100, nota divergência com sanitização, `with` = lista UUIDs ≤ N, `selection` = lista UUIDs ≤ N); `limit` clamp 1..100 |
| V6 Cryptography | no | Sem cripto nova (SHA-256 é identificação, não segurança; sem segredos nesta fase) |

### Known Threat Patterns for Fastify + Drizzle + Zod (export/dedup)

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| IDOR em group/result/project IDs | Elevation of privilege | Owner-first JOIN; testes dono/estranho/adulterado (curl + integração) |
| CSV formula injection (`=+-@`) | Tampering (client-side exec) | Guard `'` prefix (Pitfall 1) + teste adversarial |
| Header injection via filename | Tampering / Information disclosure | Slug ASCII + teste com título malicioso (Pitfall 2) |
| XSS via nota de divergência/motivo renderizado | XSS (stored, futuro frontend) | Zod max-length + sanitização de HTML na escrita (convenção baseline §2.5); nunca persistir markup |
| SQL injection via filtros/ordenação | Tampering | Drizzle parametrizado; allowlist de enums; sem SQL concatenado |
| DoS via compare/export gigantes | Denial of service | `with` limitado (ex. ≤10 buscas); `selection` limitada (ex. ≤1000 IDs); global 200/min/IP + entrada fina de export no hook (PLAT-05); sem `limit` ilimitado |
| Enumeração cross-user via overlap/compare | Information disclosure | Escopo por projeto do ator antes de qualquer agregação; buscas de outro dono → 404 |
| Segredo em `rawMetadata` exportado no JSON | Information disclosure | Reutilizar higienização dos adapters (T-03-01-02); teste de regex negativa `set-cookie\|token` no corpo do export (molde `lab-search-runs.test.ts`) |

## Sources

### Primary (HIGH confidence)
- `packages/contracts/src/lab.ts`, `packages/db/src/schema.ts`, `apps/core-api/src/lib/searches.ts`, `searchRuns.ts`, `routes/lab.ts`, `plugins/rateLimit.ts`, `contracts/errors.ts`, `pagination.ts` — moldes copiados verbatim [VERIFIED: codebase]
- `dev-docs/03-lab-spec-v1.md` §3/§5/§7/§8, `dev-docs/07-core-contract.md` §9.2/§11.2/§12, `dev-docs/08-security-baseline.md`, `dev-docs/01-arquitetura.md`, `dev-docs/02-decisoes.md` [CITED]
- npm registry: `fastest-levenshtein@1.0.16` (versão, MIT, readme com API `distance/closest`), `string-similarity` deprecated, `talisman@1.1.4`, `csv-stringify@6.8.3` [VERIFIED: npm registry, 2026-09-11]
- `.planning/config.json` (nyquist + ASVS L1), `vitest.config.ts` + root `package.json` (comandos de teste), `tests/integration/lab-search-runs.test.ts` + `scripts/curl-lab.sh` (moldes de prova) [VERIFIED: codebase]

### Secondary (MEDIUM confidence)
- scholarbits.me BibTeX special-characters guide + commit `pvliesdonk/scholar-mcp@b34c63b` (conjunto de escapes `& % # _ $ ~ ^` + proteção de siglas + key com sufixo — duas fontes independentes concordando) [CITED, verificado via websearch]

### Tertiary (LOW confidence)
- Nenhum — sem claims baseados em fonte única não verificada.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — única dep nova verificada no registry (versão, licença, API, status de deprecação do rival).
- Architecture: MEDIUM — síntese fiel de decisões locked + moldes verificados; pontos não-locked (A2–A4) sinalizados para plan-check.
- Pitfalls: MEDIUM-HIGH — CSV-injection, filename e fuzzy-blocking são padrões bem estabelecidos; calibragem do threshold exige fixtures reais (Open Question 1).
- Security: HIGH — controles derivam de AGENTS.md/baseline já aplicados nas Phases 2–3.

**Research date:** 2026-09-11
**Valid until:** 2026-10-11 (30 dias — stack estável; revalidar `fastest-levenshtein` somente se o install falhar)
