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

## Run it

```bash
bash arena/verify-differential.sh
```

Expected: the identical injection is **EXPLOITABLE** on `web-01` and **NOT exploitable** on
`web-01-patched` (`401`, no flag), plus controls confirming wrong creds are rejected and legitimate
credentials still authenticate on the patched twin. This is the deterministic, on-camera companion to
a full agent run, and the safest way to show the "reports NOT exploitable" beat in a demo.
