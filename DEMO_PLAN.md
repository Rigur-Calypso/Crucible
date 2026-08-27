# DEMO_PLAN.md — The Crucible

> Operational per-beat shot-list (exact clicks/prompts/pre-flight): `docs/DEMO_SHOTLIST.md`.

~3-minute demo video. The demo is judged as hard as the code, and control & safety is "the
criterion nobody films" — so we film it. On-theme with the hackathon's Bond "License to act"
framing; our gate is the "License to Hack."

Keep this updated as the product evolves. The single rule: **everything shown must be real** —
real MCP calls, real sandbox execution, the real approval pause, a real controlled exploit, and
a real network-boundary rejection.

---

## Beat sheet

**0:00–0:20 — Problem.** An agent that does real security work is only safe if its code is
contained and it stops before acting. Show the architecture in one glance: TrueForge → Crucible
MCP → self-owned arena; note the sandbox and the approval gate.

**0:20–0:45 — Create a Security Case.** Point the agent at `web-01`. Case moves
`CREATED → INVESTIGATING`.

**0:45–1:20 — Autonomous investigation.** On screen: MCP tool calls (`list_challenges`,
`get_challenge`, `fetch_file`), the agent forming a vulnerability hypothesis, and the agent
writing a PoC and **running it in the TrueForge sandbox** to validate locally. Case:
`ANALYZING → HYPOTHESIS FORMED → POC READY`. No approval needed yet — that's the point.

**1:20–1:45 — Human approval ("License to Hack").** The agent has a validated PoC and wants to
execute it against the live target. TrueForge **pauses**: Case `AWAITING AUTHORIZATION`. Show the
policy evaluation so the pause reads as a *control*, then authorize:
```
⚠ authorization required · web-01:5000/login
  ✓ destination inside arena subnet (10.42.0.0/24)
  ✓ port 5000 permitted   ✓ sandbox egress restricted to arena
  ⧗ human authorization: PENDING          [ AUTHORIZE ] [ DENY ]
```

**1:45–2:10 — Controlled exploit + verification.** Authorize. The gated action runs against
`web-01`; the vulnerability is confirmed, the protected resource is accessed, the flag is
captured. Case: `AUTHORIZED → EXECUTING → VERIFIED`.

**2:10–2:30 — Network boundary proof.** Show the boundary *rejecting* an unsafe destination —
enforced in code, fails closed. This proves the allowlist is real, not a prompt:
```
⛔ BLOCKED   requested 8.8.8.8:443
   reason: outside the arena subnet
   policy: arena only (10.42.0.0/24), in code, fails closed
```

**2:30–2:50 — TrueForge capabilities.** Briefly surface what the harness did: MCP, sandbox,
approval, and (if built and reliable) a subagent hand-off and/or a session surviving a reconnect.

**2:50–3:00 — Security finding.** End on the generated finding (authentication bypass · HIGH ·
exploitability CONFIRMED · human approved), flag as evidence. Not "FLAG FOUND" — a finding.

## What must be visible on screen
- [ ] MCP tool calls in the agent-steps panel
- [ ] Code executing in the TrueForge sandbox
- [ ] The approval pause, then an explicit human authorize
- [ ] The controlled exploit succeeding against web-01
- [ ] The network boundary rejecting a non-arena destination
- [ ] The final security finding

## Reliability checklist (do before recording)
- [ ] Pin the demo model provider for determinism.
- [ ] Run the full web-01 path end-to-end several times; confirm it succeeds reliably.
- [ ] Confirm a *denied* approval provably blocks the action (worth showing, or at least testing).
- [ ] Record a backup take. Local arena + local TrueForge already removes most uptime risk.
- [ ] Keep all keys/secrets out of frame.

## Cut order if a beat is unreliable
Drop the TrueForge-extras beat (subagents/sessions) first, then trim investigation detail. Never
cut the approval pause, the controlled exploit, or the boundary rejection — those are the three
beats that win control & safety and presentation.
