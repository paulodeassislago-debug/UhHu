#!/usr/bin/env bash
# prova headless ponta a ponta nos 3 canais (05-05, D-54/D-55/D-57).
# Pre-req: PG DEV migrado (`pnpm --filter @uhhu/db db:migrate` com .env.dev,
# ex.: `set -a; source .env.dev.cs; set +a`) mais servidor
# `pnpm --filter @uhhu/core-api start` com o mesmo env (BASE_URL aponta para
# ele; default http://127.0.0.1:3000). Operar so contra localhost ou
# staging proprio.
#
# Cadeia: projeto→busca→run→resultados→dedup→decisao→corpus→exportacao por
# REST (cookie) e repetida por CLI (PAT, env sem *DATABASE*) e por MCP
# (PAT via scripts/mcp-call.mjs, env sem *DATABASE*) contra o mesmo banco.
# Fase D prova negativas 401/404 e confirm sem E/S. Qualquer FAIL aborta.

set -u

BASE_URL="${BASE_URL:-http://127.0.0.1:3000}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CLI_BIN="$ROOT/apps/cli/bin/uhhu.mjs"
MCP_CALL="$ROOT/scripts/mcp-call.mjs"
GHOST="00000000-0000-4000-8000-000000000000"
TMPDIR_PROVA="$(mktemp -d)"
CLI_HOME_A="$(mktemp -d)"
CLI_HOME_B="$(mktemp -d)"
OUTDIR_CSV="$(mktemp -d)"

cleanup() {
  rm -rf "$TMPDIR_PROVA" "$CLI_HOME_A" "$CLI_HOME_B" "$OUTDIR_CSV"
}
trap cleanup EXIT

JAR_A="$TMPDIR_PROVA/a.jar"
JAR_B="$TMPDIR_PROVA/b.jar"
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

assert_contains() {
  local file="$1"
  local needle="$2"
  local name="$3"
  if ! grep -qF "$needle" "$file"; then
    echo "FAIL $name: '$needle' ausente em $file" >&2
    exit 1
  fi
  echo "PASS $name (contem '$needle')"
}

assert_not_contains() {
  local file="$1"
  local needle="$2"
  local name="$3"
  if grep -qF "$needle" "$file"; then
    echo "FAIL $name: '$needle' deveria estar ausente em $file" >&2
    exit 1
  fi
  echo "PASS $name (ausente '$needle')"
}

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

jlen() {
  node -e "
const fs = require('fs');
const j = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
const path = process.argv[2].split('.');
let v = j;
for (const k of path) { v = v[k]; }
if (Array.isArray(v)) { console.log(String(v.length)); }
else { console.log('0'); }
" "$1" "$2"
}

echo "== BASE_URL=$BASE_URL =="

# -- FASE A (REST, cookie) --
CODE=$(curl -s -o "$TMPDIR_PROVA/health.json" -w '%{http_code}' -D "$TMPDIR_PROVA/health.hdrs" "$BASE_URL/health")
assert_code 200 "$CODE" "A1 GET /health"
grep -qi "x-request-id" "$TMPDIR_PROVA/health.hdrs" || { echo "FAIL A1 sem x-request-id" >&2; exit 1; }
echo "PASS A1 com x-request-id"

CODE=$(curl -s -o "$TMPDIR_PROVA/invA.json" -w '%{http_code}' -X POST "$BASE_URL/api/v1/auth/invites" -H 'content-type: application/json' -d '{}')
if [ "$CODE" = "401" ]; then
  echo "INFO bootstrap 401 (banco nao vazio) — tentando login dos usuarios da prova"
  CODE=$(curl -s -o "$TMPDIR_PROVA/loginA.json" -w '%{http_code}' -c "$JAR_A" -b "$JAR_A" -X POST "$BASE_URL/api/v1/auth/login" -H 'content-type: application/json' -d '{"email":"prova-headless-a@example.com","password":"SenhaForte123!","rememberMe":true}')
  assert_code 200 "$CODE" "A2 login A existente"
  CODE=$(curl -s -o "$TMPDIR_PROVA/loginB.json" -w '%{http_code}' -c "$JAR_B" -b "$JAR_B" -X POST "$BASE_URL/api/v1/auth/login" -H 'content-type: application/json' -d '{"email":"prova-headless-b@example.com","password":"SenhaForte123!","rememberMe":true}')
  assert_code 200 "$CODE" "A3 login B existente"
else
  assert_code 201 "$CODE" "A2 POST /auth/invites bootstrap"
  INV_A=$(jget "$TMPDIR_PROVA/invA.json" inviteToken)
  if [ -z "$INV_A" ]; then echo "FAIL invite A vazio" >&2; exit 1; fi
  CODE=$(curl -s -o "$TMPDIR_PROVA/regA.json" -w '%{http_code}' -c "$JAR_A" -X POST "$BASE_URL/api/v1/auth/register" -H 'content-type: application/json' -d "{\"name\":\"Prova A\",\"email\":\"prova-headless-a@example.com\",\"password\":\"SenhaForte123!\",\"inviteToken\":\"$INV_A\"}")
  if [ "$CODE" = "409" ]; then
    echo "INFO registro A 409 — seguindo para login"
  else
    assert_code 201 "$CODE" "A3 POST /auth/register A"
  fi
  CODE=$(curl -s -o "$TMPDIR_PROVA/loginA.json" -w '%{http_code}' -c "$JAR_A" -b "$JAR_A" -X POST "$BASE_URL/api/v1/auth/login" -H 'content-type: application/json' -d '{"email":"prova-headless-a@example.com","password":"SenhaForte123!","rememberMe":true}')
  assert_code 200 "$CODE" "A4 POST /auth/login A"
  CODE=$(curl -s -o "$TMPDIR_PROVA/invB.json" -w '%{http_code}' -b "$JAR_A" -X POST "$BASE_URL/api/v1/auth/invites" -H 'content-type: application/json' -d '{}')
  assert_code 201 "$CODE" "A5 POST /auth/invites B"
  INV_B=$(jget "$TMPDIR_PROVA/invB.json" inviteToken)
  if [ -z "$INV_B" ]; then echo "FAIL invite B vazio" >&2; exit 1; fi
  CODE=$(curl -s -o "$TMPDIR_PROVA/regB.json" -w '%{http_code}' -c "$JAR_B" -X POST "$BASE_URL/api/v1/auth/register" -H 'content-type: application/json' -d "{\"name\":\"Prova B\",\"email\":\"prova-headless-b@example.com\",\"password\":\"SenhaForte123!\",\"inviteToken\":\"$INV_B\"}")
  if [ "$CODE" = "409" ]; then
    echo "INFO registro B 409 — seguindo para login"
  else
    assert_code 201 "$CODE" "A6 POST /auth/register B"
  fi
  CODE=$(curl -s -o "$TMPDIR_PROVA/loginB.json" -w '%{http_code}' -c "$JAR_B" -b "$JAR_B" -X POST "$BASE_URL/api/v1/auth/login" -H 'content-type: application/json' -d '{"email":"prova-headless-b@example.com","password":"SenhaForte123!","rememberMe":true}')
  assert_code 200 "$CODE" "A7 POST /auth/login B"
fi

STAMP=$(date +%Y%m%d-%H%M%S)
CODE=$(curl -s -o "$TMPDIR_PROVA/proj.json" -w '%{http_code}' -b "$JAR_A" -X POST "$BASE_URL/api/v1/projects" -H 'content-type: application/json' -d "{\"title\":\"Projeto prova-headless $STAMP\"}")
assert_code 201 "$CODE" "A8 POST /projects A cria"
PROJ=$(jget "$TMPDIR_PROVA/proj.json" id)
if [ -z "$PROJ" ]; then echo "FAIL projeto sem id" >&2; exit 1; fi
echo "INFO projeto=$PROJ"
echo "$PROJ" > "$TMPDIR_PROVA/proj.id"

CODE=$(curl -s -o "$TMPDIR_PROVA/search.json" -w '%{http_code}' -b "$JAR_A" -X POST "$BASE_URL/api/v1/lab/searches" -H 'content-type: application/json' -d "{\"projectId\":\"$PROJ\",\"term\":\"\\\"ensino de química\\\"\",\"filters\":{\"yearFrom\":2020,\"yearTo\":2024},\"sources\":[\"bdtd\",\"capes\"]}")
assert_code 201 "$CODE" "A9 POST /lab/searches A cria"
SEARCH=$(jget "$TMPDIR_PROVA/search.json" id)
if [ -z "$SEARCH" ]; then echo "FAIL search sem id" >&2; exit 1; fi
echo "INFO search=$SEARCH"
echo "$SEARCH" > "$TMPDIR_PROVA/search.id"

CODE=$(curl -s -o "$TMPDIR_PROVA/searches.json" -w '%{http_code}' -b "$JAR_A" "$BASE_URL/api/v1/lab/searches?projectId=$PROJ")
assert_code 200 "$CODE" "A10 GET /lab/searches lista"

CODE=$(curl -s -o "$TMPDIR_PROVA/run1.json" -w '%{http_code}' --max-time 90 -b "$JAR_A" -X POST "$BASE_URL/api/v1/lab/searches/$SEARCH/runs" -H 'content-type: application/json' -d '{}')
assert_code_in "201,202" "$CODE" "A11 POST /lab/searches/:id/runs executa"
RUN1=$(jget "$TMPDIR_PROVA/run1.json" id)
if [ -z "$RUN1" ]; then echo "FAIL run sem id" >&2; exit 1; fi
echo "INFO run1=$RUN1 (http $CODE)"

for i in $(seq 1 60); do
  CODE=$(curl -s -o "$TMPDIR_PROVA/job.json" -w '%{http_code}' -b "$JAR_A" "$BASE_URL/api/v1/jobs/$RUN1")
  assert_code 200 "$CODE" "A12 GET /jobs/:id poll $i"
  STATUS=$(jget "$TMPDIR_PROVA/job.json" status)
  echo "INFO job status=$STATUS (tentativa $i)"
  case "$STATUS" in
    succeeded|partial|failed|cancelled) break ;;
  esac
  if [ "$i" = "60" ]; then echo "FAIL job nao terminou em 120s (status=$STATUS)" >&2; exit 1; fi
  sleep 2
done

CODE=$(curl -s -o "$TMPDIR_PROVA/run-get.json" -w '%{http_code}' -b "$JAR_A" "$BASE_URL/api/v1/lab/runs/$RUN1")
assert_code 200 "$CODE" "A13 GET /lab/runs/:id espelha job"

CODE=$(curl -s -o "$TMPDIR_PROVA/results.json" -w '%{http_code}' -b "$JAR_A" "$BASE_URL/api/v1/lab/runs/$RUN1/results?limit=20")
assert_code 200 "$CODE" "A14 GET /lab/runs/:id/results lista"

CODE=$(curl -s -o "$TMPDIR_PROVA/groups.json" -w '%{http_code}' -b "$JAR_A" "$BASE_URL/api/v1/lab/projects/$PROJ/groups?limit=20")
assert_code 200 "$CODE" "A15 GET /lab/projects/:id/groups lista"
GROUP=$(node -e "
const fs=require('fs');
const j=JSON.parse(fs.readFileSync('$TMPDIR_PROVA/groups.json','utf8'));
const items=j.items||[];
const pend=items.find((g)=>g.decision==='undecided')||items[0];
console.log(pend?pend.id:'');
")
if [ -z "$GROUP" ]; then echo "FAIL sem grupo de dedup para decidir" >&2; exit 1; fi
echo "INFO group=$GROUP"
echo "$GROUP" > "$TMPDIR_PROVA/group.id"
GROUP2=$(node -e "
const fs=require('fs');
const j=JSON.parse(fs.readFileSync('$TMPDIR_PROVA/groups.json','utf8'));
const items=(j.items||[]).filter((g)=>g.decision==='undecided');
console.log(items.length>1?items[1].id:(items[0]?items[0].id:''));
")
echo "$GROUP2" > "$TMPDIR_PROVA/group2.id"

CODE=$(curl -s -o "$TMPDIR_PROVA/decide.json" -w '%{http_code}' -b "$JAR_A" -X PUT "$BASE_URL/api/v1/lab/groups/$GROUP/decision" -H 'content-type: application/json' -d '{"decision":"eligible","reason":"prova headless"}')
assert_code 200 "$CODE" "A16 PUT /lab/groups/:id/decision eligible"

CODE=$(curl -s -o "$TMPDIR_PROVA/tag.json" -w '%{http_code}' -b "$JAR_A" -X POST "$BASE_URL/api/v1/lab/projects/$PROJ/tags" -H 'content-type: application/json' -d '{"name":"prova"}')
assert_code 201 "$CODE" "A17 POST /lab/projects/:id/tags cria"
TAG=$(jget "$TMPDIR_PROVA/tag.json" id)
if [ -z "$TAG" ]; then echo "FAIL tag sem id" >&2; exit 1; fi

CODE=$(curl -s -o "$TMPDIR_PROVA/attach.json" -w '%{http_code}' -b "$JAR_A" -X POST "$BASE_URL/api/v1/lab/groups/$GROUP/tags" -H 'content-type: application/json' -d "{\"tagId\":\"$TAG\"}")
assert_code 200 "$CODE" "A18 POST /lab/groups/:id/tags anexa"

CODE=$(curl -s -o "$TMPDIR_PROVA/corpus.json" -w '%{http_code}' -b "$JAR_A" "$BASE_URL/api/v1/lab/projects/$PROJ/corpus?limit=20")
assert_code 200 "$CODE" "A19 GET /lab/projects/:id/corpus"
assert_contains "$TMPDIR_PROVA/corpus.json" "$GROUP" "A19 corpus contem o grupo decidido"

CODE=$(curl -s -o "$TMPDIR_PROVA/search2.json" -w '%{http_code}' -b "$JAR_A" -X POST "$BASE_URL/api/v1/lab/searches" -H 'content-type: application/json' -d "{\"projectId\":\"$PROJ\",\"term\":\"\\\"educação básica\\\"\",\"sources\":[\"bdtd\",\"capes\"]}")
assert_code 201 "$CODE" "A20 POST segunda busca para compare"
SEARCH2=$(jget "$TMPDIR_PROVA/search2.json" id)
if [ -z "$SEARCH2" ]; then echo "FAIL segunda search sem id" >&2; exit 1; fi

CODE=$(curl -s -o "$TMPDIR_PROVA/compare.json" -w '%{http_code}' -b "$JAR_A" "$BASE_URL/api/v1/lab/searches/$SEARCH/compare?with=$SEARCH2")
assert_code 200 "$CODE" "A21 GET /lab/searches/:id/compare"
assert_contains "$TMPDIR_PROVA/compare.json" "$SEARCH2" "A21 compare cita a segunda busca"

CODE=$(curl -s -D "$TMPDIR_PROVA/export.hdrs" -o "$TMPDIR_PROVA/corpus-export.json" -w '%{http_code}' -b "$JAR_A" "$BASE_URL/api/v1/lab/projects/$PROJ/export?format=json&scope=corpus")
assert_code 200 "$CODE" "A22 GET /lab/projects/:id/export json"
grep -qi 'filename="corpus-.*\.json"' "$TMPDIR_PROVA/export.hdrs" || { echo "FAIL export sem filename corpus-*.json" >&2; exit 1; }
echo "PASS A22 export filename corpus-*.json"
assert_contains "$TMPDIR_PROVA/corpus-export.json" "$PROJ" "A22 export json contem projectId"
cp "$TMPDIR_PROVA/corpus-export.json" "$TMPDIR_PROVA/corpus-$PROJ.json"

CODE=$(curl -s -o "$TMPDIR_PROVA/patA.json" -w '%{http_code}' -X POST "$BASE_URL/api/v1/auth/token" -H 'content-type: application/json' -d '{"email":"prova-headless-a@example.com","password":"SenhaForte123!","deviceName":"prova-rest"}')
assert_code 201 "$CODE" "A23 POST /auth/token emite PAT de A"
PAT_A=$(jget "$TMPDIR_PROVA/patA.json" token)
if [ -z "$PAT_A" ]; then echo "FAIL PAT A vazio" >&2; exit 1; fi
CODE=$(curl -s -o "$TMPDIR_PROVA/patB.json" -w '%{http_code}' -X POST "$BASE_URL/api/v1/auth/token" -H 'content-type: application/json' -d '{"email":"prova-headless-b@example.com","password":"SenhaForte123!","deviceName":"prova-rest-B"}')
assert_code 201 "$CODE" "A24 POST /auth/token emite PAT de B"
PAT_B=$(jget "$TMPDIR_PROVA/patB.json" token)
if [ -z "$PAT_B" ]; then echo "FAIL PAT B vazio" >&2; exit 1; fi

# -- FASE B (CLI, PAT, env sem *DATABASE*) --
IDEMP="prova-$(date +%Y%m%d)-${SEARCH:0:8}"
HOME="$CLI_HOME_A" env -u APP_DATABASE_URL -u MIGRATION_DATABASE_URL UHHU_API_URL="$BASE_URL" node "$CLI_BIN" auth login --email prova-headless-a@example.com --password 'SenhaForte123!' --device prova-cli > "$TMPDIR_PROVA/cli-login.out" 2> "$TMPDIR_PROVA/cli-login.err"
CODE=$?
assert_code 0 "$CODE" "B1 uhhu auth login (sem DATABASE_URL no env)"
assert_not_contains "$TMPDIR_PROVA/cli-login.out" "$PAT_A" "B1 PAT fora do stdout"

HOME="$CLI_HOME_A" env -u APP_DATABASE_URL -u MIGRATION_DATABASE_URL UHHU_API_URL="$BASE_URL" node "$CLI_BIN" project list --json > "$TMPDIR_PROVA/cli-list.json" 2> "$TMPDIR_PROVA/cli-list.err"
CODE=$?
assert_code 0 "$CODE" "B2 uhhu project list --json (mesmo banco)"
assert_contains "$TMPDIR_PROVA/cli-list.json" "$PROJ" "B2 lista contem o projeto da Fase A"

HOME="$CLI_HOME_A" env -u APP_DATABASE_URL -u MIGRATION_DATABASE_URL UHHU_API_URL="$BASE_URL" node "$CLI_BIN" lab search run --search "$SEARCH" --idempotency-key "$IDEMP" --json > "$TMPDIR_PROVA/cli-run1.json" 2> "$TMPDIR_PROVA/cli-run1.err"
CODE=$?
assert_code 0 "$CODE" "B3 uhhu lab search run com idempotency-key"
RUN_CLI=$(jget "$TMPDIR_PROVA/cli-run1.json" id)
if [ -z "$RUN_CLI" ]; then echo "FAIL CLI run sem id" >&2; exit 1; fi
echo "INFO cli run=$RUN_CLI"

HOME="$CLI_HOME_A" env -u APP_DATABASE_URL -u MIGRATION_DATABASE_URL UHHU_API_URL="$BASE_URL" node "$CLI_BIN" lab search run --search "$SEARCH" --idempotency-key "$IDEMP" --json > "$TMPDIR_PROVA/cli-run2.json" 2> "$TMPDIR_PROVA/cli-run2.err"
CODE=$?
assert_code 0 "$CODE" "B4 uhhu lab search run replay mesma key"
RUN_CLI2=$(jget "$TMPDIR_PROVA/cli-run2.json" id)
if [ "$RUN_CLI" != "$RUN_CLI2" ]; then echo "FAIL replay devolveu id diferente ($RUN_CLI vs $RUN_CLI2)" >&2; exit 1; fi
echo "PASS B4 replay MESMO run ($RUN_CLI2)"

HOME="$CLI_HOME_A" env -u APP_DATABASE_URL -u MIGRATION_DATABASE_URL UHHU_API_URL="$BASE_URL" node "$CLI_BIN" lab export --project "$PROJ" --format csv --out "$OUTDIR_CSV" > "$TMPDIR_PROVA/cli-export.out" 2> "$TMPDIR_PROVA/cli-export.err"
CODE=$?
assert_code 0 "$CODE" "B5 uhhu lab export csv salva arquivo"
CSV_FILE=$(ls "$OUTDIR_CSV"/corpus-*.csv 2>/dev/null | head -n 1)
if [ -z "$CSV_FILE" ]; then echo "FAIL csv corpus-*.csv ausente" >&2; exit 1; fi
echo "PASS B5 csv salvo ($CSV_FILE)"
CSV_LINES=$(awk 'END{print NR}' "$CSV_FILE")
if [ "$CSV_LINES" -lt 2 ]; then echo "FAIL csv sem linhas de dados (header + >=1 grupo)" >&2; exit 1; fi
echo "PASS B5 csv com $CSV_LINES linhas (header + grupos)"
CSV_DATA=$(awk 'END{print NR-1}' "$CSV_FILE")
if [ "$CSV_DATA" -lt 1 ]; then echo "FAIL csv sem 1 linha por grupo" >&2; exit 1; fi
echo "PASS B5 csv com $CSV_DATA linha(s) de grupo"

HOME="$CLI_HOME_A" env -u APP_DATABASE_URL -u MIGRATION_DATABASE_URL UHHU_API_URL="$BASE_URL" node "$CLI_BIN" auth logout > "$TMPDIR_PROVA/cli-logout.out" 2> "$TMPDIR_PROVA/cli-logout.err"
CODE=$?
assert_code 0 "$CODE" "B6 uhhu auth logout"

# -- FASE C (MCP, PAT via helper, env sem *DATABASE*) --
env -u APP_DATABASE_URL -u MIGRATION_DATABASE_URL UHHU_TOKEN="$PAT_A" UHHU_API_URL="$BASE_URL" node "$MCP_CALL" lab_list_projects '{}' > "$TMPDIR_PROVA/mcp-projects.json" 2> "$TMPDIR_PROVA/mcp-projects.err"
CODE=$?
assert_code 0 "$CODE" "C1 mcp-call lab_list_projects"
assert_contains "$TMPDIR_PROVA/mcp-projects.json" "$PROJ" "C1 MCP ve o projeto da Fase A"

env -u APP_DATABASE_URL -u MIGRATION_DATABASE_URL UHHU_TOKEN="$PAT_A" UHHU_API_URL="$BASE_URL" node "$MCP_CALL" lab_execute_search "{\"searchId\":\"$SEARCH\",\"confirm\":true,\"idempotencyKey\":\"$IDEMP-mcp\"}" > "$TMPDIR_PROVA/mcp-run.json" 2> "$TMPDIR_PROVA/mcp-run.err"
CODE=$?
assert_code 0 "$CODE" "C2 mcp-call lab_execute_search com confirm"
RUN_MCP=$(jget "$TMPDIR_PROVA/mcp-run.json" id)
if [ -z "$RUN_MCP" ]; then echo "FAIL MCP run sem id" >&2; exit 1; fi
echo "INFO mcp run=$RUN_MCP"

env -u APP_DATABASE_URL -u MIGRATION_DATABASE_URL UHHU_TOKEN="$PAT_A" UHHU_API_URL="$BASE_URL" node "$MCP_CALL" lab_list_results "{\"runId\":\"$RUN_MCP\",\"limit\":20}" > "$TMPDIR_PROVA/mcp-results.json" 2> "$TMPDIR_PROVA/mcp-results.err"
CODE=$?
assert_code 0 "$CODE" "C3 mcp-call lab_list_results"

GROUP_MCP=$(cat "$TMPDIR_PROVA/group2.id")
if [ -z "$GROUP_MCP" ]; then GROUP_MCP="$GROUP"; fi
env -u APP_DATABASE_URL -u MIGRATION_DATABASE_URL UHHU_TOKEN="$PAT_A" UHHU_API_URL="$BASE_URL" node "$MCP_CALL" lab_set_result_decision "{\"groupId\":\"$GROUP_MCP\",\"decision\":\"eligible\",\"confirm\":true}" > "$TMPDIR_PROVA/mcp-decide.json" 2> "$TMPDIR_PROVA/mcp-decide.err"
CODE=$?
assert_code 0 "$CODE" "C4 mcp-call lab_set_result_decision com confirm"
assert_contains "$TMPDIR_PROVA/mcp-decide.json" "eligible" "C4 MCP decidiu eligible"

env -u APP_DATABASE_URL -u MIGRATION_DATABASE_URL UHHU_TOKEN="$PAT_A" UHHU_API_URL="$BASE_URL" node "$MCP_CALL" lab_get_corpus "{\"projectId\":\"$PROJ\"}" > "$TMPDIR_PROVA/mcp-corpus.json" 2> "$TMPDIR_PROVA/mcp-corpus.err"
CODE=$?
assert_code 0 "$CODE" "C5 mcp-call lab_get_corpus"
assert_contains "$TMPDIR_PROVA/mcp-corpus.json" "$GROUP" "C5 MCP corpus contem o grupo"

env -u APP_DATABASE_URL -u MIGRATION_DATABASE_URL UHHU_TOKEN="$PAT_A" UHHU_API_URL="$BASE_URL" node "$MCP_CALL" lab_export_project "{\"projectId\":\"$PROJ\",\"format\":\"json\",\"confirm\":true}" > "$TMPDIR_PROVA/mcp-export.json" 2> "$TMPDIR_PROVA/mcp-export.err"
CODE=$?
assert_code 0 "$CODE" "C6 mcp-call lab_export_project"
assert_contains "$TMPDIR_PROVA/mcp-export.json" "corpus-" "C6 MCP export filename corpus-*"

env -u APP_DATABASE_URL -u MIGRATION_DATABASE_URL UHHU_TOKEN="$PAT_A" UHHU_API_URL="$BASE_URL" node "$MCP_CALL" lab_list_sources '{}' > "$TMPDIR_PROVA/mcp-sources.json" 2> "$TMPDIR_PROVA/mcp-sources.err"
CODE=$?
assert_code 0 "$CODE" "C7 mcp-call lab_list_sources"
assert_contains "$TMPDIR_PROVA/mcp-sources.json" "bdtd" "C7 MCP lista bdtd"

env -u APP_DATABASE_URL -u MIGRATION_DATABASE_URL UHHU_TOKEN="$PAT_A" UHHU_API_URL="$BASE_URL" node "$MCP_CALL" lab_get_source_health '{"source":"bdtd"}' > "$TMPDIR_PROVA/mcp-health.json" 2> "$TMPDIR_PROVA/mcp-health.err"
CODE=$?
assert_code 0 "$CODE" "C8 mcp-call lab_get_source_health bdtd"

# -- FASE D (negativas: 401/404/confirm) --
CODE=$(curl -s -o "$TMPDIR_PROVA/neg-bad.json" -w '%{http_code}' "$BASE_URL/api/v1/projects" -H 'authorization: Bearer aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')
assert_code 401 "$CODE" "D1 Bearer invalido 401"

CODE=$(curl -s -o /dev/stderr -w '%{http_code}' -b "$JAR_B" "$BASE_URL/api/v1/projects/$PROJ")
assert_code 404 "$CODE" "D2 estranho B no projeto de A 404"

CODE=$(curl -s -o /dev/stderr -w '%{http_code}' -b "$JAR_A" "$BASE_URL/api/v1/projects/$GHOST")
assert_code 404 "$CODE" "D3 GHOST adulterado 404"

CODE=$(curl -s -o /dev/stderr -w '%{http_code}' -b "$JAR_B" "$BASE_URL/api/v1/lab/projects/$PROJ/corpus?limit=5")
assert_code 404 "$CODE" "D4 estranho B no corpus de A 404"

HOME="$CLI_HOME_B" env -u APP_DATABASE_URL -u MIGRATION_DATABASE_URL UHHU_API_URL="$BASE_URL" node "$CLI_BIN" auth login --email prova-headless-b@example.com --password 'SenhaForte123!' --device prova-cli-B > /dev/null 2>&1
HOME="$CLI_HOME_B" env -u APP_DATABASE_URL -u MIGRATION_DATABASE_URL UHHU_API_URL="$BASE_URL" node "$CLI_BIN" lab corpus get --project "$PROJ" > "$TMPDIR_PROVA/cli-stranger.out" 2> "$TMPDIR_PROVA/cli-stranger.err"
CODE=$?
assert_code 4 "$CODE" "D5 CLI estranho no projeto de A sai 4 (404)"

env -u APP_DATABASE_URL -u MIGRATION_DATABASE_URL UHHU_TOKEN="$PAT_B" UHHU_API_URL="$BASE_URL" node "$MCP_CALL" lab_get_corpus "{\"projectId\":\"$PROJ\"}" > "$TMPDIR_PROVA/mcp-stranger.json" 2> "$TMPDIR_PROVA/mcp-stranger.err"
CODE=$?
if [ "$CODE" = "0" ]; then echo "FAIL D6 MCP estranho deveria falhar" >&2; exit 1; fi
echo "PASS D6 MCP estranho falha (exit $CODE)"
grep -q "NOT_FOUND" "$TMPDIR_PROVA/mcp-stranger.err" || grep -q "NOT_FOUND" "$TMPDIR_PROVA/mcp-stranger.json" || { echo "FAIL D6 MCP estranho sem NOT_FOUND" >&2; exit 1; }
echo "PASS D6 MCP estranho NOT_FOUND"

env -u APP_DATABASE_URL -u MIGRATION_DATABASE_URL UHHU_TOKEN="$PAT_A" UHHU_API_URL="$BASE_URL" node "$MCP_CALL" lab_set_result_decision "{\"groupId\":\"$GROUP\",\"decision\":\"eligible\"}" > "$TMPDIR_PROVA/mcp-noconfirm.json" 2> "$TMPDIR_PROVA/mcp-noconfirm.err"
CODE=$?
if [ "$CODE" = "0" ]; then echo "FAIL D7 MCP sem confirm deveria falhar" >&2; exit 1; fi
echo "PASS D7 MCP sem confirm falha (exit $CODE)"
grep -qi "confirm" "$TMPDIR_PROVA/mcp-noconfirm.err" || { echo "FAIL D7 MCP sem confirm sem pista de confirm" >&2; exit 1; }
echo "PASS D7 MCP sem confirm exige confirm sem E/S"

echo "ALL PASS (REST→CLI→MCP no mesmo banco, replay idempotente, negativas 401/404/confirm)"
