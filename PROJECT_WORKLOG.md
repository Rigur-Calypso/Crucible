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
Address the correctness/robustness findings that can be fixed and tested in code now
(#1 real `connect` I/O, #2, #4, #5, #6) in PR #2; defer only #3 (arena DNS) — the deployment
question of attaching the MCP server to the arena network, which depends on the TrueForge harness.

### Qodo findings (PR #1)
1. **[High]** `connect` returned ok without opening a socket — **fixed here** (real TCP I/O).
2. **[Med]** `fetch_file` returned a path, not content — **fixed here**.
3. **[Med]** Arena hostname can't resolve (MCP runs on host, not on the arena net) — PR #3.
4. **[Med]** Tool failures didn't set MCP `isError` — **fixed here**.
5. **[Med]** Verifier raced service startup (no healthcheck/readiness) — **fixed here**.
6. **[Med]** Verifier hard-coded the Compose network name — **fixed here**.

### Actions
- `connect.ts`: now performs **real TCP I/O** to the pinned resolved IP after the policy check
  (injectable connector, bounded timeout), reporting `connected: true/false` — no more false
  success. Blocked destinations never touch the network. Added real-socket tests
  (`test/connect.test.ts`) + injected-connector branch tests.
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
- `npm run typecheck` clean; `npm test`: **27/27** (added real `connect` I/O branch tests,
  real-socket open/refuse tests, and fetch_file read + isError coverage).
- `bash arena/verify-arena.sh`: **7/7**, healthcheck gates startup ("Waiting → Healthy"),
  network name derived correctly.

### Current status
PR #2 ready on `feature/qodo-fixes-correctness` — addresses 5 of the 6 Qodo findings (#1, #2, #4,
#5, #6). Only #3 remains: attach the MCP server to the internal arena network so `connect` reaches
arena hostnames — a deployment step that depends on how TrueForge launches/connects to the MCP
server (a genuine `[verify in impl]` for the harness milestone), tracked in
`docs/TRUEFORGE_INTEGRATION.md` §10.

---

## 2026-08-27 (later) — Qodo re-review of PR #2 (3 Medium rule-violations)

### Qodo findings on PR #2 (0 bugs, 3 rule violations, all Medium; Qodo endorsed the connect approach)
1. **connect has no in-code approval gate** before the live socket — **dismissed with reason**:
   an MCP tool cannot obtain trustworthy approval state (the agent controls tool inputs), so an
   in-code gate would be theatre. Approval is enforced by TrueForge's harness-level gate, which
   intercepts the call outside the agent's control (D7/D14). The denied-action-does-not-execute
   test is tracked in the TrueForge milestone (`docs/TRUEFORGE_INTEGRATION.md` §10).
2. **fetch_file lacked an ownership check** — **fixed**: `readChallengeFile` now authorizes the
   challenge against the registry (`isKnownChallenge`) before resolving/reading; unknown ids fail
   closed. Matches PRD D6 ("ownership check"). Added `isKnownChallenge`/`knownChallengeIds`.
3. **CRUCIBLE_CHALLENGE_FILES_ROOT undocumented** — **fixed**: added to `.env.example` with a
   non-secret placeholder and explanation.

### Verification
- `npm run typecheck` clean; `npm test`: **28/28** (added an ownership-check test).

### Current status
PR #2 updated on `feature/qodo-fixes-correctness`. Post the dismissal reason for finding #1 in its
Qodo thread, let Qodo re-review the update, then merge.

---

## 2026-08-27 (later) — TrueForge integration wired & verified against v0.1.4

### Objective
Stand up the real TrueForge harness, learn its actual API (not assumptions), and wire the Crucible
in: MCP connector, agent, approval gate, sandbox — resolving the last Qodo item (#3, arena DNS)
and the D4a egress question.

### Actions
- Ran `npx @truefoundry/trueforge@0.1.4` (standalone, SQLite, API at `/api/v1`, OpenAPI at
  `/api/v1/openapi.json`). Read the real schemas for MCP-server + agent creation.
- **Key finding:** TrueForge registers only *remote* MCP servers by URL — not stdio. So:
  - Added `mcp-server/src/http.ts` — Streamable HTTP transport (canonical stateful sessions).
  - Added `mcp-server/Dockerfile` + `.dockerignore`; added a `mcp` service to
    `arena/docker-compose.yml` on TWO networks: `arena` (internal, to reach web-01) and `edge`
    (host-reachable, so TrueForge reaches `http://localhost:8848/mcp`). Resolves Qodo #3.
  - Added `readOnlyHint` annotations to the 4 read tools (connect already `destructiveHint`) so
    TrueForge's approval selectors (`@read-only`/`@destructive`) map correctly.
- Added `scripts/trueforge-setup.mjs` (idempotent): registers the connector, optionally configures
  a model provider from `TF_MODEL_API_KEY` (never committed), and creates `crucible-agent` with
  `require_approval_for_tools: ["connect"]` + `config.sandbox.enabled`.
- Added `docs/TRUEFORGE_SETUP.md`; updated `docs/TRUEFORGE_INTEGRATION.md` §10 (checklist now
  confirmed against v0.1.4) and resolved **D4a** in `PROJECT_DECISIONS.md`.

### Verification
- Containerized MCP on the arena net: `connect('web-01',5000)` → **real socket, connected:true**
  to 10.42.0.5. `8.8.8.8:443` and `web-01:22` → blocked, fail-closed. (End-to-end proof of
  Qodo #1 + #3.)
- TrueForge: `POST /settings/mcp-servers` → 201; `GET /mcp-servers/crucible/tools` lists all five
  with annotations. `scripts/trueforge-setup.mjs` idempotent (connector PUT update → 200).
- Agent creation returns 422 "provider not configured" until a model key is supplied — expected;
  everything else (connector, tool grants, approval config, sandbox flag) validates.
- `npm test`: 28/28 still green.

### Failure / unexpected result
- MCP server bound IPv6-only initially wasn't an issue; TrueForge binds `::1`, Docker publishes
  IPv4 — registered the connector URL as `http://127.0.0.1:8848/mcp` to be explicit.
- First upsert used `PUT /settings/mcp-servers/{name}` (404); PUT is list-level — fixed the script.

### Current status
TrueForge integration complete and verified except the live model run (needs BYO key). To finish:
`TF_MODEL_API_KEY=... node scripts/trueforge-setup.mjs`, then run a Security Case in the chat UI
and prove approval-denial blocks `connect`. Branch: `feature/trueforge-mcp-http-integration` (PR #3).

### Known limitations
- Agent sandbox's own egress lockdown (Layer 1 for agent-written code) still to constrain via the
  sandbox provider config (`docs/TRUEFORGE_INTEGRATION.md` §10).
- Approval "denied → not executed" proof and the full end-to-end Security Case need the model key.

---

## 2026-08-27 (later) — Qodo re-review of PR #3 (5 bugs + 5 rule violations) addressed

The HTTP transport widened the attack surface; Qodo caught real gaps. All 10 addressed:

- **[bug] System prompt parsed empty** — the `---` splitter dropped the whole body. Fixed the
  parser (take everything after the single separator) + guard that rejects an empty prompt.
- **[bug] Keyless setup couldn't create agent** — now the script skips agent creation entirely
  when no model is configured, and says so (matches the docs).
- **[bug] MCP endpoint exposed on all interfaces** — compose now publishes `127.0.0.1:8848:8848`
  (loopback only); transport enables DNS-rebinding Host validation.
- **[bug] Unbounded request body** — HTTP reader caps body size and returns 413 (drains, no
  socket reset).
- **[bug] Container ignored the lockfile** — Dockerfile now `COPY package-lock.json` + `npm ci`
  for reproducible builds.
- **[rule] Setup URLs allowed external hosts** — `TRUEFORGE_URL`/`MCP_URL` validated as loopback;
  external hosts refused with a clear message.
- **[rule] Sandbox egress unrestricted** — standalone TrueForge exposes no sandbox egress
  allowlist, so the agent sandbox is now **OFF by default** (`CRUCIBLE_ENABLE_SANDBOX=true` to opt
  in); with it off, all target interaction flows through the allowlisted, approval-gated `connect`.
  Documented in SECURITY_MODEL §3a + TRUEFORGE_INTEGRATION §10.
- **[rule] HTTP path bypassed approval / unauthenticated** — MCP endpoint now requires a bearer
  token (`CRUCIBLE_MCP_TOKEN`) sent via the connector's `auth: header`; only TrueForge can invoke
  the tools. (The human-approval decision itself remains TrueForge's, per D7/D14.)
- **[rule] Env vars undocumented** — added all six + `CRUCIBLE_MCP_TOKEN` to `.env.example`.
- **[rule] No E2E tests for the production path** — added `test/http.test.ts` exercising the real
  Streamable HTTP transport: bearer-token 401, tools/list, `connect` failing closed, and the 413
  body limit. (Full TrueForge-orchestration E2E — approval denial — still needs the harness+key.)

### Verification
- `npm test`: **31/31** (added 3 HTTP transport tests). Refactored `http.ts` to a testable
  `createHttpServer(opts)` factory.
- Rebuilt the container (`npm ci`): healthy, published on `127.0.0.1:8848` only. Unauthed request
  → **401**; authed `connect('web-01',5000)` → **connected: true**. Prompt parser → 2923 chars.
  External-host setup URL → refused.

### Current status
PR #3 hardened on `feature/trueforge-mcp-http-integration`. Push, let Qodo re-review, merge.
The only remaining live-run proofs (approval-denied blocks `connect`; full Security Case) need a
BYO model key.

---

## 2026-08-27 (later) — PR #3 merged; live-run attempt + submission materials

### Actions
- PR #3 merged to `main` (TrueForge integration). Drafted the README `## Qodo Code Review Evidence`
  section from the real PR #1–#3 findings (branch `feature/readme-qodo-evidence`).
- Attempted a live end-to-end Security Case against the Gemini agent via the TrueForge API
  (POST /sessions → /turns; approval via `user.tool_approval`). Verified all wiring dispatches:
  session created, turn accepted, agent + approval config live, MCP connector reachable.
- Wrote `SUBMISSION_WRITEUP.md` (what it does + how it uses TrueForge, load-bearing) and
  `docs/DEMO_SHOTLIST.md` (precise per-beat shot-list for the ~3-min video).

### Failure / unexpected result — model quota (external, on the key)
- The turn errored 429: Google Gemini **free tier `limit: 0`** for `gemini-3.1-pro`
  ("Quota exceeded ... generate_content_free_tier_requests, limit: 0"). Switched the provider +
  agent to `gemini-3.6-flash`; the flash turn then hung in retry with no output. Root cause: the
  API key has **no usable quota (billing not enabled)** on the Google project — not a Crucible bug.
- **Everything up to the model call is proven**: TrueForge dispatches the turn, the agent is
  configured with `require_approval_for_tools: ["connect"]` and sandbox off, and the MCP tools are
  reachable. The live autonomous run (approval pause firing, exploit, finding) needs a Gemini key
  with billing enabled, or another provider/key with quota.

### Fix / next
- User to enable billing on the Gemini API key (or use a key/provider with quota), then re-run the
  live case per `docs/DEMO_SHOTLIST.md` pre-flight. Model is already switched to `gemini-3-6-flash`.

### Current status
Product complete on `main`. Open PRs to merge: `feature/readme-qodo-evidence` (Qodo evidence) and
`feature/submission-materials` (write-up + shot-list). Remaining for submission: a Gemini key with
quota → record the ~3-min demo; the write-up is drafted.

---

## 2026-08-27 (later) — Setup-script fixes + OpenAI-compatible (Groq) support

### Actions
- Folded in two correct upstream fixes to `scripts/trueforge-setup.mjs`: model-provider POST now
  falls back to PUT on 409 (already exists); the agent is located by listing `/agents` and matching
  by name, then PUT by id (GET /agents/:name 404s).
- Added **OpenAI-compatible provider** support: `MODEL_BASE_URL` registers the provider as `custom`
  (type/name/base_url/auth/models), so Groq etc. work. Agent FQN = `<PROVIDER>/<MODEL_NAME>`.
- Trimmed agent config (`generative_ui`, `ask_user_questions`, `dynamic_sub_agents` = false) to keep
  per-request context lean on token-per-minute-limited tiers.
- Documented the Groq recipe + tier caveats in `.env.example` and `docs/TRUEFORGE_SETUP.md`.

### Verification / finding
- Groq wired via `custom` + `https://api.groq.com/openai/v1`: provider 201, agent 200 — reachable
  (real 404 for a bad model id, then real 413 for TPM). Listed the key's available models; used
  `openai/gpt-oss-120b`/`-20b`.
- **Live run blocked by Groq free tier: 8000 TPM**, request ~17k tokens → 413. Not a Crucible bug.
  Fix is external: Groq **Dev tier** (higher TPM), Gemini **billing** (free tier is `limit: 0`), or
  a provider/key with adequate limits. The full path is proven up to the model's rate limit.

### Current status
Setup-script + Groq support on `feature/setup-groq-support`. `.env` (with Gemini/Groq keys) remains
gitignored and untracked. Live demo still needs a model tier with enough TPM.

---

## 2026-08-27 (later) — Qodo review of PR #6 (setup-groq-support)

Qodo: 0 bugs, 2 Medium rule violations. Both addressed:
- **MODEL_BASE_URL allows external hosts** — the model provider endpoint is intentionally an
  external cloud API (not an arena target, never arena-constrained), but we now require it to be
  **https** (`assertModelBaseUrl`) so the key/prompts can't go over plaintext or to internal infra.
- **Custom provider lacks E2E tests** — extracted `buildModelManifest` + `assertModelBaseUrl` as
  pure exported helpers and added `mcp-server/test/setup-manifest.test.ts` (native vs custom/Groq
  manifest shapes; https-only validation). Guarded `main()` behind an import.meta check so the
  script is importable without side effects. Full suite 34/34.
---

## 2026-08-27 (later) — http_request tool: full end-to-end Security Case WORKS

### Objective
`connect` only proved TCP reachability, so the agent couldn't retrieve the flag. Add an
approval-gated tool that performs the real HTTP exploit and returns the response, completing the
recon → approval → exploit → flag → finding arc.

### Actions
- Added `mcp-server/src/tools/httpRequest.ts` — approval-gated `http_request`: same Layer-2
  allowlist as `connect` (fail-closed), connects to the PINNED IP (anti-rebinding, Host header =
  hostname), bounded response body, injectable fetcher. Registered in `index.ts` (6th tool,
  `destructiveHint`).
- Tests: `test/httpRequest.test.ts` (policy fail-closed, pinned-IP, honest failure, real-socket
  against a local server) + an MCP-level http_request test in `server.test.ts`. **36/36 pass.**
- Fixed a latent hang in `test/http.test.ts` teardown (`server.closeAllConnections()` before
  close) and updated tool-count assertions to 6.
- System prompt: step 6 now directs `http_request` with the web-01 login-bypass payload.
- Setup script: `require_approval_for_tools: ["connect","http_request"]`; connector description.

### Verification — LIVE, on free Gemini flash-lite quota
Rebuilt the MCP container (6 tools served), reconfigured `crucible-agent`
(`google-gemini/gemini-3-5-flash-lite`, approvals on connect+http_request, trimmed context), and
drove a real Security Case via the TrueForge API:
- recon (list_challenges → get_challenge web-01) → SQLi hypothesis
- `http_request` POST /login `username=admin'--&password=x` → **tool.approval_required → allow**
- response: `{"flag":"crucible{sqli_auth_bypass_web01}","ok":true}` (HTTP 200) — real exploit
- `submit_flag` → `{"correct":true,"points_awarded":100}`
- agent emitted the structured SECURITY FINDING (Authentication bypass (SQL Injection), HIGH).

### Model/quota notes
Gemini free tier: Pro is `limit: 0`, but **`gemini-3.5-flash-lite` runs on free quota** and has
enough TPM for this agent (unlike Groq free, 8000 TPM). Sandbox stays OFF.

### Current status
`feature/http-exploit-tool` (off main). Branch order to merge cleanly: readme-qodo-evidence,
submission-materials, setup-groq-support, then http-exploit-tool. Full build is functionally
COMPLETE — the demo now shows a captured flag, not just a controlled connect.
