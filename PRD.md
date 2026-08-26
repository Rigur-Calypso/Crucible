# PRD: The Crucible
### A safety-first autonomous security validation agent, built on TrueForge, for The Agent Harness Hackathon

**Hackathon:** The Agent Harness Hackathon (WeMakeDevs × TrueFoundry × Qodo × OpenAI)
**Window:** Aug 24–30, 2026 · Submissions close **Sun Aug 30, 8:00 PM London**
**Primary track (where we differentiate):** Best Use of TrueForge
**Mandatory baseline (all submissions):** Qodo-reviewed PR trail + README evidence
**Bonus (auto-considered):** Best UI

> This document supersedes the original CTF-solver PRD. It keeps the useful arena/MCP
> material and re-frames the product around autonomous security *validation* with an
> enforceable safety boundary. Where a claim about TrueForge/Qodo/rules is load-bearing,
> it was verified against the live sources on 2026-08-25 (see §14).

---

## 1. One-line pitch

The Crucible is a safety-first autonomous security validation agent: hand it a controlled,
intentionally vulnerable target and it investigates, forms a vulnerability hypothesis, writes
and tests a proof-of-concept inside TrueForge's sandbox, **stops for explicit human
authorization before any action that touches the live target**, then executes the authorized
action, confirms exploitability, and produces a security finding. The captured flag is
evidence, not the point.

## 2. What we are building (and what we are deliberately not)

We are **not** building a generic CTF platform. The CTF arena is the *controlled evaluation
environment* — a safe, self-owned set of targets that lets us demonstrate real autonomous
security work without ever touching anything we don't own.

The product story is a pipeline:

```
Security task → Investigation → Evidence → Vulnerability hypothesis → PoC generation
→ Sandbox execution → Human authorization → Controlled target interaction
→ Exploitability confirmation → Security finding
```

The user-facing object is a **Security Case** (§7): one autonomous investigation with a
visible lifecycle.

## 3. Why this wins, mapped to the actual judging

The six criteria are weighted equally and the demo is judged as hard as the code. The concept
makes five of the six fall out naturally, and the sixth (code quality) is handled by process:

| Criterion | How The Crucible answers it |
|---|---|
| Potential impact | Autonomous vulnerability triage/validation is real, valuable security work (bug-bounty triage, pre-prod validation, security education) — not a toy. |
| Creativity / originality | A security-validation agent is a distinctive, high-signal domain vs. the assistant/analytics/research ideas everyone else will pick. |
| Technical excellence | Custom MCP server, sandbox-as-tool execution, defense-in-depth network containment, server-side flag validation, optional subagents. |
| Use of sponsor tools | TrueForge's sandbox, human-approval gate, MCP, and (optionally) subagents/sessions/Skills are all load-bearing — remove TrueForge and the safety model collapses. Qodo reviews every PR. |
| Control & safety | The entire premise is safety-critical (an LLM writes and runs exploit code). The approval gate and the code-enforced network boundary are real, testable controls, not disclaimers. |
| Presentation | The approval pause + a live controlled exploit + a network-boundary *rejection* are inherently dramatic and on-theme with the hackathon's "License to act" framing. |

### Track strategy (important, verified)
A team can win **at most one** judged track; every submission is auto-considered for all
three, and there is nothing to pre-select. Qodo review is **required of every submission**,
not just the code-quality track. Therefore: treat Qodo as a qualification gate we must clear,
and pour differentiation into **Best Use of TrueForge** (the largest, most on-theme prize).
Best UI comes along for free via the Security Case view.

## 4. Architecture

TrueForge's real model matters here: **the harness does not run the agent inside a sandbox.**
It treats the sandbox as a *tool* that is provisioned on demand only when the agent needs to
run code. That single fact drives our security model (§5, §6).

```
                          TRUEFORGE  (npx @truefoundry/trueforge, local/SQLite)
┌───────────────────────────────────────────────────────────────────────┐
│  Chat UI / UI SDK        Model (BYO key)        Human-approval gate     │
│                                                                         │
│  Agent loop (runs on the server, NOT inside the sandbox)                │
│     │                                                                   │
│     ├── reads/recon  ─────────────────────────────  (no approval)       │
│     ├── writes PoC                                                      │
│     ├── SANDBOX (provisioned on demand) ── runs/tests PoC locally       │
│     │        egress firewalled to arena subnet, fail-closed  ◄── layer 1│
│     └── SECURITY-SENSITIVE ACTION ── 🛑 human approval ── then execute   │
└───────────────────────────────────┬─────────────────────────────────────┘
                                     │ MCP (our custom server)
                          ┌──────────┴───────────┐
                          │   Crucible MCP Server │
                          │  list_challenges      │
                          │  get_challenge        │
                          │  fetch_file           │
                          │  submit_flag          │
                          │  connect  ◄── layer 2: in-code allowlist        │
                          └──────────┬───────────┘
                                     │  (Docker network, isolated)
        ┌────────────────────────────┴───────────────────────────────┐
        │  The Arena (docker-compose, self-owned, intentionally vuln) │
        │  web-01 (flagship)   crypto-01   forensics-01   pwn-01 (opt)│
        └─────────────────────────────────────────────────────────────┘
```

## 5. The security model is the product (P0)

Because agent-written code runs in a sandbox that can reach the network, an allowlist that
lives *only* in the `connect` MCP tool has a hole: agent code doing a plain HTTP request from
inside the sandbox bypasses `connect` entirely. Our boundary is therefore **defense in
depth**, and both layers are tested:

- **Layer 1 — Sandbox network egress (Docker/network layer).** The sandbox can reach the
  arena subnet and nothing else. Egress is default-deny / fail-closed. This contains *any*
  code the agent writes, not just code that politely uses our tool.
- **Layer 2 — `connect` MCP tool in-code allowlist.** `connect` independently rejects any
  destination outside the arena subnet, in code, and is the single approval-gated chokepoint
  for "acting against the target." It is not a prompt instruction; it is enforcement.

Full detail, threat model, and the resolution of the "raw-socket-proxy vs. sandbox-direct"
question live in `docs/SECURITY_MODEL.md`. The boundary **fails closed**: unknown, malformed,
or unresolved destinations are rejected.

## 6. Component requirements

### 6.1 The Arena (`/arena`)
Docker Compose stack of intentionally vulnerable, self-owned services.

| Container | Category | Build | Priority |
|---|---|---|---|
| `web-01` | Web exploitation | Small custom Flask app with a deliberate, *unambiguous* SQLi/auth-bypass bug | **Flagship** |
| `crypto-01` | Cryptography | Weak/repeated-key XOR or a broken JWT signing key; serves a static artifact | Secondary |
| `forensics-01` | Forensics | Stego image (`steghide`) or a corrupted zip with metadata clues | Secondary |
| `pwn-01` | Binary exploitation | C binary, `-fno-stack-protector -no-pie`, classic stack overflow | Optional (cut first) |

Requirements:
- Each container exposes a `/challenge.json` (id, title, description, category, points,
  connection info).
- Reachable **only** on the internal Docker network; no host port binding beyond what the
  MCP server needs.
- Flags follow `crucible{...}` and are **validated server-side**, never string-matched by the
  agent.
- `web-01`'s vulnerability must be deterministic and reliably solvable, because it is the
  demo. Verify the agent's success path repeatedly before the demo (see §11 reliability rule).

### 6.2 Crucible MCP Server (`/mcp-server`)
TypeScript/Node, official MCP TypeScript SDK.

| Tool | Input | Output | Notes |
|---|---|---|---|
| `list_challenges` | — | `[{id, title, category, points}]` | Lightweight metadata only — keeps context lean. |
| `get_challenge` | `challenge_id` | full description, connection info, hints | |
| `fetch_file` | `challenge_id`, `filename` | file bytes (base64) or sandbox-readable path | Validate ownership + reject path traversal. Never an arbitrary filesystem read. |
| `submit_flag` | `challenge_id`, `flag` | `{correct, points_awarded}` | Server-side validation. |
| `connect` | `host`, `port` | connection handle / socket proxy | **Strongest boundary.** In-code allowlist to arena subnet; approval-gated. |

Every tool: explicit schema, input validation, predictable errors, tests, docs.

### 6.3 TrueForge agent configuration
- **Model:** any BYO provider (OpenAI/Anthropic/Gemini/DeepSeek/OpenAI-compatible), switchable
  in the UI.
- **Connectors:** the Crucible MCP server.
- **System prompt:** establishes the job (investigate → hypothesize → generate PoC → test in
  sandbox → request authorization → execute → verify → report), the categories it may meet,
  and a requirement to call `list_challenges`/`get_challenge` before anything else.
- **Approval config:** free to run without approval — `list_challenges`, `get_challenge`,
  `fetch_file`, and purely-local sandbox analysis. Requires human approval — any `connect`
  call and any sandbox execution that sends a payload to a live challenge service. Verify the
  exact per-agent approval control against `trueforge.dev/create-agent` during implementation.
- **Subagents (P1, optional):** a coordinator dispatching Recon / Analysis / Evidence roles
  with *distinct* responsibilities — not N copies solving the same thing. Only if it stays
  reliable.

### 6.4 The approval gate — "License to Hack"
The standout control-and-safety feature and the demo centerpiece. The UI must visibly show,
before the sensitive step, something like *"Case #0042 · web-01 · PoC validated in sandbox ·
awaiting authorization to execute against the controlled target · [AUTHORIZE] [DENY]."* This
must be TrueForge's real approval mechanism, not a cosmetic UI element the agent can bypass.
It must fire visibly at least once in the demo.

### 6.5 Security Case view / UI (bonus track)
Prefer reskinning TrueForge's UI SDK (`@truefoundry/trueforge-ui`) over a bespoke dashboard.
Surface the Security Case lifecycle (§7): what the agent found, what it wants to do, why
approval is needed, what happened after, and the evidence of success.

## 7. The Security Case

One autonomous investigation. Lifecycle:

```
CREATED → INVESTIGATING → ANALYZING → HYPOTHESIS FORMED → POC READY
→ AWAITING AUTHORIZATION → AUTHORIZED → EXECUTING → VERIFIED → REPORT GENERATED
```

## 8. Final output — a security finding, not "FLAG FOUND"

```
SECURITY FINDING
Finding:        Authentication bypass
Severity:       HIGH
Evidence:       endpoint identified · hypothesis formed · PoC generated
                · PoC tested in sandbox · human authorization obtained
                · controlled exploit succeeded · protected resource accessed
Exploitability: CONFIRMED
Target:         Crucible Arena / web-01
Execution:      TrueForge Sandbox
Authorization:  Human Approved
Challenge:      FLAG CAPTURED — crucible{...}
```

Schema may evolve; the *shape* (validation software, not game bot) must not.

## 9. TrueForge usage (load-bearing)

Full detail in `docs/TRUEFORGE_INTEGRATION.md`. Priorities:

- **P0 — MCP** (real tools), **Sandbox-as-tool** (agent-written PoC actually runs there),
  **Human approval** (real pause before the sensitive action).
- **P1 — Subagents** (meaningful delegation), **Sessions/reconnect** (an investigation
  survives a refresh/restart — cheap to demo, strong signal).
- **P2 — Skills** (a reusable "security investigation" instruction pack) if the live API
  supports it cleanly.

Do not add a capability just to claim it. A judge should be able to remove TrueForge and see
the architecture stop working.

## 10. Build plan (from today, Tue Aug 25)

| Day | Date | Focus |
|---|---|---|
| 1 | Tue Aug 25 | TrueForge running locally + model connected; repo + **Qodo installed day one**; documentation foundation (this PRD, decisions, worklog, security & TrueForge docs, README skeleton, demo plan); arena skeleton (compose + 1 stub); MCP skeleton (5 tools stubbed). → **PR #1**. |
| 2 | Wed Aug 26 | Build `web-01` fully (flagship). Wire MCP into TrueForge. First end-to-end recon→hypothesis on web-01. Layer-1 sandbox egress lockdown. |
| 3 | Thu Aug 27 | `connect` in-code allowlist + approval gate, both tested (Layer 2). First full autonomous flagged capture on web-01 with the approval pause. Refine system prompt. |
| 4 | Fri Aug 28 | Security Case view (UI SDK reskin). Secondary `crypto-01`/`forensics-01` if stable. Subagents only if web-01 E2E is already reliable. |
| 5 | Sat Aug 29 | Buffer. Repeated full run-throughs for demo reliability. (Optional SF in-person day.) Draft blog/social. |
| 6 | Sun Aug 30 | Record ~3-min demo, finalize README + Qodo Evidence, write submission blurb, **submit before 8:00 PM London**. |

### PR sequence (tells the review story — see `PROJECT_DECISIONS.md` D11)
Foundation → web-01 built → MCP wired to SDK → **network boundary hardened (Qodo focus)** →
agent workflow + approval → end-to-end Security Case → (opt) subagents → Security Case UI →
(opt) secondary challenges → final hardening. One coherent milestone per PR; combine/split on
real boundaries.

### Assignment framing (see `agent/system-prompt.md`, `PROJECT_DECISIONS.md` D15)
Cases are posed as an investigation, not a command: *"Investigate web-01; determine whether auth
can be bypassed; ask me before executing against the target."* This maximizes the
autonomy → approval → action arc the judging rewards. Companion docs: `docs/CHALLENGE_WEB01.md`
(flagship design), `docs/UI_STATES.md` (Security Case view), `SUBMISSION_CHECKLIST.md` (rule map).

## 11. Reliability rule (non-negotiable)

One excellent end-to-end workflow beats many half-working features. If time is short, **cut in
this order**: (1) `pwn-01`, (2) extra challenges, (3) advanced UI, (4) subagent complexity,
(5) optional persistence. **Never cut**: the security boundary, tests, the approval gate, the
primary web-01 workflow, the Qodo process, the README, or demo reliability.

## 12. Testing requirements

- **Unit:** MCP schema/validation, challenge lookup, `fetch_file` filename/path validation,
  server-side flag validation, network-policy logic.
- **Security (fail-closed):** reject public IP, public hostname, localhost/127.0.0.1/loopback,
  private IP outside arena, IPv6 outside approved network, malformed address, alternate IP
  encodings, unsafe/rebinding DNS resolution; reject path traversal and unauthorized challenge
  access. **Prove both boundary layers** (sandbox egress + `connect`).
- **Integration:** arena startup, MCP startup, challenge retrieval, file retrieval, flag
  submission, a controlled `connect`.
- **End-to-end:** at least one complete Security Case, TrueForge → agent → MCP → sandbox →
  approval → arena → action → verification → flag → finding.

## 13. Git, Qodo, secrets, compliance

- **Never push to `main`.** `feature/<component>-<desc>` branches; one coherent milestone per
  PR; Qodo reviews each; fix every valid **High** finding or dismiss it in-thread with a
  recorded reason; merge only after review is complete.
- **README** must contain a `## Qodo Code Review Evidence` section linking ≥1 representative
  merged PR with a sentence on what Qodo caught and what changed. Public PR link is the
  required evidence.
- **No secrets** committed, ever — `.env.example` with placeholders, `.gitignore` covers real
  `.env`; secret-check before every commit.
- **Compliance:** public repo; built during the week; only self-owned targets; AI-assisted
  development disclosed in the README; team must understand all submitted code; ~3-min demo +
  short write-up.

## 14. Verified facts (2026-08-25)

- Hackathon: online Aug 24–30 2026, submissions close Sun Aug 30 8:00 PM London; tracks are
  Best Use of TrueForge (NVIDIA DGX Spark), Best Code Quality/Qodo (Mac Mini), Best UI (iPad),
  plus Best blog post and Top-10 social; **a team can win only one track**; **Qodo required of
  every submission**. Theme is a Bond "License to act / Q Branch / 007" motif.
- TrueForge: open source (`github.com/truefoundry/trueforge`, docs `trueforge.dev`), run via
  `npx @truefoundry/trueforge` (local/SQLite) or Docker Compose/Helm (hosted); three surfaces
  (core server, HTTP API + TS SDK `@truefoundry/trueforge-core`, chat UI + UI SDK
  `@truefoundry/trueforge-ui`); capabilities include MCP tools, **sandbox-as-tool**, human
  approval, subagents, session survival across reconnects, any model, and Skills.
- Qodo: install via Qodo → Integrations → SaaS → GitHub → Add installation on the repo (14-day
  trial, no card, one install per team); trigger a stalled review with `/agentic_review`; fix
  valid High findings or dismiss with recorded reason.

*Prepared for Claude Code implementation. Each section maps to a discrete task; §10 gives the
order of attack.*
