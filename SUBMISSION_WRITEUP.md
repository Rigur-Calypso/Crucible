# The Crucible — Submission Write-up

**A safety-first autonomous security-validation agent, built on TrueForge.**
The Agent Harness Hackathon (WeMakeDevs × TrueFoundry × Qodo × OpenAI) · Track: Best Use of TrueForge.

---

## What it does

Hand The Crucible a controlled, intentionally-vulnerable target and it runs a full **Security
Case**: it investigates, forms a specific vulnerability hypothesis, and then **stops and asks a
human to authorize** the one step that touches the live target. On approval it executes the
validated action through a sanctioned, allowlisted tool, confirms exploitability, and emits a
structured **security finding** — the captured flag is evidence, not the point.

```
CREATED → INVESTIGATING → HYPOTHESIS FORMED → POC READY
→ 🛑 AWAITING AUTHORIZATION → AUTHORIZED → EXECUTING → VERIFIED → REPORT GENERATED
```

The flagship target, `web-01`, is a deliberately vulnerable Flask login with a classic SQL-injection
auth bypass (`admin'--`). It is deterministic, so the agent solves it reliably on camera. It lives
on a self-owned, internal-only Docker network — the agent can never reach anything we don't own.

## Why it matters

Autonomous vulnerability triage and validation is real, valuable security work (bug-bounty triage,
pre-prod validation, security education). The hard part isn't getting an LLM to *suggest* an exploit
— it's letting an agent **actually run one** while dangerous actions stay inside enforceable
technical and human boundaries. That boundary *is* the product.

## How it uses TrueForge (load-bearing — remove it and the architecture collapses)

- **MCP connector (remote, over HTTP).** The Crucible MCP server is the *only* path from the agent
  to the arena, exposing five tools — `list_challenges`, `get_challenge`, `fetch_file`,
  `submit_flag`, and the approval-gated `connect`. TrueForge registers it as a remote MCP server by
  URL; without the harness's MCP client the model has no hands.
- **Human approval — the "License to Hack" gate.** The agent is configured with
  `require_approval_for_tools: ["connect"]`, so TrueForge **pauses** before the single consequential
  action (touching the live target) and blocks until a person allows or denies. This is the real
  harness control, enforced outside the agent's reach — not a cosmetic dialog the agent can bypass.
- **Sandbox-as-tool.** TrueForge can provision a sandbox for agent-written PoC code. We keep it
  **off by default**: standalone TrueForge doesn't expose a sandbox egress allowlist, so with the
  sandbox off *all* target interaction flows through the allowlisted, approval-gated `connect`
  (an honest, safer default we document explicitly).
- **Sessions, subagents, skills, any model.** A Security Case is a TrueForge session (persisted,
  survives reconnects); subagents and skills are available for function-split delegation; the model
  is BYO (any provider). The agent loop, tool routing, and approvals are all the harness's.

## The security model (enforced in code, fails closed)

Defense in depth, both layers tested:

- **Layer 1 — arena network egress.** The arena is an `internal: true` Docker network with **no
  egress**. `arena/verify-arena.sh` proves it on the real network (7/7): a container on the arena
  net reaches `web-01` by hostname but **cannot** reach `example.com` or `8.8.8.8`.
- **Layer 2 — the `connect` in-code allowlist.** `connect` resolves the destination, validates
  **every** resolved address against the arena subnet, **pins** the IP (anti-DNS-rebinding), and
  opens a real socket only to an approved arena target — rejecting public IPs, loopback, private/
  link-local ranges, IPv6, malformed inputs, and alternate encodings. Fail-closed, with a 13-case
  matrix plus in-process MCP integration tests (**31 tests total**).

The MCP endpoint itself is hardened: **loopback-only** publish, **bearer-token auth** (via the
connector's header auth), **DNS-rebinding Host validation**, and **bounded request bodies**.
`fetch_file` enforces ownership + path-traversal + symlink-escape checks and serves only agent-facing
artifacts (never the target's source/flag). `submit_flag` validates server-side with a constant-time
compare. Full detail: `docs/SECURITY_MODEL.md`.

## Engineering quality & the Qodo trail

Every substantive change went through a Qodo-reviewed PR; direct pushes to `main` are not used.
Across PRs #1–#3, Qodo surfaced real issues we fixed — a `connect` that reported success without
opening a socket, a `fetch_file` missing an ownership check, and a newly-exposed HTTP endpoint that
was unauthenticated on all interfaces — plus one finding we **dismissed with a recorded reason** (an
in-code approval gate can't be trustworthy inside an agent-controlled MCP tool; approval belongs at
the harness). See `README.md` → *Qodo Code Review Evidence* and `PROJECT_WORKLOG.md`.

## Stack

TypeScript/Node MCP server (official `@modelcontextprotocol/sdk` v1.30, Streamable HTTP + stdio),
zod-validated tools; a Docker-Compose arena (`web-01` Flask target on an internal network + the
containerized MCP server on the arena + edge networks); TrueForge v0.1.4 standalone as the harness.

## Reproduce

```
export CRUCIBLE_MCP_TOKEN=$(openssl rand -hex 32)
docker compose -f arena/docker-compose.yml up -d --build --wait   # arena + MCP
bash arena/verify-arena.sh                                         # 7/7 safety checks
npx @truefoundry/trueforge                                         # the harness
TF_MODEL_API_KEY=<your key> MODEL_PROVIDER=google-gemini \
  MODEL_ID=gemini-3.6-flash MODEL_NAME=gemini-3-6-flash \
  node scripts/trueforge-setup.mjs                                 # connector + model + agent
```
Then open the TrueForge chat UI, pick `crucible-agent`, and give it a case. Full guide:
`docs/TRUEFORGE_SETUP.md`.

## AI-assisted development

Built with AI coding assistance (Claude Code). All submitted code is understood by the team and can
be explained during judging; design and code were produced during the hackathon window.
