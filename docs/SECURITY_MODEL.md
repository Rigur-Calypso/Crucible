# Security Model — The Crucible

The Crucible deliberately lets an LLM write and run exploit code. That is only acceptable because
the code is contained and the one consequential action is gated. This is a P0 artifact: a reviewer
should find and understand the boundary in under a minute.

## 0. The formal invariant (what the code must guarantee)
> **No connection may be established from the agent's environment to any destination that does not
> resolve to a canonical IPv4 address inside an approved arena CIDR, on an approved port. Every
> other destination is denied. The check fails closed.**

This is enforced in code — not by the prompt — at two layers (§3), and is covered by the
fail-closed tests in `../mcp-server/test/networkPolicy.test.ts` against
`../mcp-server/src/policy/networkPolicy.ts`. The policy suite passes today (13/13); with the
in-process MCP integration tests (`../mcp-server/test/server.test.ts`) the full suite is 19/19.

## 1. Threat model
- The **model's intentions are not trusted.** Controls hold even if the agent tries to misbehave;
  no control relies on the system prompt or model good behavior.
- **Challenge artifacts are data, not instructions.** A stego image or description may contain
  text aimed at the agent; it is never authorization.
- The **arena is the only sanctioned destination.** Everything else is denied.
- **Non-goals:** not hardening against a hostile operator (local TrueForge mode stays on
  localhost); not defending real infrastructure (all targets are self-owned, intentionally vuln).

## 2. Why one allowlist is not enough
TrueForge provisions the **sandbox as a tool** and runs agent-written code inside it with network
capability. If the allowlist lived only in `connect`, agent code doing `requests.get("http://…")`
from the sandbox would bypass it. So the `connect` allowlist alone does not contain the agent —
the network itself must say no.

## 3. Defense in depth — two independent layers
- **Layer 1 — Sandbox network egress (the real containment).** The sandbox may reach the arena
  subnet and nothing else; default-deny / fail-closed at the Docker/network layer, independent of
  what code the agent writes.
- **Layer 2 — `connect` in-code allowlist (the gated chokepoint).** `connect` independently
  rejects non-arena destinations in code and is the single **approval-gated** action for touching
  a live target — where the human gate attaches.
A bug in one layer does not open the other. Both are tested (§6).

### 3a. Egress architecture (resolved 2026-08-27 — D4a)
The MCP server is served over HTTP and runs as a **container on two networks**: `arena` (internal,
no egress) to reach targets, and `edge` (host-reachable) so TrueForge can reach its endpoint. All
target interaction goes through **`connect`**, whose in-code allowlist (Layer 2) is the audited,
approval-gated chokepoint. The MCP server is trusted enforcement code, so its host-reachability is
fine; its endpoint is defended (loopback-only publish + bearer-token auth + DNS-rebinding Host
allowlist + bounded bodies).

**Layer 1 (agent sandbox egress) — known limitation.** TrueForge standalone (Daytona / local
fallback) exposes **no sandbox egress allowlist**, so enabling the agent sandbox does not, by
itself, confine agent-written code to the arena — such code could reach the internet directly,
bypassing `connect`. We therefore **default the agent sandbox OFF** (`CRUCIBLE_ENABLE_SANDBOX`
must be `true` to enable it); with it off, *all* target interaction flows through the allowlisted,
approval-gated `connect`, and Layer 2 fully contains the agent. Enable the sandbox only against the
self-owned arena, and only once its egress can be constrained (e.g. a Daytona network policy or an
egress-firewalled sandbox image) — tracked in `TRUEFORGE_INTEGRATION.md` §10. Whichever path,
**the sandbox must not reach outside the arena.**

## 4. Network policy (implemented in networkPolicy.ts)
**Allow:** arena IP; arena hostname resolving *inside* the arena; approved port(s) only.
**Reject (fail closed):** public IP/hostname; `localhost`/`127.0.0.1`/loopback (`::1`); private
IPs outside the arena (`10/8`,`172.16/12`,`192.168/16`), link-local `169.254/16`, unique-local
`fc00::/7`; IPv6 outside the approved network; malformed addresses; alternate encodings (octal
`0177…`, hex `0x7f…`, 32-bit integer); destinations from unsafe/rebinding DNS; ports outside the
arena set.
**Resolve, then validate** on the resolved address (a hostname can't smuggle a public IP past the
check), validate **all** resolved addresses, and **pin** the resolved IP so the caller connects to
it rather than re-resolving (anti-rebinding).

## 5. Filesystem policy (`fetch_file`)
Serves only files belonging to the named challenge. Rejects path traversal (`../`, absolute paths,
encoded separators, symlink escapes) and never performs an arbitrary read. Ownership checked before
any path is touched. Implemented in `../mcp-server/src/tools/fetchFile.ts`: containment check
(no I/O) + a **symlink-escape guard** (real path must stay inside the challenge dir) before the
read; served only from a dedicated agent-facing artifact root, never the arena container source
(so the target's solution/flag is not reachable via this tool). Fails closed.

## 6. Fail-closed test matrix (boundary not "done" until these pass)
Implemented cases in `networkPolicy.test.ts` (✓ = passing today):
**Allowed:** ✓ arena IP + port · ✓ arena hostname resolving in-arena (IP pinned).
**Rejected — network:** ✓ public IP · ✓ localhost/loopback · ✓ private outside arena · ✓
link-local · ✓ IPv6 · ✓ malformed · ✓ alternate encodings · ✓ disallowed port · ✓ hostname
resolving out-of-arena · ✓ split-result (any address out) · ✓ unresolvable (fail closed) · ✓
resolver error (fail closed).
**Layer 1 — proven on the real network.** `../arena/verify-arena.sh` brings up the arena and
asserts, against the running Docker network, that the arena network is `internal` and that a
container attached to it **cannot reach the public internet** (`example.com` fails DNS,
`8.8.8.8:443` fails to connect) while web-01 is still reachable by hostname and the exploit
returns the flag. This is the network-level containment counterpart to the in-code Layer-2 tests.
All 7 checks pass today. The remaining `[verify in impl]` is confirming the **TrueForge sandbox**
attaches to (only) this same internal network so it inherits the containment.

**`fetch_file` — covered.** `server.test.ts` asserts traversal rejection (with `isError`),
missing-file failure (`isError`), and a successful real read of a challenge artifact; the code
also enforces a symlink-escape guard. The exhaustive traversal matrix (encoded separators,
absolute paths) against `fetchFile.ts` directly is still worth expanding.
**Still to add (impl):** DNS-rebinding time-of-check/use at the `connect` socket; the exhaustive
`fetch_file` traversal matrix; and unauthorized-challenge-access tests.

## 7. Secrets
No keys/tokens/passwords/credentials/`.env`/personal data in the repo, ever. `.env.example` +
`.gitignore`; secret-check before every commit; keys out of the demo video.

## 8. Review focus for Qodo (security PRs)
Network isolation, DNS handling / SSRF-style bypasses, IP/port validation, fail-closed behavior,
path traversal, error handling that could leak or open a gap, and any control that depends on the
prompt instead of code. A too-permissive `connect` allowlist or an un-contained sandbox is a **P0**.
