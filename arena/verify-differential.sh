#!/usr/bin/env bash
#
# verify-differential.sh — proves The Crucible VALIDATES exploitability, it does not pattern-match a
# known flag. It fires the *identical* SQL-injection payload (`username=admin'--`) at two twins:
#
#   web-01          (vulnerable, string-built SQL)   -> EXPECT: flag returned      (exploitable)
#   web-01-patched  (fixed, parameterized query)     -> EXPECT: HTTP 401, no flag  (NOT exploitable)
#
# Same payload, opposite outcome, one line of code different between the targets. A tool that only
# recognised a flag string could never produce the correct NEGATIVE result on web-01-patched.
#
# Two levels of proof:
#   [1]-[3] TARGET level — issued arena-LOCALLY (docker exec into the arena's own web-01 image, on the
#           internal network; no external image is pulled and no traffic leaves the arena).
#   [4]     CRUCIBLE PATH — the same divergence through the production `http_request` MCP tool
#           (policy-enforced). The HUMAN approval gate is a TrueForge-side control upstream of the MCP
#           endpoint (docs/SECURITY_MODEL.md); this pre-flight verifier exercises the tool + policy
#           path only and does not claim to exercise the human gate.
#
# Usage:  bash arena/verify-differential.sh        (from the repo root)
# Requires: Docker daemon running (and, for [4], node + mcp-server deps + the MCP endpoint up).

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE="$HERE/docker-compose.yml"
EXPECTED_FLAG="crucible{sqli_auth_bypass_web01}"
PAYLOAD_USER="admin'--"
LEGIT_PASSWORD="s3cr3t-not-guessable-9f2a"  # non-secret arena fixture (mirrors web-01; gates nothing)

pass() { printf '  \033[32mPASS\033[0m %s\n' "$1"; }
fail() { printf '  \033[31mFAIL\033[0m %s\n' "$1"; exit 1; }

echo "== bringing up the arena (web-01 + web-01-patched) =="
docker compose -f "$COMPOSE" up -d --build --wait >/dev/null

# HTTP is issued from INSIDE the arena using the arena's own web-01 image (which ships Python) via
# `docker exec` — no external registry pull, and every request stays on the internal arena network.
# web-01 resolves its twin `web-01-patched` over Docker's service DNS on the shared arena network.
PY_HIT='
import urllib.request, urllib.parse, sys
url, user, pw = sys.argv[1], sys.argv[2], sys.argv[3]
data = urllib.parse.urlencode({"username": user, "password": pw}).encode()
try:
    r = urllib.request.urlopen(urllib.request.Request(url, data=data), timeout=5)
    print(r.status); print(r.read().decode())
except urllib.error.HTTPError as e:
    print(e.code); print(e.read().decode())
'
# hit <target-host> <username> <password> -> prints "<status>\n<body>"
hit() { docker exec crucible-web-01 python -c "$PY_HIT" "http://$1:5000/login" "$2" "$3"; }

echo "== [1] VULNERABLE target: web-01 =="
vuln_body="$(hit web-01 "$PAYLOAD_USER" x)"
echo "$vuln_body" | grep -qF "$EXPECTED_FLAG" \
  && pass "web-01: injection returned the flag (EXPLOITABLE, as expected)" \
  || fail "web-01: injection did NOT return the flag (got: $vuln_body)"

echo "== [2] PATCHED control: web-01-patched (identical payload) =="
patched_out="$(hit web-01-patched "$PAYLOAD_USER" x)"
patched_status="$(printf '%s\n' "$patched_out" | head -1)"
if printf '%s\n' "$patched_out" | grep -qF "$EXPECTED_FLAG"; then
  fail "web-01-patched leaked the flag — the patch is NOT effective (got: $patched_out)"
fi
# The parameterized query treats admin'-- as a literal (nonexistent) username -> unauthorized.
[ "$patched_status" = "401" ] \
  && pass "web-01-patched: same payload rejected with 401, no flag (NOT exploitable, as expected)" \
  || fail "web-01-patched: expected 401 for the injection, got HTTP $patched_status"

echo "== [3] controls on the patched twin =="
wrong_status="$(hit web-01-patched admin wrong | head -1)"
[ "$wrong_status" = "401" ] \
  && pass "web-01-patched: wrong credentials rejected (401)" \
  || fail "web-01-patched: wrong creds did not 401 (got HTTP $wrong_status)"

legit_out="$(hit web-01-patched admin "$LEGIT_PASSWORD")"
printf '%s\n' "$legit_out" | grep -q '"authenticated":true' \
  && ! printf '%s\n' "$legit_out" | grep -qF "$EXPECTED_FLAG" \
  && pass "web-01-patched: legitimate credentials authenticate — and there is no flag to give up" \
  || fail "web-01-patched: legitimate-auth control behaved unexpectedly (got: $legit_out)"

echo "== [4] CRUCIBLE PATH: same differential through the http_request MCP tool =="
# Prove the divergence through the production path (MCP -> policy -> HTTP), not only at target level.
CHECK="$HERE/../mcp-server/scripts/check-patched-mcp.mjs"
mcp_skipped=""
if command -v node >/dev/null 2>&1 && [ -d "$HERE/../mcp-server/node_modules/@modelcontextprotocol" ]; then
  MCP_URL="${MCP_URL:-http://127.0.0.1:8848/mcp}" node "$CHECK" \
    || fail "differential over the MCP tool path failed (see output above)"
else
  mcp_skipped=1
  printf '  \033[33mSKIP\033[0m MCP-path differential — node or mcp-server deps unavailable (run: npm --prefix mcp-server install)\n'
fi

echo
echo "== differential result =="
pass "IDENTICAL payload → web-01 EXPLOITABLE, web-01-patched NOT exploitable (target level)"
if [ -n "$mcp_skipped" ]; then
  # Do not claim the production-path proof when it did not run — say so explicitly (and fail under CI).
  printf '\033[33mTarget-level differential passed, but the CRUCIBLE-PATH (MCP) proof was SKIPPED\033[0m'
  echo " — install mcp-server deps and start the MCP endpoint to include it."
  [ -n "${CI:-}" ] && fail "MCP-path differential skipped under CI (deps required)"
else
  pass "Same divergence confirmed through the http_request MCP tool (production path)"
fi
echo "The Crucible validates exploitability; it does not assume it. (Stop: docker compose -f arena/docker-compose.yml down)"
