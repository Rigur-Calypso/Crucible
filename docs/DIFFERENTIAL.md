# Differential validation — proving The Crucible validates, not pattern-matches

A recurring, fair question about any "AI that captures flags": *is it actually validating a
vulnerability, or has it just learned to recognise a flag string?* The Crucible answers this with a
**patched control twin** and a deterministic differential proof.

## The two twins

| Target | Query | Same payload `username=admin'--` | Flag |
|---|---|---|---|
| `web-01` (`10.42.0.5:5000`) | string-interpolated SQL (vulnerable) | **bypasses auth** → `200` | returns `crucible{sqli_auth_bypass_web01}` |
| `web-01-patched` (`10.42.0.6:5000`) | parameterized query (fixed) | treated as a literal username → **`401`** | none — nothing to give up |

The two apps are byte-for-byte identical except for one line — the login query. So the differential
isolates *the vulnerability itself*, nothing else. See
[`arena/web-01/app.py`](../arena/web-01/app.py) vs
[`arena/web-01-patched/app.py`](../arena/web-01-patched/app.py).

## Why this is the load-bearing evidence

A tool that only recognised the flag string could never produce the **correct negative** on
`web-01-patched`. That negative is precisely what proves the positive on `web-01` was *earned* — the
agent confirmed exploitability by observing the target's behaviour, not by assuming it. Reporting a
target as **NOT exploitable** is exactly what separates a security *validator* from a CTF flag-hunter.

## No new attack surface, no policy change

`web-01-patched` sits on the same arena subnet and port as `web-01`
(`10.42.0.6 ∈ 10.42.0.0/24`, port `5000`). It is therefore reachable through the **same** allowlisted,
approval-gated MCP path (`connect` / `http_request`) with **zero** change to
[`networkPolicy.ts`](../mcp-server/src/policy/networkPolicy.ts) — the Layer-2 boundary already covers
it. The patched twin is just another self-owned arena target.

## Two levels of proof

`verify-differential.sh` proves the divergence at two levels, so the "validates, not pattern-matches"
claim is backed by the real Crucible path — not only a direct request:

1. **Target level `[1]–[3]`** — the identical payload is issued **arena-locally**: from *inside* the
   arena, using the arena's own `web-01` image (which ships Python) via `docker exec`, over the
   internal network. No external image is pulled and no traffic leaves the arena. This deterministically
   shows the two *targets* behave differently.
2. **Crucible path `[4]`** — the same divergence is confirmed through the **production `http_request`
   MCP tool** (MCP → policy → HTTP), via
   [`check-patched-mcp.mjs`](../mcp-server/scripts/check-patched-mcp.mjs): the flag is returned for
   `web-01` and **not** for `web-01-patched`, through the exact policy-enforced tool the agent uses.
   This is what makes it a statement about *The Crucible*, not just the targets.

**On the human approval gate:** it is a **TrueForge-side** control, upstream of the MCP endpoint (see
[SECURITY_MODEL.md](SECURITY_MODEL.md)). This verifier is *pre-flight infrastructure validation* — it
exercises the tool + policy path and does **not** claim to exercise the human gate. (Same posture as
[`verify-arena.sh`](../arena/verify-arena.sh) §4.)

## Run it

```bash
bash arena/verify-differential.sh
```

Expected: the identical injection is **EXPLOITABLE** on `web-01` and **NOT exploitable** on
`web-01-patched` (`401`, no flag) — at the target level and again through the `http_request` MCP tool
— plus controls confirming wrong creds are rejected and legitimate credentials still authenticate on
the patched twin. Section `[4]` SKIPs (and fails under CI) if node / mcp-server deps or the MCP
endpoint are unavailable, rather than claiming a proof it did not run. This is the deterministic,
on-camera companion to a full agent run, and the safest way to show the "reports NOT exploitable" beat.
