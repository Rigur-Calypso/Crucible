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

Before claiming any capability "done", confirm against the live product:
- [ ] MCP connector registration flow and per-agent tool grants **[verify in impl]**
- [ ] Sandbox provider networking and how to constrain egress to the arena subnet **[verify in impl]**
- [ ] Per-agent approval control; a denied action provably does not execute **[verify in impl]**
- [ ] Subagent delegation API and hand-off semantics, if used **[verify in impl]**
- [ ] Session persistence across a real reconnect, if demoed **[verify in impl]**
- [ ] Skills loading, if used **[verify in impl]**

Do not document a capability as working until it has been exercised end-to-end and, where it's a
security control, tested to fail closed.
