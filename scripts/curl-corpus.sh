#!/usr/bin/env bash
# 04-05: prova manual via curl do fluxo corpus; rode com o servidor local + PG DEV.
# Ex.: BASE_URL=http://127.0.0.1:3000 bash scripts/curl-corpus.sh
# Pre-req: `pnpm --filter @uhhu/db db:migrate` contra PG DEV + `pnpm --filter @uhhu/core-api start`
# (ou `tsx src/index.ts`) com o mesmo .env (ex.: .env.dev.cs dentro do code-server).
# NUNCA contra prod de terceiros (so local/staging proprio).
#
# Fluxo: bootstrap→2 usuários→projeto→2 searches→run→poll job→results (LAB-06 regressao)→
# groups→confirm→decision→corpus reflete→compare 4 blocos→export csv|bib|json+selection→
# 5 provas IDOR (estranho 404×3, fantasma 404, sem cookie 401).
# Cada passo com assert_code; final echo "ALL PASS corpus".

set -u

BASE_URL="${BASE_URL:-http://127.0.0.1:3000}"
JAR_A="/tmp/uhhu-corpus-a.jar"
JAR_B="/tmp/uhhu-corpus-b.jar"
GHOST="00000000-0000-4000-8000-000000000000"
TMPDIR_CURL="$(mktemp -d)"

cleanup() {
  rm -rf "$TMPDIR_CURL"
}
trap cleanup EXIT

rm -f "$JAR_A" "$JAR_B"

assert_code() {
  local expected="$1"
  local actual="$2"
  local name="$3"
  if [ "$expected" != "$actual" ]; then
    echo "FAIL $name: esperado $expected, obtido $actual" >&2
    exit 1
  fi
  echo "PASS $name ($actual)"
}

assert_code_in() {
  local expected_list="$1"
  local actual="$2"
  local name="$3"
  case ",$expected_list," in
    *",$actual,"*) echo "PASS $name ($actual)" ;;
    *) echo "FAIL $name: esperado um de [$expected_list], obtido $actual" >&2; exit 1 ;;
  esac
}

# Extrai campo JSON de primeiro nivel ou aninhado simples via node (sem jq).
# Uso: jget /tmp/body.json inviteToken  |  jget /tmp/body.json user.id
jget() {
  node -e "
const fs = require('fs');
const raw = fs.readFileSync(process.argv[1], 'utf8');
const j = JSON.parse(raw);
const path = process.argv[2].split('.');
let v = j;
for (const k of path) { v = v[k]; }
if (v === null || v === undefined) { console.log(''); }
else if (typeof v === 'object') { console.log(JSON.stringify(v)); }
else { console.log(String(v)); }
" "$1" "$2"
}

echo "== BASE_URL=$BASE_URL =="

# 1. health 200 com x-request-id
CODE=$(curl -s -o "$TMPDIR_CURL/health.json" -w '%{http_code}' -D "$TMPDIR_CURL/health.hdrs" "$BASE_URL/health")
assert_code 200 "$CODE" "GET /health"
grep -qi "x-request-id" "$TMPDIR_CURL/health.hdrs" || { echo "FAIL /health sem x-request-id" >&2; exit 1; }
echo "PASS GET /health com x-request-id"

# 2. bootstrap do primeiro convite (sem cookie) -> 201 em banco vazio;
# 401 quando o DEV ja tem usuarios (bootstrap aberto so sem usuarios —
# coberto pela integracao com wipe; aqui segue para registro 409-tolerante)
CODE=$(curl -s -o "$TMPDIR_CURL/invA.json" -w '%{http_code}' -X POST "$BASE_URL/api/v1/auth/invites" -H 'content-type: application/json' -d '{}')
if [ "$CODE" = "401" ]; then
  echo "INFO bootstrap 401 (DEV com usuarios) — usando registro direto"
  INV_A="bootstrap-indisponivel"
else
  assert_code 201 "$CODE" "POST /auth/invites bootstrap"
  INV_A=$(jget "$TMPDIR_CURL/invA.json" inviteToken)
  if [ -z "$INV_A" ]; then echo "FAIL invite A vazio" >&2; exit 1; fi
fi

# 3. registro A (dono) -> 201 + cookie (ou 409/400 no DEV compartilhado -> login)
CODE=$(curl -s -o "$TMPDIR_CURL/regA.json" -w '%{http_code}' -c "$JAR_A" -X POST "$BASE_URL/api/v1/auth/register" -H 'content-type: application/json' -d "{\"name\":\"Corpus A\",\"email\":\"curl-corpus-a@example.com\",\"password\":\"SenhaForte123!\",\"inviteToken\":\"$INV_A\"}")
if [ "$CODE" = "409" ] || [ "$CODE" = "400" ]; then
  echo "INFO registro A $CODE (ja existe ou DEV compartilhado) — seguindo para login"
else
  assert_code 201 "$CODE" "POST /auth/register A"
fi

# 4. login A -> 200 (garante jar A valido mesmo com 409 acima)
CODE=$(curl -s -o "$TMPDIR_CURL/loginA.json" -w '%{http_code}' -c "$JAR_A" -b "$JAR_A" -X POST "$BASE_URL/api/v1/auth/login" -H 'content-type: application/json' -d '{"email":"curl-corpus-a@example.com","password":"SenhaForte123!","rememberMe":true}')
assert_code 200 "$CODE" "POST /auth/login A"

# 5. convite B (com cookie A) -> 201
CODE=$(curl -s -o "$TMPDIR_CURL/invB.json" -w '%{http_code}' -b "$JAR_A" -X POST "$BASE_URL/api/v1/auth/invites" -H 'content-type: application/json' -d '{}')
assert_code 201 "$CODE" "POST /auth/invites B"
INV_B=$(jget "$TMPDIR_CURL/invB.json" inviteToken)
if [ -z "$INV_B" ]; then echo "FAIL invite B vazio" >&2; exit 1; fi

# 6. registro B -> 201 + jar B (ou 409/400 no DEV compartilhado -> login)
CODE=$(curl -s -o "$TMPDIR_CURL/regB.json" -w '%{http_code}' -c "$JAR_B" -X POST "$BASE_URL/api/v1/auth/register" -H 'content-type: application/json' -d "{\"name\":\"Corpus B\",\"email\":\"curl-corpus-b@example.com\",\"password\":\"SenhaForte123!\",\"inviteToken\":\"$INV_B\"}")
if [ "$CODE" = "409" ] || [ "$CODE" = "400" ]; then
  echo "INFO registro B $CODE (ja existe ou DEV compartilhado) — seguindo para login"
else
  assert_code 201 "$CODE" "POST /auth/register B"
fi
CODE=$(curl -s -o "$TMPDIR_CURL/loginB.json" -w '%{http_code}' -c "$JAR_B" -b "$JAR_B" -X POST "$BASE_URL/api/v1/auth/login" -H 'content-type: application/json' -d '{"email":"curl-corpus-b@example.com","password":"SenhaForte123!","rememberMe":true}')
assert_code 200 "$CODE" "POST /auth/login B"

# 7. A cria projeto -> 201
CODE=$(curl -s -o "$TMPDIR_CURL/proj.json" -w '%{http_code}' -b "$JAR_A" -X POST "$BASE_URL/api/v1/projects" -H 'content-type: application/json' -d '{"title":"Corpus Prova","researchQuestion":"revisao decide compara exporta com proveniencia"}')
assert_code 201 "$CODE" "POST /projects A cria"
PROJ=$(jget "$TMPDIR_CURL/proj.json" id)
if [ -z "$PROJ" ]; then echo "FAIL projeto sem id" >&2; exit 1; fi
echo "INFO projeto=$PROJ"

# 8. A cria 2 searches (base do compare) -> 201
CODE=$(curl -s -o "$TMPDIR_CURL/search.json" -w '%{http_code}' -b "$JAR_A" -X POST "$BASE_URL/api/v1/lab/searches" -H 'content-type: application/json' -d "{\"projectId\":\"$PROJ\",\"term\":\"educacao inclusiva\",\"filters\":{},\"sources\":[\"bdtd\",\"capes\"]}")
assert_code 201 "$CODE" "POST /lab/searches A cria base"
SEARCH=$(jget "$TMPDIR_CURL/search.json" id)
if [ -z "$SEARCH" ]; then echo "FAIL search sem id" >&2; exit 1; fi
CODE=$(curl -s -o "$TMPDIR_CURL/search2.json" -w '%{http_code}' -b "$JAR_A" -X POST "$BASE_URL/api/v1/lab/searches" -H 'content-type: application/json' -d "{\"projectId\":\"$PROJ\",\"term\":\"letramento digital\",\"filters\":{},\"sources\":[\"bdtd\",\"capes\"]}")
assert_code 201 "$CODE" "POST /lab/searches A cria segunda"
SEARCH2=$(jget "$TMPDIR_CURL/search2.json" id)
if [ -z "$SEARCH2" ]; then echo "FAIL search2 sem id" >&2; exit 1; fi
echo "INFO search=$SEARCH search2=$SEARCH2"

# 9. A executa run (busca viva; pode demorar até 25s) -> 201 (ou 202 se estourar o sync)
CODE=$(curl -s -o "$TMPDIR_CURL/run1.json" -w '%{http_code}' --max-time 90 -b "$JAR_A" -X POST "$BASE_URL/api/v1/lab/searches/$SEARCH/runs" -H 'content-type: application/json' -d '{}')
assert_code_in "201,202" "$CODE" "POST /lab/searches/:id/runs executa"
RUN1=$(jget "$TMPDIR_CURL/run1.json" id)
if [ -z "$RUN1" ]; then echo "FAIL run sem id" >&2; exit 1; fi
echo "INFO run1=$RUN1 (http $CODE)"

# 10. Poll do job até estado terminal (até 60s)
if [ "$CODE" = "202" ]; then
  for i in $(seq 1 60); do
    CODE=$(curl -s -o "$TMPDIR_CURL/job.json" -w '%{http_code}' -b "$JAR_A" "$BASE_URL/api/v1/jobs/$RUN1")
    assert_code 200 "$CODE" "GET /jobs/:id poll $i"
    STATUS=$(jget "$TMPDIR_CURL/job.json" status)
    echo "INFO job status=$STATUS (tentativa $i)"
    case "$STATUS" in
      succeeded|partial|failed|cancelled) break ;;
    esac
    if [ "$i" = "60" ]; then echo "FAIL job nao terminou em 60s (status=$STATUS)" >&2; exit 1; fi
    sleep 1
  done
fi

# 11. LAB-06 regressao: lista results do run + ficha individual -> 200
CODE=$(curl -s -o "$TMPDIR_CURL/results.json" -w '%{http_code}' -b "$JAR_A" "$BASE_URL/api/v1/lab/runs/$RUN1/results?limit=5")
assert_code 200 "$CODE" "GET /lab/runs/:id/results regressao LAB-06"
grep -q '"items"' "$TMPDIR_CURL/results.json" || { echo "FAIL results sem items" >&2; exit 1; }
grep -q '"page"' "$TMPDIR_CURL/results.json" || { echo "FAIL results sem page" >&2; exit 1; }
echo "PASS GET /lab/runs/:id/results com items+page"
RESULT=$(node -e "
const fs=require('fs');
const j=JSON.parse(fs.readFileSync('$TMPDIR_CURL/results.json','utf8'));
console.log(j.items && j.items[0] ? j.items[0].id : '');
")
RESULT2=$(node -e "
const fs=require('fs');
const j=JSON.parse(fs.readFileSync('$TMPDIR_CURL/results.json','utf8'));
console.log(j.items && j.items[1] ? j.items[1].id : '');
")
if [ -z "$RESULT" ]; then echo "FAIL run sem resultados (fontes falharam?) — corpus exige dados" >&2; exit 1; fi
CODE=$(curl -s -o "$TMPDIR_CURL/result.json" -w '%{http_code}' -b "$JAR_A" "$BASE_URL/api/v1/lab/results/$RESULT")
assert_code 200 "$CODE" "GET /lab/results/:id ficha LAB-06"
grep -q '"rawMetadata"' "$TMPDIR_CURL/result.json" || { echo "FAIL ficha sem rawMetadata" >&2; exit 1; }
echo "PASS GET /lab/results/:id com rawMetadata"

# 12. Groups: dedup materializa -> 200 com ao menos 1 grupo
CODE=$(curl -s -o "$TMPDIR_CURL/groups.json" -w '%{http_code}' -b "$JAR_A" "$BASE_URL/api/v1/lab/projects/$PROJ/groups")
assert_code 200 "$CODE" "GET /lab/projects/:id/groups"
GROUP=$(node -e "
const fs=require('fs');
const j=JSON.parse(fs.readFileSync('$TMPDIR_CURL/groups.json','utf8'));
const items=j.items||[];
const pending=items.find((g)=>g.status==='pending');
console.log((pending||items[0]||{}).id||'');
")
if [ -z "$GROUP" ]; then echo "FAIL nenhum grupo (run sem resultados?)" >&2; exit 1; fi
echo "INFO group=$GROUP (pending preferido)"

# 13. Confirm + decision eligible -> 200
CODE=$(curl -s -o "$TMPDIR_CURL/confirm.json" -w '%{http_code}' -b "$JAR_A" -X POST "$BASE_URL/api/v1/lab/groups/$GROUP/confirm" -H 'content-type: application/json' -d '{}')
assert_code 200 "$CODE" "POST /lab/groups/:id/confirm"
CODE=$(curl -s -o "$TMPDIR_CURL/decision.json" -w '%{http_code}' -b "$JAR_A" -X PUT "$BASE_URL/api/v1/lab/groups/$GROUP/decision" -H 'content-type: application/json' -d '{"decision":"eligible"}')
assert_code 200 "$CODE" "PUT /lab/groups/:id/decision eligible"

# 14. Corpus reflete na hora -> 200 com eligible
CODE=$(curl -s -o "$TMPDIR_CURL/corpus.json" -w '%{http_code}' -b "$JAR_A" "$BASE_URL/api/v1/lab/projects/$PROJ/corpus")
assert_code 200 "$CODE" "GET /lab/projects/:id/corpus"
grep -q 'eligible' "$TMPDIR_CURL/corpus.json" || { echo "FAIL corpus sem eligible (reflexo na hora?)" >&2; exit 1; }
echo "PASS GET /lab/projects/:id/corpus reflete eligible"

# 15. Compare 2 buscas -> 200 com os 4 blocos e sem items
CODE=$(curl -s -o "$TMPDIR_CURL/compare.json" -w '%{http_code}' -b "$JAR_A" "$BASE_URL/api/v1/lab/searches/$SEARCH/compare?with=$SEARCH2")
assert_code 200 "$CODE" "GET /lab/searches/:id/compare"
for bloco in totals yearHistogram bySource pairwiseOverlap; do
  grep -q "\"$bloco\"" "$TMPDIR_CURL/compare.json" || { echo "FAIL compare sem bloco $bloco" >&2; exit 1; }
done
grep -q '"items"' "$TMPDIR_CURL/compare.json" && { echo "FAIL compare com items (viola D-49)" >&2; exit 1; }
echo "PASS GET compare com 4 blocos sem items"

# 16. Export CSV -> 200 attachment text/csv
CODE=$(curl -s -o "$TMPDIR_CURL/export.csv" -w '%{http_code}' -D "$TMPDIR_CURL/export-csv.hdrs" -b "$JAR_A" "$BASE_URL/api/v1/lab/projects/$PROJ/export?format=csv&scope=corpus")
assert_code 200 "$CODE" "GET export csv corpus"
grep -qi 'Content-Disposition: attachment' "$TMPDIR_CURL/export-csv.hdrs" || { echo "FAIL csv sem Content-Disposition attachment" >&2; exit 1; }
grep -qi 'filename="corpus-' "$TMPDIR_CURL/export-csv.hdrs" || { echo "FAIL csv sem filename corpus-" >&2; exit 1; }
grep -qi 'text/csv' "$TMPDIR_CURL/export-csv.hdrs" || { echo "FAIL csv sem Content-Type text/csv" >&2; exit 1; }
echo "PASS GET export csv attachment"

# 17. Export BibTeX -> 200 com entry
CODE=$(curl -s -o "$TMPDIR_CURL/export.bib" -w '%{http_code}' -D "$TMPDIR_CURL/export-bib.hdrs" -b "$JAR_A" "$BASE_URL/api/v1/lab/projects/$PROJ/export?format=bibtex&scope=corpus")
assert_code 200 "$CODE" "GET export bibtex corpus"
grep -q -E '@phdthesis|@mastersthesis' "$TMPDIR_CURL/export.bib" || { echo "FAIL bib sem entry" >&2; exit 1; }
echo "PASS GET export bibtex com entry"

# 18. Export JSON -> 200 com groups+provenance
CODE=$(curl -s -o "$TMPDIR_CURL/export.json" -w '%{http_code}' -b "$JAR_A" "$BASE_URL/api/v1/lab/projects/$PROJ/export?format=json&scope=corpus")
assert_code 200 "$CODE" "GET export json corpus"
grep -q '"groups"' "$TMPDIR_CURL/export.json" || { echo "FAIL json sem groups" >&2; exit 1; }
grep -q '"provenance"' "$TMPDIR_CURL/export.json" || { echo "FAIL json sem provenance" >&2; exit 1; }
echo "PASS GET export json com groups+provenance"

# 19. Export selection explicita -> 200
SEL="$RESULT"
if [ -n "$RESULT2" ]; then SEL="$RESULT,$RESULT2"; fi
CODE=$(curl -s -o /dev/stderr -w '%{http_code}' -b "$JAR_A" "$BASE_URL/api/v1/lab/projects/$PROJ/export?format=csv&scope=selection&selection=$SEL")
assert_code 200 "$CODE" "GET export selection explicita"

# 20. IDOR: B em groups/corpus/export -> 404
CODE=$(curl -s -o /dev/stderr -w '%{http_code}' -b "$JAR_B" "$BASE_URL/api/v1/lab/projects/$PROJ/groups")
assert_code 404 "$CODE" "GET groups estranho 404"
CODE=$(curl -s -o /dev/stderr -w '%{http_code}' -b "$JAR_B" "$BASE_URL/api/v1/lab/projects/$PROJ/corpus")
assert_code 404 "$CODE" "GET corpus estranho 404"
CODE=$(curl -s -o /dev/stderr -w '%{http_code}' -b "$JAR_B" "$BASE_URL/api/v1/lab/projects/$PROJ/export?format=json&scope=corpus")
assert_code 404 "$CODE" "GET export estranho 404"

# 21. Fantasma com A -> 404; sem cookie -> 401
CODE=$(curl -s -o /dev/stderr -w '%{http_code}' -b "$JAR_A" "$BASE_URL/api/v1/lab/projects/$GHOST/groups")
assert_code 404 "$CODE" "GET groups fantasma 404"
CODE=$(curl -s -o /dev/stderr -w '%{http_code}' "$BASE_URL/api/v1/lab/projects/$PROJ/corpus")
assert_code 401 "$CODE" "GET corpus sem cookie 401"

echo "ALL PASS corpus (dedup→decisao→corpus→compare→export + IDOR + LAB-06)"
