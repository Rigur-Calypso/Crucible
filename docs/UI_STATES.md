# UI States — the Security Case view

Goal for the Best UI criterion: a stranger can see what the agent is doing, what it's waiting on,
and what it did — and the approval happens *before* the sensitive step, visibly. Prefer reskinning
TrueForge's UI SDK (`@truefoundry/trueforge-ui`) over building a bespoke dashboard; the bundled
agent-steps panel already shows reasoning, tool calls, and subagents.

Every state below must reflect **real harness state** — no cosmetic mock-ups.

## Case lifecycle → what the UI shows
```
CREATED             case header: id, target, "created"
INVESTIGATING       recon steps stream in (list_challenges, get_challenge, fetch_file)
ANALYZING           evidence list builds; hypothesis drafted
HYPOTHESIS FORMED   hypothesis pinned with its supporting evidence
POC READY           PoC generated; sandbox test result shown (local, no approval)
AWAITING AUTH  🛑    approval panel (below) — the agent is blocked here
AUTHORIZED          "authorized by <user>"; action proceeds
EXECUTING           the gated action runs against the target
VERIFIED            protected resource / flag shown as proof
REPORT GENERATED    the security finding card (see docs/../ PRD §8)
```

## Approval panel (the "License to Hack" moment)
Show the policy evaluation, so the pause reads as a *control*, not a dialog:
```
⚠ SECURITY-SENSITIVE ACTION — authorization required

Case #0042 · Target: web-01
Action: send validated PoC to  web-01:5000/login

Policy evaluation
  ✓ destination resolves inside arena subnet (10.42.0.0/24)
  ✓ port 5000 permitted
  ✓ sandbox egress restricted to arena
  ⧗ human authorization: PENDING

        [ AUTHORIZE ]      [ DENY ]
```

## Boundary-block panel (the safety proof)
When the network policy rejects a destination, surface *why* — this is the control-and-safety
evidence:
```
⛔ CONNECTION BLOCKED

Requested: 8.8.8.8:443
Reason:    outside the arena subnet
Policy:    arena only (10.42.0.0/24), enforced in code, fails closed
```

## Finding card (the close)
Render the security finding (finding, severity, evidence, exploitability CONFIRMED, target,
execution = TrueForge sandbox, authorization = human approved, flag as evidence). This is the
last thing the judge sees — make it read like security-validation software.

## Minimum viable UI (if time is short)
The bundled TrueForge chat UI + a single well-formatted finding card already covers most of the
criterion. The custom Security Case timeline is an enhancement, not a prerequisite.
