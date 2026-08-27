# The Crucible

> A safety-first autonomous security validation agent, built on TrueForge.

The Crucible is handed a controlled, intentionally vulnerable target. It investigates, forms a
vulnerability hypothesis, writes and tests a proof-of-concept **inside TrueForge's sandbox**, and
then **stops and asks a human to authorize** the one step that touches the live target. On
approval it executes, confirms exploitability, and produces a **security finding** — the captured
flag is evidence, not the point.

Built for The Agent Harness Hackathon (WeMakeDevs × TrueFoundry × Qodo × OpenAI).

> _This README is a skeleton established at project start; sections fill in as components land.
> It must let a stranger clone, understand, and run the project._

---

## What it is
_A paragraph a stranger can understand: the job we gave the agent and why it's worth handing over._

## Why it exists
_The real problem: how an AI agent can do meaningful autonomous security work while dangerous
actions stay inside enforceable technical and human boundaries._

## Architecture
_Diagram + short walk-through. See `PRD.md` §4 and `docs/TRUEFORGE_INTEGRATION.md`._

## TrueForge integration
_How the harness is load-bearing: MCP tools, sandbox-as-tool execution, human approval, and
(optionally) subagents/sessions/Skills. Full detail in `docs/TRUEFORGE_INTEGRATION.md`._

## Security model & network boundary
The Crucible deliberately runs agent-written exploit code, so containment is the whole point.
The boundary is enforced **in code, in two independent layers** and **fails closed**:
- **Layer 1** — the sandbox's network egress is restricted to the arena subnet.
- **Layer 2** — the `connect` MCP tool's in-code allowlist, which is also the approval-gated
  chokepoint for acting on a target.

Every target is self-owned, intentionally vulnerable practice infrastructure inside our own
Docker network. The agent cannot reach anything else. Full detail: `docs/SECURITY_MODEL.md`.

## Quickstart
_Prereqs (Node, Docker), then the five steps below._

### Running the arena
```
# stand up the self-owned, intentionally vulnerable targets
docker compose -f arena/docker-compose.yml up -d

# one-command health + containment check (reachability, exploit, Layer-1 egress blocked)
bash arena/verify-arena.sh

# tear down when done
docker compose -f arena/docker-compose.yml down
```
`verify-arena.sh` proves, on the real Docker network, that web-01 is reachable and solvable and
that a container on the arena network has **no egress to the public internet** (Layer 1). See
`docs/SECURITY_MODEL.md` §6.

### Running the MCP server
The MCP server is containerized and comes up **with the arena** (the `mcp` service in
`arena/docker-compose.yml`), served over Streamable HTTP at `http://127.0.0.1:8848/mcp`
(loopback-only; health at `/health`). To run or test it directly:
```
cd mcp-server
npm install
npm run typecheck     # tsc strict + noUncheckedIndexedAccess
npm test              # 40 tests: fail-closed policy + in-process MCP + HTTP transport + tools
npm run start:http    # serve over Streamable HTTP (or `npm start` for stdio)
```

### Running TrueForge + wiring the agent
```
npx @truefoundry/trueforge                    # harness UI + API at http://localhost:8790

# register the connector, configure a model (BYO key), and create the agent (idempotent):
TF_MODEL_API_KEY=<your key> MODEL_PROVIDER=google-gemini \
  MODEL_ID=gemini-3.5-flash-lite MODEL_NAME=gemini-3-5-flash-lite \
  node scripts/trueforge-setup.mjs
```
`gemini-3.5-flash-lite` runs on Gemini's **free** tier. The script sets
`require_approval_for_tools: ["connect", "http_request"]` (the "License to Hack" gate). Full guide:
`docs/TRUEFORGE_SETUP.md`; OpenAI-compatible providers (e.g. Groq) via `MODEL_BASE_URL`.

### Running a Security Case
Open the chat UI at `http://localhost:8790`, pick `crucible-agent`, and give it:
> *"Investigate web-01 and determine whether authentication can be bypassed. Investigate freely,
> but ask me before you execute anything against the live target."*

Expected arc: recon (`list_challenges`/`get_challenge`) → hypothesis → **approval pause on
`http_request`** → authorize → exploit → `submit_flag` → security finding. Beat-by-beat demo
script: `docs/DEMO_SHOTLIST.md`.

## Testing
```
# MCP server: fail-closed network policy, in-process MCP, HTTP transport, tools (40 tests)
cd mcp-server && npm run typecheck && npm test

# Arena + Layer-1 containment + the http_request tool path (9 checks) — needs Docker
bash arena/verify-arena.sh
```
The security boundary is not "done" until the fail-closed matrix in `docs/SECURITY_MODEL.md` §6
passes and both layers are proven. Current status: **40/40 unit/integration tests, 9/9 arena
checks.**

## Qodo Code Review Evidence
Every substantive change in this repo goes through a GitHub pull request reviewed by Qodo before
merge; direct pushes to `main` are not used. Each PR shows an initial Qodo review, our fixes or
recorded dismissals, and a follow-up review of the final code. Setup + per-PR workflow:
`docs/QODO_SETUP.md`.

**Representative reviewed PRs**
- [PR #1 — Foundation](https://github.com/Rigur-Calypso/Crucible/pull/1) (merged): arena, MCP
  server, two-layer security boundary.
- [PR #2 — Address Qodo review](https://github.com/Rigur-Calypso/Crucible/pull/2) (merged):
  correctness + robustness fixes.
- [PR #3 — TrueForge integration](https://github.com/Rigur-Calypso/Crucible/pull/3) (merged): HTTP
  MCP transport, containerized MCP on the arena network, agent + approval wiring.

**What Qodo surfaced and what we did (examples)**
- *Security (PR #3, High/Med).* Qodo flagged that the new Streamable-HTTP MCP endpoint was
  published on all host interfaces, unauthenticated, with unbounded request bodies. We bound it to
  **loopback only**, added **bearer-token auth** (sent via the connector's header auth), enabled
  **DNS-rebinding Host validation**, and **capped body size (413)**. Its re-review went from
  5 bugs + 5 rule-violations to **0 bugs**.
- *Correctness (PR #1, High).* Qodo caught that `connect` reported success without opening a
  socket. We made it perform **real TCP I/O to the pinned resolved IP** (anti-rebinding) and
  report the true outcome — with tests for the reachable / unreachable / blocked paths.
- *Access control (PR #2, Med).* Qodo noted `fetch_file` read any syntactically-valid challenge
  directory without an ownership check. We now **authorize the challenge against the registry**
  before any path is resolved.
- *Dismissed with recorded reason (PR #2).* Qodo suggested an in-code approval gate inside the
  `connect` tool. We **declined in-thread**: an MCP tool cannot hold trustworthy approval state
  (the agent controls its inputs), so approval is enforced by TrueForge's harness-level gate,
  outside the agent's control — while the network allowlist stays enforced in code.

**Review trail**
The PR history shows the full loop on each change — Qodo's initial review, our per-finding
response (fix or justified dismissal in the thread), and a follow-up review against the pushed
code. Every valid High was fixed; remaining items are Medium rule-violations that are either
resolved or documented as needing the live TrueForge harness (e.g. end-to-end approval-denial),
recorded in `PROJECT_WORKLOG.md`.

## AI-assisted development disclosure
This project was built with AI coding assistance (Claude Code / Claude). AI tools were used for
implementation, documentation, and review support. All submitted code is understood by the team
and can be explained during judging. Design and code were produced during the hackathon window.

## Limitations
_Known gaps and honest caveats — e.g. optional challenges not built, local-mode-only TrueForge,
any `[verify in impl]` items still open._
