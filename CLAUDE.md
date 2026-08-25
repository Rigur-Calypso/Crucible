# CLAUDE.md — The Crucible

Standing context for Claude Code in this repo. Read `PRD.md`, `PROJECT_DECISIONS.md`,
`docs/SECURITY_MODEL.md`, and `docs/TRUEFORGE_INTEGRATION.md` before implementing. `PRD.md` is
*what and why*; this file is *how to work here day to day*. `PROJECT_DECISIONS.md` is the current
authoritative truth — if this file and it ever disagree, the decisions file wins and this file
gets fixed.

## What this is
A safety-first autonomous security validation agent on TrueForge, for The Agent Harness
Hackathon. Deadline **Sun Aug 30, 2026, 8:00 PM London**. The agent investigates a controlled,
intentionally vulnerable target, tests a PoC in TrueForge's sandbox, **stops for human
authorization before touching the live target**, executes, verifies, and emits a security
finding. The CTF arena is the controlled evaluation environment, not the product.

## Hard rules — never violate
1. **Self-owned targets only.** Every target is a container we built in `arena/docker-compose.yml`.
   Never write code that connects to, scans, or fingerprints any host outside the arena network.
   If a task seems to require touching something we don't own, stop and flag it.
2. **The security boundary is enforced in code, in two layers** (see `docs/SECURITY_MODEL.md`):
   Layer 1 — sandbox egress restricted to the arena subnet, fail-closed; Layer 2 — the `connect`
   MCP tool's in-code allowlist. Never rely on the system prompt/agent instructions/README for
   containment. Any weakening of either layer is a P0 bug.
3. **Never push to `main`.** Every change goes on a `feature/<component>-<desc>` branch, opens a
   PR, and is reviewed by Qodo before merge. This is an eligibility requirement, not style.
   If you (Claude Code) commit, do it on a feature branch and open the PR; don't merge without
   review.
4. **No secrets in the repo.** No keys/`.env`/tokens/credentials, ever — secret-check before
   every commit. Use `.env.example`; `.gitignore` covers real `.env`.
5. **TrueForge's sandbox is the execution environment.** Don't build a second isolation layer
   that duplicates or routes around it.
6. **Don't let the optional binary challenge (`pwn-01`) block core work.** Cut it first if time
   is short.

## Tech stack (defaults — keep consistent; change here if you diverge)
- **MCP server:** TypeScript/Node, official MCP TypeScript SDK.
- **Arena:** Docker Compose. `web-01` = custom Flask app with a deliberate, deterministic
  SQLi/auth-bypass bug. `crypto-01`/`forensics-01` = Python serving static artifacts.
  `pwn-01` (optional) = C, `-fno-stack-protector -no-pie`.
- **UI:** prefer reskinning `@truefoundry/trueforge-ui` over a bespoke dashboard.
- **TrueForge:** local mode, `npx @truefoundry/trueforge`, SQLite, localhost only.

## Repo structure
```
the-crucible/
├── PRD.md
├── CLAUDE.md                 # this file
├── README.md                 # includes "## Qodo Code Review Evidence"
├── PROJECT_DECISIONS.md      # current authoritative decisions
├── PROJECT_WORKLOG.md        # chronological engineering history
├── DEMO_PLAN.md
├── docs/
│   ├── SECURITY_MODEL.md
│   └── TRUEFORGE_INTEGRATION.md
├── arena/
│   ├── docker-compose.yml
│   ├── web-01/               # flagship
│   ├── crypto-01/
│   ├── forensics-01/
│   └── pwn-01/               # optional
├── mcp-server/
│   ├── src/
│   │   ├── tools/
│   │   │   ├── listChallenges.ts
│   │   │   ├── getChallenge.ts
│   │   │   ├── fetchFile.ts     # ownership + path-traversal safe
│   │   │   ├── submitFlag.ts    # server-side validation
│   │   │   └── connect.ts       # Layer 2 allowlist lives here
│   │   └── index.ts
│   └── package.json
├── agent/
│   └── system-prompt.md
└── .env.example
```

## Workflow expectations
- **Branch naming:** `feature/<component>-<short-desc>` (e.g. `feature/mcp-connect-allowlist`).
- **PR size:** one coherent milestone per PR (per `PRD.md` §10), not one giant PR at the end.
- **Before a PR:** ensure Qodo is installed on the repo; let it review before requesting merge.
- **Qodo discipline:** fix every valid **High** finding, or dismiss it in the Qodo thread with a
  recorded reason; Medium/Low are engineering judgment; re-run the review after pushing fixes.
- **Commit messages:** short, imperative, specific (`Add subnet allowlist to connect tool`).
- **Worklog:** update `PROJECT_WORKLOG.md` as you go — significant failures and successes both.
- **Decisions:** when a decision changes, update `PROJECT_DECISIONS.md` and log the change in the
  worklog.

## Definition of done, per component
- **Arena container:** starts with `docker compose up`, exposes a working `/challenge.json`,
  flag validated server-side, reachable only on the internal network.
- **MCP tool:** matches the `PRD.md` §6.2 schema, has a basic test; `connect` additionally has
  fail-closed tests proving non-arena hosts are rejected (per `docs/SECURITY_MODEL.md` §6).
- **Security boundary:** the §6 fail-closed matrix passes, **both layers proven**.
- **Agent config:** lists challenges, fetches a file, and submits a flag end-to-end against a
  real container; the approval gate visibly pauses before any `connect`/live-target action and a
  *denied* action provably does not execute.
- **A capability is "using TrueForge" only after** it's exercised end-to-end and its
  `[verify in impl]` item in `docs/TRUEFORGE_INTEGRATION.md` is checked off.

## What not to do
- Don't write real-world exploit code against anything outside the arena, under any framing.
- Don't loosen either security layer "temporarily" to unblock testing — fix the test setup.
- Don't skip the PR/Qodo step to move faster — the review trail is graded.
- Don't add TrueForge capabilities (subagents/Skills/etc.) just to claim them; each must earn its
  place and not cost reliability.
- Don't build opaque systems the team can't explain during judging.

## Reference
- Full requirements: `PRD.md` · Security: `docs/SECURITY_MODEL.md` · Harness use:
  `docs/TRUEFORGE_INTEGRATION.md`
- TrueForge docs: trueforge.dev · repo: github.com/truefoundry/trueforge
- Hackathon: wemakedevs.org/hackathons/trueforge
