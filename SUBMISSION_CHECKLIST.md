# Submission Checklist — The Crucible

Every item maps to a current hackathon rule (verified 2026-08-25). Deadline: **Sun Aug 30,
8:00 PM London**. A team can win only ONE judged track; Qodo review is required of EVERY
submission.

## Eligibility & build
- [ ] Team is solo or ≤4 people; each person on only one team.
- [ ] All coding/design done during the window (Aug 24 08:00 London → Aug 30 20:00 London).
      Pre-event planning/architecture/diagrams are allowed; the build is not.
- [ ] Only self-owned/authorized resources are touched (the arena). No third-party targets.
- [ ] No keys, secrets, personal, or login-protected data in the repo OR the demo video.

## Must be in the submission
- [ ] Public, open-source repository a stranger can read and run.
- [ ] README with working setup steps.
- [ ] `## Qodo Code Review Evidence` section in the README:
      - [ ] link to ≥1 representative **merged** PR with meaningful hackathon code
      - [ ] 1–2 sentences on what Qodo surfaced and what you changed or intentionally dismissed
      - [ ] PR history showing the review, your decisions, and a follow-up review of the final code
- [ ] ~3-minute demo video showing the agent working (harness visibly doing real work).
- [ ] Short write-up: what the agent does and how it uses TrueForge.
- [ ] Blog post link (only if entering that prize).

## TrueForge requirement (Best Use of TrueForge — our differentiation)
- [ ] Agent runs on TrueForge; a judge can see it doing real work, not a thin wrapper.
- [ ] Visible in the demo: a real MCP tool call, code running in the sandbox, and a pause for
      human approval before the sensitive action.
- [ ] (Bonus, only if reliable) a subagent hand-off and/or a session surviving a reconnect.

## Qodo requirement (mandatory for all submissions)
- [ ] Qodo installed on the repo at project start (Integrations → SaaS → GitHub → Add installation).
- [ ] Every substantive change went through a reviewed PR; no direct pushes to `main`.
- [ ] Every valid High finding fixed, or dismissed in-thread with a recorded reason.
- [ ] Follow-up review run after fixes.

## AI-use & understanding
- [ ] README discloses AI coding-assistant use (Claude Code / Claude).
- [ ] The team understands the submitted code and can explain the agent, architecture, and key
      technical decisions. (Projects that are wholly AI-generated without real participant
      understanding may be rejected.)

## Safety evidence (control & safety criterion)
- [ ] Network boundary enforced in code, fails closed, with passing tests
      (docs/SECURITY_MODEL.md §6) — both layers proven.
- [ ] The demo shows the boundary rejecting an out-of-arena destination.
