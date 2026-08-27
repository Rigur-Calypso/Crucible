#!/usr/bin/env bash
#
# verify-arena.sh — brings up the arena and proves, on the REAL Docker network:
#   1. web-01 is reachable by hostname on the arena network and serves /challenge.json
#   2. the deliberate SQLi auth bypass works and returns the flag (solvability / demo pre-flight)
#   3. LAYER 1 containment: a container on the arena network has NO egress to the public
#      internet (see docs/SECURITY_MODEL.md §3 — "the sandbox must not reach outside the arena")
#
# This is the network-level counterpart to the in-code Layer-2 tests
# (mcp-server/test/networkPolicy.test.ts). Run it before a demo.
#
# Usage:  bash arena/verify-arena.sh            (from the repo root)
# Requires: Docker daemon running.

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE="$HERE/docker-compose.yml"
CURL="curlimages/curl:latest"
EXPECTED_IP="10.42.0.5"
EXPECTED_FLAG="crucible{sqli_auth_bypass_web01}"

pass() { printf '  \033[32mPASS\033[0m %s\n' "$1"; }
fail() { printf '  \033[31mFAIL\033[0m %s\n' "$1"; exit 1; }

echo "== bringing up the arena =="
# --wait blocks until the web-01 healthcheck reports healthy, so we never race startup.
docker compose -f "$COMPOSE" up -d --build --wait >/dev/null
docker pull -q "$CURL" >/dev/null

# Derive the ACTUAL network name from the running container rather than assuming a project-derived
# name — robust to COMPOSE_PROJECT_NAME / -p overrides. (container_name is fixed in compose.)
NET="$(docker inspect crucible-web-01 --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{end}}')"
[ -n "$NET" ] || fail "could not determine the arena network name from crucible-web-01"

echo "== network posture =="
internal="$(docker network inspect "$NET" --format '{{.Internal}}')"
[ "$internal" = "true" ] && pass "arena network is internal (no external egress)" \
  || fail "arena network is NOT internal — Layer 1 is open"
ip="$(docker inspect crucible-web-01 --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}')"
[ "$ip" = "$EXPECTED_IP" ] && pass "web-01 has expected arena IP $EXPECTED_IP" \
  || fail "web-01 IP is $ip, expected $EXPECTED_IP (allowlist mismatch)"

run() { docker run --rm --network "$NET" "$CURL" "$@"; }

echo "== [1] reachability =="
# --wait already gates on health; retry anyway (bounded) so a slow first probe never false-fails.
reachable=""
for attempt in 1 2 3 4 5 6 7 8 9 10; do
  if run -s --max-time 5 http://web-01:5000/challenge.json | grep -q '"id":"web-01"'; then
    reachable=1; break
  fi
  sleep 1
done
[ -n "$reachable" ] && pass "web-01 serves /challenge.json by hostname" \
  || fail "web-01 not reachable on the arena network (after 10 attempts)"

echo "== [2] control + exploit =="
run -s --max-time 5 -X POST http://web-01:5000/login -d 'username=admin&password=wrong' \
  | grep -q '"ok":false' && pass "wrong creds rejected (401 path)" \
  || fail "control login did not reject wrong creds"
body="$(run -s --max-time 5 -X POST http://web-01:5000/login \
  --data-urlencode "username=admin'--" --data-urlencode 'password=x')"
echo "$body" | grep -qF "$EXPECTED_FLAG" \
  && pass "SQLi auth bypass returns the flag" \
  || fail "exploit did not return the expected flag (got: $body)"

echo "== [3] LAYER 1: egress must be blocked =="
# curl exit is non-zero (6 = DNS fail, 7 = connect fail) when egress is contained.
if run -s --max-time 6 -o /dev/null https://example.com; then
  fail "reached example.com from the arena network — Layer 1 egress is OPEN"
else
  pass "egress to example.com blocked (no DNS/route out of the arena)"
fi
if run -s --max-time 6 -o /dev/null https://8.8.8.8; then
  fail "reached 8.8.8.8 from the arena network — Layer 1 egress is OPEN"
else
  pass "egress to 8.8.8.8:443 blocked (no route out of the arena)"
fi

echo
echo "All arena checks passed. (Stop the arena with: docker compose -f arena/docker-compose.yml down)"
