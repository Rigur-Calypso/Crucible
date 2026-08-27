# TrueForge Integration — how The Crucible uses the harness

This is the authoritative description of *how* The Crucible depends on TrueForge, capability by
capability. The guiding test, straight from the hackathon's own bar: **a judge must be able to
remove TrueForge and see the architecture stop working.** For The Crucible that is literally
true — the sandbox is our containment, the approval gate is our safety control, and MCP is our
only sanctioned path to the targets. None of it is decoration.

Verified against `trueforge.dev` and the hackathon page on 2026-08-25. Where the exact
configuration surface must be confirmed while building, it is marked **[verify in impl]**.

---

## 0. What TrueForge is, in one paragraph

TrueForge is an open-source **agent harness**: the runtime layer around an LLM that runs the
full agent loop — planning, tool routing/execution, context management, security boundaries
(sandboxing, human-in-the-loop approvals), and session state that survives reconnects. It has
three surfaces: a **core server** (the agent loop), an **HTTP API + TypeScript SDK**
(`@truefoundry/trueforge-core`), and a **chat UI + UI SDK** (`@truefoundry/trueforge-ui`).
We run it locally with `npx @truefoundry/trueforge` (SQLite, no login, kept on localhost).

A critical design fact shapes everything below: **TrueForge treats the sandbox as a *tool*,
provisioned on demand only when the agent needs to run code.** The agent loop runs on the
server, *not* inside the sandbox. Many harnesses do the opposite. This is why our security
model is defense-in-depth rather than "the agent is trapped in a box" (see §3 and
`docs/SECURITY_MODEL.md`).

---

## 1. MCP tools — our controlled reach into the arena (P0)

**How we use it.** The Crucible MCP server is added to TrueForge as a connector. It exposes the
only sanctioned interface to the arena: `list_challenges`, `get_challenge`, `fetch_file`,
`submit_flag`, `connect`. The agent cannot see or reach the arena except through these tools.

**Why it's load-bearing.** Without the harness's MCP client, the model is a text generator with
no hands. The arena is real infrastructure; MCP is what turns "the model reasoning about SQLi"
into "the agent actually enumerating challenges, pulling an artifact, and — after approval —
acting on the target." The `connect` tool is also one of our two enforcement layers.

**Config.** Settings → Connectors → add the Crucible MCP server endpoint; the agent is granted
exactly these tools. **[verify in impl]** the current connector-registration flow and whether
per-tool grants are set on the agent or the connector.

## 2. Sandbox-as-tool — where agent-written exploit code runs (P0)

**How we use it.** The agent writes its own PoC (e.g. a Python script that crafts a SQLi payload
or forges a JWT) and executes it in TrueForge's sandbox. Local analysis and PoC *testing* happen
here with no approval needed; only sending a payload to the live target crosses the approval
line (§3).

**Why it's load-bearing.** This is the whole safety premise: we are deliberately letting an LLM
write and run exploit code. The sandbox is the containment that makes that acceptable. Remove it
and we're either running untrusted generated code on the host (unsafe) or not running it at all
(no autonomy). The hackathon's "safe place to run what it writes" requirement is satisfied by an
*actual* execution of generated code in the sandbox, visible in the demo — not a mock.

**Consequence we must handle.** Because the sandbox has network capability, its **egress must be
locked to the arena subnet at the network layer** (Layer 1 in `docs/SECURITY_MODEL.md`).
Otherwise agent-written code could reach outside the arena and bypass the `connect` allowlist.
**[verify in impl]** how the sandbox provider's networking is configured and how to constrain its
egress; do not assume — inspect the real sandbox network before claiming containment.

**We do not build a second sandbox.** No custom isolation layer duplicating or routing around
TrueForge's. The story is: agent-written code → TrueForge sandbox → controlled execution.

## 3. Human approval — the "License to Hack" gate (P0)

**How we use it.** TrueForge pauses before sensitive actions until a person approves. We mark as
sensitive: any `connect` call, and any sandbox execution that sends a payload to a live
challenge service. Everything upstream — recon, reading files, forming a hypothesis, generating
and *locally testing* a PoC — runs autonomously. The pause lands exactly at the meaningful
security boundary: the moment before the agent acts on the target.

**Why it's load-bearing.** "Stay in control / stop before anything irreversible" is a first-class
judging criterion and a core hackathon requirement. Our gate is a real control on a genuinely
consequential action (executing a validated exploit), not a confirmation dialog on something
harmless. It must be the harness's real approval mechanism — if the agent could proceed without
it, the safety story is void.

**Config.** Approval requirements are set per-agent on the sensitive tools/steps. **[verify in
impl]** the exact per-agent approval control at `trueforge.dev/create-agent` and confirm the
pause is enforced server-side (test that a denied action does not execute).

**Demo requirement.** The pause must fire visibly at least once, showing the Security Case at
`AWAITING AUTHORIZATION` with `[AUTHORIZE] [DENY]`.

## 4. Subagents — meaningful delegation (P1, optional)

**How we might use it.** A coordinator dispatches subagents with distinct jobs — Recon (enumerate
via `list_challenges`/`get_challenge`), Analysis (read artifacts, form the vulnerability
hypothesis), Evidence (collect and structure proof) — feeding a PoC generator, then the approval
gate, then the target action. This is genuine division of labor, not N agents solving the same
challenge in parallel.

**Why it could earn its place.** The Best Use of TrueForge criterion explicitly rewards work
handed to subagents. Distinct roles that visibly hand off make the delegation legible to a judge.

**Guardrail.** Gated behind a reliable single-agent web-01 end-to-end. If subagents introduce
instability (deadlocks, context confusion), we cut back to the single agent. Reliability > count.

## 5. Sessions / reconnect — investigation survives interruption (P1, optional)

**How we might use it.** Start a Security Case, disconnect/refresh/restart, reconnect, and the
investigation continues from where it was. TrueForge persists sessions so conversations survive
reconnects and restarts.

**Why it's worth a beat in the demo.** It's cheap to show and signals real "long-running agent"
maturity — the harness, not our app, is doing the persistence.

## 6. Skills — reusable security-investigation instructions (P2, optional)

**How we might use it.** Package the investigation playbook (how to approach a web target, when a
finding is "confirmed", the finding schema) as a TrueForge Skill the agent loads when a security
task calls for it, instead of stuffing it all into the system prompt.

**Guardrail.** Only if the live Skills API supports it cleanly. Not worth destabilizing the core
workflow. **[verify in impl].**

---

## 7. Models

BYO key; any provider (OpenAI/Anthropic/Gemini/DeepSeek/OpenAI-compatible), switchable in the UI.
Online participants bring their own key. We pick a capable model for the flagship run and pin it
for the demo for determinism.

## 8. UI

Prefer the UI SDK (`@truefoundry/trueforge-ui`) reskinned into the Security Case view over a
separate dashboard — it keeps the interface backed by real harness state and is less work than a
bespoke frontend. The bundled chat UI already shows the agent-steps panel (reasoning, tool calls,
subagents), which is most of what the Best UI criterion asks for.

## 9. Capability → requirement traceability

| Hackathon requirement | TrueForge capability | The Crucible's use |
|---|---|---|
| Reach real tools | MCP client | Crucible MCP server: the only path to the arena |
| Safe place to run generated code | Sandbox-as-tool | Agent-written PoC executes in the sandbox |
| Stop before irreversible action | Human approval | Pause before `connect` / live-target payload |
| Delegate | Subagents | Recon/Analysis/Evidence roles (optional) |
| Survive reconnects | Sessions | Security Case continues after reconnect (optional) |
| Any model | Model providers | BYO key, pinned for the demo |
| Reusable instructions | Skills | Investigation playbook as a Skill (optional) |

## 10. Implementation verification checklist

Confirmed against **TrueForge v0.1.4** (standalone, `npx @truefoundry/trueforge`, SQLite, API at
`/api/v1`, OpenAPI at `/api/v1/openapi.json`). See `scripts/trueforge-setup.mjs` for the exact,
reproducible wiring and `docs/TRUEFORGE_SETUP.md` for the run steps.

- [x] **MCP connector registration + per-agent tool grants.** TrueForge registers only *remote*
      MCP servers by URL: `POST /api/v1/settings/mcp-servers` with
      `manifest{type:"remote", name, url, description}`. Tools (with annotations) are visible at
      `GET /api/v1/mcp-servers/crucible/tools`. Per-agent grants: an agent's
      `mcp_servers[].enable_tools` / `disable_tools` (selectors `@all`, `@read-only`, or names).
      → this is *why* the MCP server is served over Streamable HTTP and containerized onto the
      arena network (also resolving the arena-DNS finding).
- [x] **Per-agent approval control.** `mcp_servers[].require_approval_for_tools` accepts
      `@destructive` / `@write` / `@read-only` / explicit tool names. We set `["connect"]`; our
      read tools carry `readOnlyHint`, `connect` carries `destructiveHint`. *Still to prove with a
      live model run:* that a **denied** approval provably does not execute `connect`.
- [~] **Sandbox — OFF by default.** Enabled per agent via `config.sandbox.enabled`; standalone
      TrueForge (Daytona / local fallback) exposes **no sandbox egress allowlist**, so enabling it
      does not confine agent-written code to the arena. We default it OFF
      (`CRUCIBLE_ENABLE_SANDBOX=true` to opt in); with it off, all target interaction flows through
      the allowlisted, approval-gated `connect`. Constraining sandbox egress (Daytona net policy /
      egress-firewalled image) remains **[verify in impl]**. See `SECURITY_MODEL.md` §3a.
- [x] **MCP endpoint hardening.** The remote MCP server is published loopback-only, requires a
      bearer token (`CRUCIBLE_MCP_TOKEN`, sent via the connector's `auth: header`), enables
      DNS-rebinding Host validation, and bounds request bodies — so only TrueForge can invoke the
      tools, not an arbitrary local process.
- [x] **Subagents.** `config.dynamic_sub_agents.enabled` (default true). Mechanism confirmed;
      use only if it stays reliable (P1).
- [x] **Sessions / reconnect.** `POST /api/v1/sessions` + `/turns`, `/events`, `/subscribe`;
      persisted in SQLite. Mechanism confirmed (P1).
- [x] **Skills.** `config` + `manifest.skills[]` + `GET /api/v1/catalogs/skills`. Mechanism
      confirmed (P2).
- [ ] **Model provider** needs a BYO key: `POST /api/v1/settings/model-providers`
      (openai/anthropic/google-gemini/fireworks/…). Supply via `TF_MODEL_API_KEY` — never committed.

Do not document a capability as working until it has been exercised end-to-end and, where it's a
security control, tested to fail closed. The remaining live-run proofs (approval denial;
end-to-end Security Case) require the model key.
