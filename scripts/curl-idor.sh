#!/usr/bin/env bash
# PLAT-04: prova manual via curl; rode com o servidor local + PG DEV.
# Ex.: BASE_URL=http://127.0.0.1:3000 bash scripts/curl-idor.sh
# Pre-req: `pnpm db:migrate` contra PG DEV + `pnpm --filter @uhhu/core-api start`
# (ou `tsx src/index.ts`). NUNCA contra prod de terceiros (so local/staging proprio).
#
# Matriz dono/estranho/ID-adulterado em leitura/alteracao/exclusao para
# projetos (+ cross-delete de sessao): A cria, B tenta GET/PATCH/DELETE
# (404/404/404), UUID adulterado 404, delete sem confirm 400 e com confirm 204.

set -u

BASE_URL="${BASE_URL:-http://127.0.0.1:3000}"
JAR_A="/tmp/uhhu-a.jar"
JAR_B="/tmp/uhhu-b.jar"
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
if (typeof v === 'object') { console.log(JSON.stringify(v)); } else { console.log(String(v)); }
" "$1" "$2"
}

echo "== BASE_URL=$BASE_URL =="

# 1. health 200 com 4 campos + x-request-id
CODE=$(curl -s -o "$TMPDIR_CURL/health.json" -w '%{http_code}' -D "$TMPDIR_CURL/health.hdrs" "$BASE_URL/health")
assert_code 200 "$CODE" "GET /health"
grep -qi "x-request-id" "$TMPDIR_CURL/health.hdrs" || { echo "FAIL /health sem x-request-id" >&2; exit 1; }
echo "PASS GET /health com x-request-id"

# 2. bootstrap do primeiro convite (sem cookie) -> 201
CODE=$(curl -s -o "$TMPDIR_CURL/invA.json" -w '%{http_code}' -X POST "$BASE_URL/api/v1/auth/invites" -H 'content-type: application/json' -d '{}')
assert_code 201 "$CODE" "POST /auth/invites bootstrap"
INV_A=$(jget "$TMPDIR_CURL/invA.json" inviteToken)
if [ -z "$INV_A" ]; then echo "FAIL invite A vazio" >&2; exit 1; fi

# 3. registro A (admin) -> 201 + cookie HttpOnly
CODE=$(curl -s -o "$TMPDIR_CURL/regA.json" -w '%{http_code}' -c "$JAR_A" -X POST "$BASE_URL/api/v1/auth/register" -H 'content-type: application/json' -d "{\"name\":\"Curl A\",\"email\":\"curl-a@example.com\",\"password\":\"SenhaForte123!\",\"inviteToken\":\"$INV_A\"}")
# Registro pode 409 se o banco ja tem o e-mail de rodada anterior; nesse caso faz login.
if [ "$CODE" = "409" ]; then
  echo "INFO registro A 409 (ja existe) — seguindo para login"
else
  assert_code 201 "$CODE" "POST /auth/register A"
fi

# 4. login A -> 200 (garante jar A valido mesmo com 409 acima)
CODE=$(curl -s -o "$TMPDIR_CURL/loginA.json" -w '%{http_code}' -c "$JAR_A" -b "$JAR_A" -X POST "$BASE_URL/api/v1/auth/login" -H 'content-type: application/json' -d '{"email":"curl-a@example.com","password":"SenhaForte123!","rememberMe":true}')
assert_code 200 "$CODE" "POST /auth/login A"

# 5. convite B (com cookie A) -> 201
CODE=$(curl -s -o "$TMPDIR_CURL/invB.json" -w '%{http_code}' -b "$JAR_A" -X POST "$BASE_URL/api/v1/auth/invites" -H 'content-type: application/json' -d '{}')
assert_code 201 "$CODE" "POST /auth/invites B"
INV_B=$(jget "$TMPDIR_CURL/invB.json" inviteToken)
if [ -z "$INV_B" ]; then echo "FAIL invite B vazio" >&2; exit 1; fi

# 6. registro B -> 201 + jar B (ou 409 -> login)
CODE=$(curl -s -o "$TMPDIR_CURL/regB.json" -w '%{http_code}' -c "$JAR_B" -X POST "$BASE_URL/api/v1/auth/register" -H 'content-type: application/json' -d "{\"name\":\"Curl B\",\"email\":\"curl-b@example.com\",\"password\":\"SenhaForte123!\",\"inviteToken\":\"$INV_B\"}")
if [ "$CODE" = "409" ]; then
  echo "INFO registro B 409 (ja existe) — seguindo para login"
else
  assert_code 201 "$CODE" "POST /auth/register B"
fi
CODE=$(curl -s -o "$TMPDIR_CURL/loginB.json" -w '%{http_code}' -c "$JAR_B" -b "$JAR_B" -X POST "$BASE_URL/api/v1/auth/login" -H 'content-type: application/json' -d '{"email":"curl-b@example.com","password":"SenhaForte123!","rememberMe":true}')
assert_code 200 "$CODE" "POST /auth/login B"

# 7. A cria projeto -> 201
CODE=$(curl -s -o "$TMPDIR_CURL/proj.json" -w '%{http_code}' -b "$JAR_A" -X POST "$BASE_URL/api/v1/projects" -H 'content-type: application/json' -d '{"title":"Projeto curl-idor"}')
assert_code 201 "$CODE" "POST /projects A cria"
PROJ=$(jget "$TMPDIR_CURL/proj.json" id)
if [ -z "$PROJ" ]; then echo "FAIL projeto sem id" >&2; exit 1; fi
echo "INFO projeto=$PROJ"

# 8. B tenta GET -> 404
CODE=$(curl -s -o /dev/stderr -w '%{http_code}' -b "$JAR_B" "$BASE_URL/api/v1/projects/$PROJ")
assert_code 404 "$CODE" "GET /projects/:id estranho 404"

# 9. B tenta PATCH -> 404
CODE=$(curl -s -o /dev/stderr -w '%{http_code}' -b "$JAR_B" -X PATCH "$BASE_URL/api/v1/projects/$PROJ" -H 'content-type: application/json' -d '{"title":"Roubo"}')
assert_code 404 "$CODE" "PATCH /projects/:id estranho 404"

# 10. B tenta DELETE com confirm -> 404 (dado intacto)
CODE=$(curl -s -o /dev/stderr -w '%{http_code}' -b "$JAR_B" -X DELETE "$BASE_URL/api/v1/projects/$PROJ?confirm=true")
assert_code 404 "$CODE" "DELETE /projects/:id estranho 404"

# 11. ID adulterado (UUID inexistente) com cookie A -> 404
CODE=$(curl -s -o /dev/stderr -w '%{http_code}' -b "$JAR_A" "$BASE_URL/api/v1/projects/$GHOST")
assert_code 404 "$CODE" "GET /projects/:id adulterado 404"

# 12. Cross-delete de sessao: A lista, B tenta revogar sessao de A -> 404
CODE=$(curl -s -o "$TMPDIR_CURL/sessA.json" -w '%{http_code}' -b "$JAR_A" "$BASE_URL/api/v1/auth/sessions")
assert_code 200 "$CODE" "GET /auth/sessions A"
SESS_A=$(node -e "
const fs=require('fs');
const j=JSON.parse(fs.readFileSync('$TMPDIR_CURL/sessA.json','utf8'));
console.log(j.sessions[0].id);
")
CODE=$(curl -s -o /dev/stderr -w '%{http_code}' -b "$JAR_B" -X DELETE "$BASE_URL/api/v1/auth/sessions/$SESS_A")
assert_code 404 "$CODE" "DELETE /auth/sessions/:id estranho 404"

# 13. A deleta sem confirm -> 400
CODE=$(curl -s -o /dev/stderr -w '%{http_code}' -b "$JAR_A" -X DELETE "$BASE_URL/api/v1/projects/$PROJ")
assert_code 400 "$CODE" "DELETE sem confirm 400"

# 14. A deleta com confirm -> 204
CODE=$(curl -s -o /dev/stderr -w '%{http_code}' -b "$JAR_A" -X DELETE "$BASE_URL/api/v1/projects/$PROJ?confirm=true")
assert_code 204 "$CODE" "DELETE com confirm 204"

echo "ALL PASS (dono 200, estranho 404, adulterado 404, sem confirm 400, com confirm 204)"
