# PROJECT_DECISIONS.md — The Crucible

**Purpose:** the *current authoritative truth* about how The Crucible is built. When a decision
changes, update this file and record the change chronologically in `PROJECT_WORKLOG.md`.
The worklog preserves history; this file preserves the present.

**Last updated:** 2026-08-25 (foundation + external-review incorporation)

---

## D0 — Product positioning
The Crucible is a **safety-first autonomous security validation agent**. It investigates a
controlled, intentionally vulnerable target, forms a vulnerability hypothesis, generates and
tests a PoC in TrueForge's sandbox, requires explicit human authorization before touching the
live target, executes the authorized action, confirms exploitability, and produces a **security
finding**. The CTF arena is the controlled evaluation environment; the flag is evidence.
It is **not** a generic CTF platform.

## D1 — Track strategy
Differentiate for **Best Use of TrueForge** (largest prize, most on-theme). Treat **Qodo** as a
mandatory qualification gate for *every* submission (not just its track). **Best UI** is a bonus
we're auto-considered for. Rule 15 confirms a team can win only one track, so we do not split
effort chasing two.

## D2 — TrueForge is load-bearing
Priorities: **P0** MCP tools, sandbox-as-tool execution, human approval. **P1** subagents,
sessions/reconnect. **P2** Skills. Removing TrueForge must visibly break the architecture.
Key fact: TrueForge runs the agent loop on the **server** and provisions the **sandbox on demand
as a tool** — the agent does not live inside the sandbox. This drives D4. Detail:
`docs/TRUEFORGE_INTEGRATION.md`.

## D3 — Keep the architecture as simple as reliability allows
Single coordinating agent for the flagship workflow first. Subagents are added only after the
single-agent web-01 end-to-end is reliable. Reliability outranks feature count.

## D4 — Security model: defense in depth (P0)
Because agent-written code runs in a sandbox with network access, an allowlist that lives only in
`connect` is insufficient. Two independent, tested layers:
- **Layer 1 — Sandbox egress** restricted to the arena subnet at the Docker/network layer,
  default-deny / fail-closed. Contains any code the agent writes.
- **Layer 2 — `connect` in-code allowlist** (implemented in
  `mcp-server/src/policy/networkPolicy.ts`), rejecting non-arena destinations in code and acting
  as the single approval-gated chokepoint.
The boundary **fails closed**. Detail + threat model: `docs/SECURITY_MODEL.md`.

**D4a (open, finalize in impl):** whether target interaction is *exclusively* via `connect`
(sandbox has no arena egress) or *primarily* sandbox-direct with `connect` as the gated path.
Default: sandbox-direct **with Layer 1 locked down**, `connect` retained as the audited,
approval-gated action. Revisit after inspecting the real Docker/TrueForge sandbox networking.

## D5 — Network policy specifics
Implemented and tested in `mcp-server/src/policy/networkPolicy.ts` +
`mcp-server/test/networkPolicy.test.ts`. Allow: arena IPv4/hostname resolving inside the arena,
approved ports. Reject: public IP/hostname, localhost/127.0.0.1/loopback, private IPs outside the
arena, link-local, IPv6 outside the approved network, malformed addresses, alternate encodings
(octal/hex/integer), and destinations from unsafe/rebinding DNS. **Resolve, then validate**, and
pin the resolved IP (connect to it, never re-resolve) to defeat rebinding.

## D6 — MCP tool design
`list_challenges` (light metadata), `get_challenge` (full detail + connection info), `fetch_file`
(ownership check + path-traversal rejection; never arbitrary FS reads), `submit_flag` (server-side
constant-time validation), `connect` (strongest boundary, D4/D5). Every tool: explicit schema,
input validation, predictable errors, tests, docs. Stack: TypeScript/Node + official MCP TS SDK.

## D7 — Approval model
Autonomous (no approval): recon (`list_challenges`, `get_challenge`, `fetch_file`), static
analysis, PoC generation, **local sandbox testing**. **Human approval required:** any `connect`
call, and any sandbox execution that sends a payload to a live challenge service. The pause lands
at the meaningful security boundary — *before the sensitive action*, not before all network I/O.
Uses TrueForge's real per-agent approval mechanism. Verify in `trueforge.dev/create-agent`.

## D8 — Challenge strategy
Flagship: **web-01** (deterministic SQLi/auth-bypass; design in `docs/CHALLENGE_WEB01.md`).
Secondary: `crypto-01`, `forensics-01` (only if stable; never demo dependencies). Optional:
`pwn-01` (cut first). Success = web-01 fully polished, even if nothing else ships.

## D9 — UI philosophy
Show the Security Case lifecycle and make the approval read as a *control* (visible policy
evaluation), plus a boundary-block panel as safety evidence. Prefer reskinning
`@truefoundry/trueforge-ui` over a bespoke dashboard. No fake approval screens. States:
`docs/UI_STATES.md`.

## D10 — Testing strategy
Unit + security (fail-closed, D5) + integration + ≥1 full end-to-end Security Case. The boundary
is not "done" until the fail-closed matrix passes and **both** layers are proven. Tests ship with
the code they cover. (Network-policy tests pass 13/13; full suite incl. MCP integration tests: 19/19.)

## D11 — Git / Qodo workflow + PR sequence
Never push to `main`. `feature/<component>-<desc>` branches; one coherent milestone per PR; Qodo
reviews each; fix every valid High finding or dismiss in-thread with a recorded reason; merge only
after review completes. README carries `## Qodo Code Review Evidence`. Target PR sequence (combine
/ split on real boundaries):
1. Foundation (docs + arena & MCP skeletons + network policy + tests)
2. Arena: web-01 fully built
3. MCP server wired to the SDK + tool schemas
4. Network security boundary hardened (both layers) — Qodo focus PR
5. TrueForge agent workflow + approval gate
6. End-to-end Security Case
7. (optional) Subagent orchestration
8. Security Case UI
9. (optional) Secondary challenges
10. Final hardening / tests / docs

## D12 — Secrets
No keys/tokens/passwords/`.env`/credentials/personal data committed, ever. `.env.example` +
`.gitignore` cover it; secret-check before every commit; keep secrets out of the demo video too.

## D13 — Demo strategy
~3 minutes, per `DEMO_PLAN.md`, on the 007 "License to act" theme. Must show MCP calls, sandbox
execution, the approval pause, a controlled exploit succeeding, the boundary *rejecting* an unsafe
target, and the security finding. Pin the demo model; pre-verify repeatedly; record a backup take.

## D14 — Do not build a second sandbox
TrueForge's sandbox is the execution environment. No duplicate isolation layer that routes around
it. Story: agent-written code → TrueForge sandbox → controlled execution.

## D15 — Assignment framing
Cases are framed as an investigation, not a command: *"Investigate web-01; determine whether auth
can be bypassed; ask me before executing against the target."* This maximizes the autonomy →
approval → action arc that the judging rewards. Encoded in `agent/system-prompt.md`.

## D16 — Final output is a security finding
Never end on "FLAG FOUND". Emit a structured finding (finding, severity, evidence, exploitability,
target, execution=sandbox, authorization=human). Flag is evidence. Schema in `PRD.md` §8.

## D17 — Subagents are split by FUNCTION, not by challenge
If used: Recon / Analysis / Evidence → PoC → approval → action. **Not** one agent per challenge
category (that's just N solvers running in parallel and reads as decorative). A reviewed external
suggestion proposed category-based agents; we reject that in favor of function-based delegation,
consistent with meaningful hand-offs. Gated behind a reliable single-agent E2E (D3).

## Known tradeoffs (current)
- **D4a** sandbox-direct vs `connect`-only egress: ergonomics vs. a single chokepoint; mitigated
  by locking Layer 1 either way.
- **Subagents vs reliability:** strong differentiator, real reliability risk; gated.
- **Secondary challenges vs focus:** show generalization but can eat flagship polish; optional.
- **Local TrueForge mode:** convenient but not hardened; keep on localhost.
