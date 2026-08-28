# Evidence outputs — SARIF finding + gated-action audit log

The Crucible's product is a **security finding**, and its safety story is **what the boundary did**.
Two evidence outputs make both inspectable by a judge or a pipeline, in standard/greppable formats.
Neither adds an MCP tool — the tool surface is still exactly six.

## 1. SARIF 2.1.0 finding

`submit_flag` confirms a capture server-side; the finding is then serialized to **SARIF 2.1.0** —
the OASIS-standard Static Analysis Results Interchange Format, and the format **GitHub code scanning**
ingests. That makes the "real security tooling, not a CTF game" claim concrete: the output drops
straight into the same pipelines a human static-analysis tool feeds.

```bash
# Emit the reference web-01 finding as SARIF (deterministic, offline — does not touch the arena):
npm --prefix mcp-server run emit:finding -- > web-01.sarif.json

# Or serialize a finding you provide (same shape as CrucibleFinding):
npm --prefix mcp-server run emit:finding -- my-finding.json
```

The emitter is a pure serializer ([`src/finding/sarif.ts`](../mcp-server/src/finding/sarif.ts)); it
does **not** decide whether a vulnerability exists — it serializes a finding the agent already
validated end-to-end. Output includes the rule (CWE-tagged, `security-severity` for GitHub
bucketing), the result (`level: error` for high severity), the target location, and the captured
evidence. Covered by [`test/sarif.test.ts`](../mcp-server/test/sarif.test.ts).

## 2. Gated-action audit log

An append-only **JSON Lines** record of every invocation of the two approval-gated tools
(`connect`, `http_request`) that reaches the MCP server, with the Layer-2 policy decision and the
outcome. Enable it by pointing an env var at a file:

```bash
CRUCIBLE_AUDIT_LOG=/path/to/audit.jsonl   # set on the MCP server process (e.g. in the mcp container)
```

Each line:

```json
{"ts":"2026-08-28T05:21:47.962Z","tool":"http_request","host":"web-01","port":5000,"method":"POST","path":"/login","decision":"allowed","outcome":"executed","target":"10.42.0.5:5000","reason":"HTTP 200"}
{"ts":"2026-08-28T05:21:47.963Z","tool":"connect","host":"8.8.8.8","port":443,"decision":"blocked","outcome":"blocked","reason":"outside arena"}
```

### What it does and does NOT claim (honest scope)

The human **approve / deny** click happens in **TrueForge**, upstream of the MCP server — the server
never sees it, and this log does **not** claim to record it. What it faithfully witnesses is what
actually reached the enforcement layer: which gated tool ran, against what destination, whether the
in-code allowlist **allowed or blocked** it (and why), and whether the action then **executed,
blocked, or failed**. That is the record of *what the boundary did* — real, inspectable control
evidence — without overstating what this component can observe. The two-line example above is exactly
the control story: an authorized arena exploit executed; a non-arena destination was blocked
fail-closed. Read-only tools are intentionally not logged. Covered by
[`test/audit.test.ts`](../mcp-server/test/audit.test.ts).
