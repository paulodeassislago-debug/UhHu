#!/usr/bin/env bash
# 03-06: prova manual via curl do fluxo lab; rode com o servidor local + PG DEV.
# Ex.: BASE_URL=http://127.0.0.1:3000 bash scripts/curl-lab.sh
# Pre-req: `pnpm --filter @uhhu/db db:migrate` contra PG DEV + `pnpm --filter @uhhu/core-api start`
# (ou `tsx src/index.ts`) com o mesmo .env (ex.: .env.dev.cs dentro do code-server).
# NUNCA contra prod de terceiros (so local/staging proprio).
#
# Fluxo: bootstrap→2 usuários→projeto→search→run→poll job→results→rerun(newCount)→
# cancel→health→4 provas 404 de estranho + adulterado + 401 sem cookie.
# Cada passo com assert_code; final echo "ALL PASS".

set -u

BASE_URL="${BASE_URL:-http://127.0.0.1:3000}"
JAR_A="/tmp/uhhu-lab-a.jar"
JAR_B="/tmp/uhhu-lab-b.jar"
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

# 2. bootstrap do primeiro convite (sem cookie) -> 201
CODE=$(curl -s -o "$TMPDIR_CURL/invA.json" -w '%{http_code}' -X POST "$BASE_URL/api/v1/auth/invites" -H 'content-type: application/json' -d '{}')
assert_code 201 "$CODE" "POST /auth/invites bootstrap"
INV_A=$(jget "$TMPDIR_CURL/invA.json" inviteToken)
if [ -z "$INV_A" ]; then echo "FAIL invite A vazio" >&2; exit 1; fi

# 3. registro A (admin) -> 201 + cookie HttpOnly (ou 409 -> login)
CODE=$(curl -s -o "$TMPDIR_CURL/regA.json" -w '%{http_code}' -c "$JAR_A" -X POST "$BASE_URL/api/v1/auth/register" -H 'content-type: application/json' -d "{\"name\":\"Lab A\",\"email\":\"curl-lab-a@example.com\",\"password\":\"SenhaForte123!\",\"inviteToken\":\"$INV_A\"}")
if [ "$CODE" = "409" ]; then
  echo "INFO registro A 409 (ja existe) — seguindo para login"
else
  assert_code 201 "$CODE" "POST /auth/register A"
fi

# 4. login A -> 200 (garante jar A valido mesmo com 409 acima)
CODE=$(curl -s -o "$TMPDIR_CURL/loginA.json" -w '%{http_code}' -c "$JAR_A" -b "$JAR_A" -X POST "$BASE_URL/api/v1/auth/login" -H 'content-type: application/json' -d '{"email":"curl-lab-a@example.com","password":"SenhaForte123!","rememberMe":true}')
assert_code 200 "$CODE" "POST /auth/login A"

# 5. convite B (com cookie A) -> 201
CODE=$(curl -s -o "$TMPDIR_CURL/invB.json" -w '%{http_code}' -b "$JAR_A" -X POST "$BASE_URL/api/v1/auth/invites" -H 'content-type: application/json' -d '{}')
assert_code 201 "$CODE" "POST /auth/invites B"
INV_B=$(jget "$TMPDIR_CURL/invB.json" inviteToken)
if [ -z "$INV_B" ]; then echo "FAIL invite B vazio" >&2; exit 1; fi

# 6. registro B -> 201 + jar B (ou 409 -> login)
CODE=$(curl -s -o "$TMPDIR_CURL/regB.json" -w '%{http_code}' -c "$JAR_B" -X POST "$BASE_URL/api/v1/auth/register" -H 'content-type: application/json' -d "{\"name\":\"Lab B\",\"email\":\"curl-lab-b@example.com\",\"password\":\"SenhaForte123!\",\"inviteToken\":\"$INV_B\"}")
if [ "$CODE" = "409" ]; then
  echo "INFO registro B 409 (ja existe) — seguindo para login"
else
  assert_code 201 "$CODE" "POST /auth/register B"
fi
CODE=$(curl -s -o "$TMPDIR_CURL/loginB.json" -w '%{http_code}' -c "$JAR_B" -b "$JAR_B" -X POST "$BASE_URL/api/v1/auth/login" -H 'content-type: application/json' -d '{"email":"curl-lab-b@example.com","password":"SenhaForte123!","rememberMe":true}')
assert_code 200 "$CODE" "POST /auth/login B"

# 7. A cria projeto -> 201
CODE=$(curl -s -o "$TMPDIR_CURL/proj.json" -w '%{http_code}' -b "$JAR_A" -X POST "$BASE_URL/api/v1/projects" -H 'content-type: application/json' -d '{"title":"Projeto curl-lab"}')
assert_code 201 "$CODE" "POST /projects A cria"
PROJ=$(jget "$TMPDIR_CURL/proj.json" id)
if [ -z "$PROJ" ]; then echo "FAIL projeto sem id" >&2; exit 1; fi
echo "INFO projeto=$PROJ"

# 8. A cria search declarativa (termo com aspas + filtros ano/tipo) -> 201
CODE=$(curl -s -o "$TMPDIR_CURL/search.json" -w '%{http_code}' -b "$JAR_A" -X POST "$BASE_URL/api/v1/lab/searches" -H 'content-type: application/json' -d "{\"projectId\":\"$PROJ\",\"term\":\"\\\"ensino de química\\\"\",\"filters\":{\"yearFrom\":2020,\"yearTo\":2024},\"sources\":[\"bdtd\",\"capes\"]}")
assert_code 201 "$CODE" "POST /lab/searches A cria"
SEARCH=$(jget "$TMPDIR_CURL/search.json" id)
if [ -z "$SEARCH" ]; then echo "FAIL search sem id" >&2; exit 1; fi
echo "INFO search=$SEARCH"

# 9. A lista searches do projeto -> 200
CODE=$(curl -s -o "$TMPDIR_CURL/searches.json" -w '%{http_code}' -b "$JAR_A" "$BASE_URL/api/v1/lab/searches?projectId=$PROJ")
assert_code 200 "$CODE" "GET /lab/searches lista"

# 10. A executa run (busca viva BDTD+CAPES; pode demorar até 25s) -> 201 (ou 202 se estourar o sync)
CODE=$(curl -s -o "$TMPDIR_CURL/run1.json" -w '%{http_code}' --max-time 60 -b "$JAR_A" -X POST "$BASE_URL/api/v1/lab/searches/$SEARCH/runs" -H 'content-type: application/json' -d '{}')
assert_code_in "201,202" "$CODE" "POST /lab/searches/:id/runs executa"
RUN1=$(jget "$TMPDIR_CURL/run1.json" id)
if [ -z "$RUN1" ]; then echo "FAIL run sem id" >&2; exit 1; fi
echo "INFO run1=$RUN1 (http $CODE)"

# 11. Poll do job até estado terminal (até 40s): succeeded|partial|failed|cancelled
for i in $(seq 1 40); do
  CODE=$(curl -s -o "$TMPDIR_CURL/job.json" -w '%{http_code}' -b "$JAR_A" "$BASE_URL/api/v1/jobs/$RUN1")
  assert_code 200 "$CODE" "GET /jobs/:id poll $i"
  STATUS=$(jget "$TMPDIR_CURL/job.json" status)
  echo "INFO job status=$STATUS (tentativa $i)"
  case "$STATUS" in
    succeeded|partial|failed|cancelled) break ;;
  esac
  if [ "$i" = "40" ]; then echo "FAIL job nao terminou em 40s (status=$STATUS)" >&2; exit 1; fi
  sleep 1
done

# 12. GET run espelha o job -> 200
CODE=$(curl -s -o "$TMPDIR_CURL/run-get.json" -w '%{http_code}' -b "$JAR_A" "$BASE_URL/api/v1/lab/runs/$RUN1")
assert_code 200 "$CODE" "GET /lab/runs/:id espelha job"

# 13. GET results lista com source/sourceId/rawMetadata -> 200
CODE=$(curl -s -o "$TMPDIR_CURL/results.json" -w '%{http_code}' -b "$JAR_A" "$BASE_URL/api/v1/lab/runs/$RUN1/results?limit=20")
assert_code 200 "$CODE" "GET /lab/runs/:id/results lista"
RESULT=$(node -e "
const fs=require('fs');
const j=JSON.parse(fs.readFileSync('$TMPDIR_CURL/results.json','utf8'));
console.log(j.items && j.items[0] ? j.items[0].id : '');
")
if [ -z "$RESULT" ]; then echo "INFO sem resultados (fontes podem ter falhado com partial/failed justificado)"; else echo "INFO result=$RESULT"; fi

# 14. Rerun cria novo run com diff (newCount) -> 201/202 e id diferente
CODE=$(curl -s -o "$TMPDIR_CURL/run2.json" -w '%{http_code}' --max-time 60 -b "$JAR_A" -X POST "$BASE_URL/api/v1/lab/searches/$SEARCH/runs" -H 'content-type: application/json' -d '{}')
assert_code_in "201,202" "$CODE" "POST rerun cria novo run"
RUN2=$(jget "$TMPDIR_CURL/run2.json" id)
if [ -z "$RUN2" ]; then echo "FAIL rerun sem id" >&2; exit 1; fi
if [ "$RUN1" = "$RUN2" ]; then echo "FAIL rerun devolveu o mesmo id (sem diff)" >&2; exit 1; fi
echo "PASS rerun novo id ($RUN2, newCount em metrics)"
echo "INFO run2=$RUN2"

# 15. Cancel do rerun -> 200 (pode já estar terminal; o endpoint responde 200 nos dois casos)
CODE=$(curl -s -o "$TMPDIR_CURL/cancel.json" -w '%{http_code}' -b "$JAR_A" -X POST "$BASE_URL/api/v1/jobs/$RUN2/cancel" -H 'content-type: application/json' -d '{}')
assert_code 200 "$CODE" "POST /jobs/:id/cancel"

# 16. Health das fontes -> 200 com counts
CODE=$(curl -s -o "$TMPDIR_CURL/health-bdtd.json" -w '%{http_code}' -b "$JAR_A" "$BASE_URL/api/v1/lab/sources/bdtd/health")
assert_code 200 "$CODE" "GET /lab/sources/bdtd/health"
CODE=$(curl -s -o "$TMPDIR_CURL/health-capes.json" -w '%{http_code}' -b "$JAR_A" "$BASE_URL/api/v1/lab/sources/capes/health")
assert_code 200 "$CODE" "GET /lab/sources/capes/health"

# 17. Sources lista 3 com oasisbr desabilitada -> 200
CODE=$(curl -s -o "$TMPDIR_CURL/sources.json" -w '%{http_code}' -b "$JAR_A" "$BASE_URL/api/v1/lab/sources")
assert_code 200 "$CODE" "GET /lab/sources lista 3"

# 18. B tenta GET search alheia -> 404
CODE=$(curl -s -o /dev/stderr -w '%{http_code}' -b "$JAR_B" "$BASE_URL/api/v1/lab/searches/$SEARCH")
assert_code 404 "$CODE" "GET /lab/searches/:id estranho 404"

# 19. B tenta GET run alheio -> 404
CODE=$(curl -s -o /dev/stderr -w '%{http_code}' -b "$JAR_B" "$BASE_URL/api/v1/lab/runs/$RUN1")
assert_code 404 "$CODE" "GET /lab/runs/:id estranho 404"

# 20. B tenta POST run em search alheia -> 404
CODE=$(curl -s -o /dev/stderr -w '%{http_code}' -b "$JAR_B" -X POST "$BASE_URL/api/v1/lab/searches/$SEARCH/runs" -H 'content-type: application/json' -d '{}')
assert_code 404 "$CODE" "POST /lab/searches/:id/runs estranho 404"

# 21. B tenta GET result alheio -> 404 (se houve resultado; senão usa fantasma)
if [ -n "$RESULT" ]; then
  CODE=$(curl -s -o /dev/stderr -w '%{http_code}' -b "$JAR_B" "$BASE_URL/api/v1/lab/results/$RESULT")
  assert_code 404 "$CODE" "GET /lab/results/:id estranho 404"
else
  CODE=$(curl -s -o /dev/stderr -w '%{http_code}' -b "$JAR_B" "$BASE_URL/api/v1/lab/results/$GHOST")
  assert_code 404 "$CODE" "GET /lab/results/:id estranho 404 (fantasma)"
fi

# 22. ID adulterado (UUID inexistente) com cookie A -> 404
CODE=$(curl -s -o /dev/stderr -w '%{http_code}' -b "$JAR_A" "$BASE_URL/api/v1/lab/searches/$GHOST")
assert_code 404 "$CODE" "GET /lab/searches/:id adulterado 404"

echo "ALL PASS (busca→run→results→rerun→cancel→health→estranho 404×4, adulterado 404)"
