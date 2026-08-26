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
_TODO: build/run steps for `mcp-server/`._

### Running TrueForge
```
npx @truefoundry/trueforge
# connect a model (BYO key), add the Crucible MCP server under Connectors,
# create the agent, and set approval on connect / live-target execution.
```

### Running a Security Case
_TODO: point the agent at web-01; watch investigate → PoC → sandbox test → approval → exploit →
finding._

## Testing
```
# TODO: unit + security (fail-closed) + integration + end-to-end commands
```
The security boundary is not "done" until the fail-closed matrix in `docs/SECURITY_MODEL.md` §6
passes and both layers are proven.

## Qodo Code Review Evidence
Every substantive change in this repo goes through a GitHub pull request reviewed by Qodo before
merge; direct pushes to `main` are not used. Setup + per-PR workflow: `docs/QODO_SETUP.md`.

- **Representative reviewed PR:** _TODO: link a merged PR containing meaningful hackathon code._
- **What Qodo surfaced and what we did:** _TODO: 1–2 sentences on a real finding and the change
  we made (or why we dismissed it, recorded in the Qodo thread)._
- **Review trail:** _TODO: the PR history shows the initial review, our decisions, and a
  follow-up review against the final code._

## AI-assisted development disclosure
This project was built with AI coding assistance (Claude Code / Claude). AI tools were used for
implementation, documentation, and review support. All submitted code is understood by the team
and can be explained during judging. Design and code were produced during the hackathon window.

## Limitations
_Known gaps and honest caveats — e.g. optional challenges not built, local-mode-only TrueForge,
any `[verify in impl]` items still open._
