# Demo Shot-List — The Crucible (~3 min)

Operational companion to `DEMO_PLAN.md`: exact pre-flight, clicks, prompts, and what must be on
screen per beat, tailored to the TrueForge chat UI + the `crucible-agent` (Gemini). **Everything
shown is real.** Record at 1440p+, hide the terminal that holds `CRUCIBLE_MCP_TOKEN` / the API key.

---

## Pre-flight (before you hit record)

1. **Model with quota.** Use a Gemini key with billing enabled (free tier is `limit: 0` and 429s).
   `MODEL_ID=gemini-3.6-flash` is fast and cheap for the demo. Confirm one full run succeeds first.
2. **Bring up the stack:**
   ```
   export CRUCIBLE_MCP_TOKEN=$(openssl rand -hex 32)
   docker compose -f arena/docker-compose.yml up -d --build --wait
   bash arena/verify-arena.sh            # expect 7/7 — keep this terminal for Beat 5
   npx @truefoundry/trueforge            # http://localhost:8790
   TF_MODEL_API_KEY=<key> MODEL_PROVIDER=google-gemini \
     MODEL_ID=gemini-3.6-flash MODEL_NAME=gemini-3-6-flash node scripts/trueforge-setup.mjs
   ```
3. **Dry-run the whole case 2–3×** and confirm: recon tools fire, the agent pauses on `connect`,
   allow → flag, and a denied approval blocks execution. Have a **backup recording**.
4. Open two things: the **TrueForge chat UI** (main), and the **`verify-arena.sh` output** (for the
   boundary/Layer-1 beat). Font size up; clear old sessions.

---

## Beat sheet (timecodes are targets)

### 0:00–0:20 — Problem + architecture (1 slide or the README diagram)
- **Say:** "An agent that runs real exploit code is only safe if its code is contained and it stops
  before acting. The Crucible does both."
- **Show:** the one-glance architecture — TrueForge → Crucible MCP → self-owned arena; call out the
  two controls: the **approval gate** and the **in-code network allowlist**.

### 0:20–0:45 — Start a Security Case
- **Do:** in the chat UI, select **`crucible-agent`**, paste the assignment verbatim:
  > *"Investigate web-01 and determine whether authentication can be bypassed. Investigate freely,
  > but ask me before you execute anything against the live target."*
- **On screen:** the case begins; agent-steps panel starts streaming.

### 0:45–1:20 — Autonomous investigation (no approval needed — that's the point)
- **On screen (agent-steps panel):** real MCP tool calls in order —
  `list_challenges` → `get_challenge` (→ optionally `fetch_file` for the briefing) — then the agent
  stating a **hypothesis**: the login is injectable → auth bypass via `admin'--`.
- **Say:** "All of this is read-only recon and analysis — it runs autonomously."

### 1:20–1:45 — 🛑 Human approval ("License to Hack")  ← the money shot
- **On screen:** the agent decides to hit the live target and calls **`connect`** →
  TrueForge **pauses** with an approval prompt (**Allow / Deny**). The case is `AWAITING
  AUTHORIZATION`. Point at it.
- **Say:** "This is TrueForge's real approval gate — the agent physically cannot proceed until I
  authorize. This is the only step that touches the live target."
- **Do:** click **Allow**.

### 1:45–2:10 — Controlled exploit + verification
- **On screen:** `connect` opens a real socket to `web-01` (10.42.0.5:5000); the SQLi payload lands;
  the protected resource / flag comes back; the agent calls `submit_flag` → `correct: true`.
- **Say:** "Authorized, executed, exploit confirmed, flag captured as evidence."

### 2:10–2:30 — Network boundary proof (safety, enforced in code)
- **Do:** cut to the terminal and either (a) show the `verify-arena.sh` output where a container on
  the arena network **can't** reach `example.com` / `8.8.8.8` (Layer 1), **or** (b) in a second chat
  turn ask the agent to reach an off-arena host and show `connect` returning **blocked / fail-closed**
  (Layer 2).
- **Say:** "The allowlist is enforced in code and fails closed — this isn't a prompt instruction."
- *(Optional, powerful):* start a fresh case, and at the approval prompt click **Deny** — show the
  action does **not** execute. "Denied means denied."

### 2:30–2:50 — TrueForge capabilities (quick montage)
- **Say + show:** MCP tool calls, the approval pause, the session in the UI — "the harness ran the
  loop, routed the tools, and enforced the gate. Remove TrueForge and this stops working."
- *(Only if built & reliable:)* a subagent hand-off and/or a session surviving a refresh.

### 2:50–3:00 — The security finding (the close)
- **On screen:** the agent's final structured finding —
  `Authentication bypass · HIGH · Exploitability CONFIRMED · Execution: TrueForge · Authorization:
  Human Approved · FLAG CAPTURED`.
- **Say:** "Not 'flag found' — a security finding. The flag is just the evidence."

---

## Must be visible on screen (checklist)
- [ ] Real MCP tool calls in the agent-steps panel (`list_challenges` / `get_challenge` / …)
- [ ] The approval pause on `connect`, then an explicit human **Allow**
- [ ] The controlled exploit succeeding against `web-01` and the flag returned
- [ ] The network boundary rejecting a non-arena destination (Layer 1 and/or Layer 2)
- [ ] The final security-finding card

## Cut order if a beat is flaky
Drop the TrueForge-extras montage (subagents/sessions) first, then trim investigation detail.
**Never cut:** the approval pause, the controlled exploit, the boundary rejection — those three win
control-&-safety and presentation.

## Narration one-liners (steal these)
- "The agent has hands only through our MCP tools — nothing else."
- "It stops itself before the one action that matters, and waits for a human."
- "The boundary is code that fails closed, not a sentence in a prompt."
- "The output is a finding, not a game score."
