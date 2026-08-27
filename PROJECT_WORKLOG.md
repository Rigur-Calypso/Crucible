# PROJECT_WORKLOG.md — The Crucible

A chronological engineering record: actions, decisions, alternatives, failures, fixes,
verification, Qodo findings, PRs. This is engineering history, **not** private reasoning.
Update continuously — do not reconstruct at the end. Newest entries at the bottom of each day.

---

## 2026-08-25 — Foundation + strategy revision

### Objective
Re-frame the project from "CTF solver" to "safety-first autonomous security validation agent,"
verify the load-bearing external facts, and lay down a clean, reviewable documentation
foundation before any feature code.

### Actions
- Verified the live hackathon rules, TrueForge, and Qodo against their official sources.
- Revised `PRD.md` around the security-validation framing and the Security Case object.
- Created `PROJECT_DECISIONS.md` (authoritative current decisions D0–D14 + tradeoffs).
- Created `docs/TRUEFORGE_INTEGRATION.md` (per-capability, load-bearing justification).
- Created `docs/SECURITY_MODEL.md` (threat model, two-layer boundary, fail-closed test matrix).
- Created `DEMO_PLAN.md`, revised `CLAUDE.md`, drafted the `README.md` skeleton.

### Decisions
- **Differentiate for Best Use of TrueForge; treat Qodo as a mandatory gate for all
  submissions.** A team can win only one track, so we don't split effort across two.
- **Security boundary is defense-in-depth:** Layer 1 sandbox egress locked to the arena subnet
  (fail-closed) + Layer 2 `connect` in-code allowlist as the approval-gated chokepoint.

### Alternatives considered
- *Keep the original "allowlist lives in `connect`" single-control model.* Rejected: TrueForge
  runs agent code in a sandbox with network access, so a `connect`-only allowlist is bypassable
  by agent-written HTTP calls. Recorded as decision D4.
- *Build a bespoke Security Case dashboard.* Deferred in favor of reskinning
  `@truefoundry/trueforge-ui`, which keeps the UI backed by real harness state for less work.
- *Chase both Best Use of TrueForge and Best Code Quality as co-primary.* Rejected: only one
  track is winnable, and Qodo is required of every submission regardless.

### Failure / unexpected result
- Initial mental model assumed the agent runs *inside* the sandbox. TrueForge instead treats the
  **sandbox as a tool** provisioned on demand.

### Root cause
Assumption from other harness designs; not checked against TrueForge's actual model.

### Fix
Read the TrueForge docs; corrected the architecture and adopted the two-layer security model.
Added `[verify in impl]` markers for every config surface that must be confirmed while building.

### Verification
Documentation cross-checked for internal consistency (PRD ↔ decisions ↔ TrueForge ↔ security).
No code yet; verification of the boundary is deferred to the security PR's fail-closed tests.

### Qodo review
Pending — to run on PR #1 once the repo/remote and Qodo installation are confirmed in the
Claude Code session.

### PR
PR #1 (foundation) — to be opened from `feature/project-foundation` after arena/MCP skeletons
and the testing foundation are added in-repo.

### Improvement ideas
- Pin the demo model for determinism once a provider is chosen.
- Add a one-command arena bring-up + health check to the README quickstart.

### Current status
Documentation foundation drafted. Next: confirm repo/remote + Qodo install, scaffold arena and
MCP skeletons and the testing foundation in-repo, then open PR #1 and let Qodo review.

### Known limitations (as of today)
- No code exercised yet; all `[verify in impl]` items in `docs/TRUEFORGE_INTEGRATION.md` remain
  open until confirmed against the running harness.
- D4a (egress architecture) not yet finalized; pending inspection of real sandbox networking.

---

## 2026-08-25 (later) — External review incorporated + code foundation verified

### Objective
Fold a detailed external strategy review into the docs, then lay down verifiable code foundation
(network policy + tests, arena web-01, MCP scaffolding) — not just documentation.

### Actions
- Read the official rules page and the external assessment directly; confirmed: only one track is
  winnable, Qodo is required of every submission, build-during-week, AI-use disclosure, and the
  exact "## Qodo Code Review Evidence" README requirement. Added `SUBMISSION_CHECKLIST.md`.
- Implemented `mcp-server/src/policy/networkPolicy.ts` (Layer 2 allowlist) + `networkPolicy.test.ts`.
- Scaffolded `connect` (enforces policy, pins resolved IP), `fetchFile` (path-traversal guard),
  `submitFlag` (server-side constant-time compare), and remaining tool stubs.
- Built arena `web-01` (deliberately vulnerable Flask login) + `docker-compose.yml` on an
  `internal` network matching the allowlist subnet.
- Added `agent/system-prompt.md`, `docs/CHALLENGE_WEB01.md`, `docs/UI_STATES.md`, `.env.example`,
  `.gitignore`; updated PRD/DECISIONS/SECURITY_MODEL/CLAUDE/README/DEMO_PLAN.

### Decisions
- **Reject category-based subagents** (one per challenge type) proposed in the external review;
  keep **function-based** delegation (Recon/Analysis/Evidence → PoC → approval → action). See D17.
- Keep approval at the sensitive-action boundary, not before all network I/O (already D7).

### Verification
- `networkPolicy.ts` typechecks clean under TS strict + `noUncheckedIndexedAccess`.
- Fail-closed tests: **13/13 pass** (public IP, localhost, private/link-local, IPv6, malformed,
  alternate encodings, disallowed port, out-of-arena DNS, split-result, unresolvable, resolver
  error; allowed arena IP + arena hostname with pinned IP).
- `arena/web-01/app.py` compiles.

### Failure / unexpected result
- Strict-mode typecheck initially failed: `.ts`-extension imports needed `allowImportingTsExtensions`
  + Bundler resolution; `split("/")`/`results[0]` were possibly-undefined under
  `noUncheckedIndexedAccess`; `@types/node` had to be installed explicitly; the test runner needed
  `tsx --test` rather than `node --import tsx`.
- An `npm install` inside the output mount left a `node_modules/` wedged by filesystem I/O errors.

### Fix
- Corrected tsconfig (Bundler resolution, `allowImportingTsExtensions`, `noEmit`), added undefined
  guards, switched the test script to `tsx --test`. Verified in a clean scratch dir.
- Deliverable zip is built from a staging copy that **excludes `node_modules`**.

### Qodo review
Pending on the real repo. Direct Qodo at `networkPolicy.ts` (SSRF/rebinding/fail-closed),
`fetchFile.ts` (traversal), and the arena Docker network isolation.

### Current status
Foundation complete and partly verified. Next: open PR #1 on the real repo, install Qodo, and
resolve the `[verify in impl]` items against a running TrueForge harness.

---

## 2026-08-26 — Foundation verified + MCP server wired to the SDK (PR #1 prep)

### Objective
Turn the documented skeleton into verifiable, running code: prove the security foundation,
wire the MCP server to the real SDK (not a stub), and confirm the flagship web-01 solve path —
all locally, without depending on TrueForge/Qodo/GitHub (which need account + browser auth).

### Actions
- Installed `mcp-server` deps; `npm run typecheck` clean under strict + `noUncheckedIndexedAccess`.
- Ran the network-policy fail-closed suite: **13/13 pass** (unchanged).
- Wired `mcp-server/src/index.ts` to `@modelcontextprotocol/sdk` **v1.30.0** (`McpServer`
  + `StdioServerTransport`), registering all five tools with explicit **zod** input schemas and
  spec-valid result shaping (structuredContent only for object payloads; `isError` on blocked
  `connect`). Added `zod ^4.0.0` as an explicit dependency (deduped with the SDK's copy).
- Added `test/server.test.ts`: 6 in-process integration tests over a linked in-memory transport
  (tool registration, list_challenges, server-side flag validation, `connect` fail-closed,
  `connect` arena-allow + IP pin, `fetch_file` traversal rejection). **Total: 19/19 pass.**
- Verified `npm start` boots and serves on stdio; verified via a spawned SDK client that all
  tools respond correctly.
- Ran web-01 directly (Docker daemon was down) on a spare port: control creds → 401; both
  intended SQLi payloads (`admin'--` and `' OR '1'='1'--`) → 200 with the flag. Deterministic.
- Initialized git in `the-crucible/`; committed the foundation to `feature/project-foundation`
  (node_modules excluded, secret-scan clean).

### Decisions
- Pin the SDK to `^1.30.0` (was `^1.0.0`) since the wiring uses the current high-level
  `registerTool` API; `zod` made an explicit dependency because we import it directly.

### Failure / unexpected result
- Docker daemon not running → could not `docker build`/`compose up`. Verified web-01 by running
  the Flask app directly instead (same code path), so the vuln + flag are confirmed regardless.
- Port 5000 is held by macOS AirPlay Receiver; ran the app on a spare port for local testing.
- First MCP result shaping put an array in `structuredContent`; the SDK requires a record →
  now attached only for object payloads (arrays still carried in text content).
- Found and fixed a real bug: the arena flag (`app.py`) and the `submit_flag` validator disagreed
  (`example_..._replace_me` vs `REPLACE_ME`), so a genuine capture would have failed validation.
  Unified both to `crucible{sqli_auth_bypass_web01}`.

### Verification
- `npm run typecheck`: clean. `npm test`: **19/19**. `npm start`: serves on stdio.
- web-01 exploit path reproduced multiple times with identical results.

### Qodo review
Still pending — requires the Qodo GitHub install + a pushed remote (needs the team's accounts).
When live, point Qodo at `networkPolicy.ts` (SSRF/rebinding/fail-closed), `fetchFile.ts`
(traversal), `index.ts` (result shaping / error handling), and the arena network isolation.

### Current status
Foundation is running and verified locally. `feature/project-foundation` holds PR #1's content.
Next (needs the team's accounts/harness): push the branch, install Qodo, open PR #1; stand up
Docker and run the arena via compose; wire `connect`'s socket hand-off through the TrueForge
sandbox and resolve the `[verify in impl]` items.

### Known limitations (as of today)
- `connect` enforces the allowlist but does not yet open a real proxied socket to the sandbox
  (Layer-1 sandbox egress lockdown + the socket hand-off remain `[verify in impl]`).
- Arena not yet exercised through `docker compose` (daemon was down); only the web-01 app itself.

---

## 2026-08-26 (later) — Pushed to GitHub + arena verified on real Docker

### Objective
Get the foundation onto the team's GitHub repo through the reviewed-PR workflow (not a direct
push to main), and — now that the Docker daemon is up — verify the arena end-to-end on the real
network, including Layer-1 containment.

### Actions
- Restructured history: `main` seeded with a minimal baseline ("Initialize repository", .gitignore
  only) so PR #1's diff is the whole foundation; all work on `feature/project-foundation`.
- Added remote `origin` → github.com/Rigur-Calypso/Crucible; pushed `main` and
  `feature/project-foundation` (auth via osxkeychain; secret-scan clean; node_modules excluded).
- Brought up the arena via `docker compose`; confirmed web-01 at 10.42.0.5, network `internal:true`,
  subnet 10.42.0.0/24, no host port published.
- Added `arena/verify-arena.sh` and ran it: **7/7 checks pass** — reachability by hostname,
  /challenge.json, control-creds rejection, SQLi auth bypass returns the flag, and **Layer-1
  egress to example.com and 8.8.8.8 is blocked** from a container on the arena network.
- Updated README quickstart (one-command arena check) and SECURITY_MODEL §6 (Layer-1 now proven
  on the real network; remaining item is confirming the TrueForge sandbox attaches to this net).

### Decisions
- Establish `main` as a near-empty baseline and land the foundation via PR #1, keeping the graded
  review trail intact and honoring "never push work directly to main."

### Verification
- `git ls-remote origin` succeeds; both branches present on origin.
- `bash arena/verify-arena.sh`: 7/7 pass. web-01 exploit reproduced on the compose network.
- Layer-1: curl to example.com exits 6 (DNS fail), to 8.8.8.8 exits 7 (connect fail) → contained.

### Qodo review
Ready to run once Qodo is installed on the repo and PR #1 is opened from
`feature/project-foundation` (link below). Suggested review focus unchanged: networkPolicy.ts,
fetchFile.ts, index.ts result/error shaping, arena network isolation.

### Current status
Code is on GitHub. Open PR #1:
https://github.com/Rigur-Calypso/Crucible/pull/new/feature/project-foundation
Arena verified on real Docker with Layer-1 containment proven. Next (needs the running harness):
`npx @truefoundry/trueforge`, add the MCP connector, mark `connect` approval-required, wire its
socket hand-off through the sandbox, and confirm the sandbox attaches only to the arena network.

---

## 2026-08-27 — PR #1 merged; addressing Qodo's review (PR #2)

### Objective
PR #1 was reviewed by Qodo and merged to `main`. Qodo raised 6 findings (1 High, 5 Medium).
Address the correctness/robustness subset that needs no infra change (findings #2, #4, #5, #6)
in PR #2; defer the architectural pair (#1 `connect` I/O, #3 arena DNS) to PR #3
(containerize the MCP server onto the arena network).

### Qodo findings (PR #1)
1. **[High]** `connect` returns ok without opening a socket — deferred to PR #3.
2. **[Med]** `fetch_file` returned a path, not content — **fixed here**.
3. **[Med]** Arena hostname can't resolve (MCP runs on host, not on the arena net) — PR #3.
4. **[Med]** Tool failures didn't set MCP `isError` — **fixed here**.
5. **[Med]** Verifier raced service startup (no healthcheck/readiness) — **fixed here**.
6. **[Med]** Verifier hard-coded the Compose network name — **fixed here**.

### Actions
- `fetchFile.ts`: added `readChallengeFile` — resolve (containment) + **symlink-escape guard** +
  real read, returning base64 content; served from a dedicated agent-facing artifact root
  (`mcp-server/challenge-files/`), never the arena container source (so the flag isn't reachable
  via this tool). Added `challenge-files/web-01/briefing.txt`.
- `index.ts`: every tool now sets MCP `isError` on a failed domain result (get_challenge unknown,
  fetch_file failure, submit_flag unprocessable). A wrong-but-valid flag stays a normal result.
- `docker-compose.yml`: added a python-based healthcheck to web-01.
- `verify-arena.sh`: `up -d --wait` (blocks on healthy), network name **derived** from the
  running container (robust to project-name overrides), and a bounded readiness retry.
- Updated SECURITY_MODEL §5/§6 (fetch_file now implemented + symlink guard + tests).

### Verification
- `npm run typecheck` clean; `npm test`: **23/23** (added fetch_file read + isError coverage).
- `bash arena/verify-arena.sh`: **7/7**, healthcheck gates startup ("Waiting → Healthy"),
  network name derived correctly.

### Current status
PR #2 ready on `feature/qodo-fixes-correctness`. Next: PR #3 — containerize the MCP server,
attach it to the internal arena network, and make `connect` open a real socket to the pinned IP
(resolves Qodo #1 and #3 together).
