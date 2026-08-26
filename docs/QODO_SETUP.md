# Qodo Setup & Review Workflow — The Crucible

Qodo review is a **mandatory eligibility gate for every hackathon submission** (not just the code
-quality track). This guide takes you from "empty repo" to "a merged PR with a Qodo review trail
and the README evidence the judges require." Do it once at the start, then follow the per-PR
workflow for the rest of the week.

Product note: the PR-review agent is **Qodo Merge** (formerly CodiumAI PR-Agent). Menu labels and
slash-command names occasionally change; where this guide names a UI path or command, confirm it
against the current Qodo dashboard / the app's PR comment help. The load-bearing steps don't
change: install the GitHub app on this repo, let it review each PR, act on findings, record the
evidence.

---

## 0. Prerequisites (already true in this repo)
- Code is on GitHub: `github.com/Rigur-Calypso/Crucible`, branches `main` (baseline) and
  `feature/project-foundation` (PR #1 content).
- Direct pushes to `main` are not used — every change lands via a reviewed PR. (Hard rule; see
  `../CLAUDE.md`.)
- The README already contains the required `## Qodo Code Review Evidence` section (skeleton to
  fill in after your first real review).

---

## 1. Install Qodo Merge on the repo (one-time)
1. Go to **qodo.ai** and sign in with the **GitHub account that owns / admins `Rigur-Calypso`**
   (so you can grant repo access). This is the team's single install — one per team.
2. Open **Qodo → Integrations → SaaS → GitHub → Add installation** (the GitHub App install flow).
3. When GitHub asks which repositories to grant, choose **Only select repositories → `Crucible`**
   (least privilege — don't grant all repos).
4. Approve. The 14-day trial needs **no credit card**.
5. Back in Qodo, confirm `Rigur-Calypso/Crucible` shows as a connected repository.

> Least-privilege: grant Qodo access to just this repo. Don't paste any API key into the repo or
> the demo — Qodo is authorized through the GitHub App, not a committed secret.

---

## 2. Open PR #1 so Qodo has something to review
Qodo Merge reviews **pull requests**, so it needs an open PR. Open PR #1 now:

```
https://github.com/Rigur-Calypso/Crucible/pull/new/feature/project-foundation
```
- **Base:** `main`  ·  **Compare:** `feature/project-foundation`
- Suggested title: *Foundation: arena web-01, MCP server, two-layer security boundary + tests*
- In the body, point Qodo at the security-critical surface (see §4).

Once the PR is open, Qodo Merge should post a review automatically. If it doesn't within a couple
of minutes, trigger it from a **PR comment** (§3).

---

## 3. Triggering & driving a review (PR comment commands)
Qodo Merge is driven by comments on the PR. Common commands (confirm exact names in the app's
`/help`):
- `/review` — post/refresh the structured review (issues, security, tests).
- `/describe` — auto-generate a PR description/walkthrough.
- `/improve` — concrete code-improvement suggestions.
- `/ask <question>` — ask about the diff (e.g. *"is the connect allowlist bypassable?"*).
- `/agentic_review` — the repo's verified fallback to kick a **stalled** review.

After you push fixes to the branch, comment `/review` again to get a **follow-up review of the
final code** — that second pass is part of the evidence the judges want to see.

---

## 4. Point the review at what matters (this project)
In the PR description or an `/ask`, direct Qodo at the security-critical files so the review is
high-signal:
- `mcp-server/src/policy/networkPolicy.ts` — SSRF/DNS-rebinding, IP/port validation, **fail-closed**
  behavior, alternate-encoding rejection.
- `mcp-server/src/tools/fetchFile.ts` — path traversal, symlink escape, ownership checks.
- `mcp-server/src/tools/submitFlag.ts` — server-side (constant-time) flag validation.
- `mcp-server/src/index.ts` — MCP result/error shaping, input-schema coverage.
- `arena/docker-compose.yml` + `arena/verify-arena.sh` — arena network isolation (Layer 1).

A too-permissive `connect` allowlist or an un-contained sandbox is a **P0** (see
`SECURITY_MODEL.md` §8).

---

## 5. Review discipline (the rule you must follow)
- **Fix every valid High finding**, *or* **dismiss it in the Qodo thread with a recorded reason**
  (a one-line justification in the PR comment). Never silently ignore a High.
- **Medium / Low** are engineering judgment — address or note them, your call.
- **Re-run** `/review` after pushing fixes so the trail shows: initial review → your decisions →
  follow-up review of the final code.
- **Merge only after** the review is complete and Highs are resolved/justified. Merge the PR on
  GitHub (squash or merge-commit is fine); do not push to `main` directly.

---

## 6. Capture the README evidence (required to submit)
After PR #1 is reviewed and merged, fill the `## Qodo Code Review Evidence` section in
`../README.md` with **real** content:
- **Representative reviewed PR:** the public URL of the merged PR
  (e.g. `https://github.com/Rigur-Calypso/Crucible/pull/1`).
- **What Qodo surfaced and what we did:** 1–2 sentences on a concrete finding and the change you
  made (or why you dismissed it, linking the thread).
- **Review trail:** note that the PR history shows the initial review, your decisions, and the
  follow-up review of the final code.

This section + a public merged PR link is the literal artifact the judges check. See
`../SUBMISSION_CHECKLIST.md`.

---

## 7. Per-PR workflow for the rest of the week
For each milestone (per `../PRD.md` §10 PR sequence):
1. Branch: `feature/<component>-<desc>` off `main`.
2. Implement + test; run `npm test` (mcp-server) and `bash arena/verify-arena.sh` where relevant.
3. Push the branch; open a PR into `main`.
4. Let Qodo review; fix Highs or justify dismissals; `/review` again after fixes.
5. Merge after review. Keep the security-boundary PR (Layer 1 + Layer 2 hardening) as the
   dedicated **Qodo-focus PR**.

---

## 8. Troubleshooting
- **No review appeared:** confirm the GitHub App is installed on `Crucible` (GitHub → Settings →
  Applications → Installed GitHub Apps), the PR targets `main`, then comment `/review` or
  `/agentic_review`.
- **"Command not recognized":** check the app's `/help` on the PR for the current command names.
- **Trial/seat limits:** one install per team; if you hit a seat limit, ensure only the owner
  account installed it.
- **Private repo:** Qodo needs the App granted on this specific repo; re-check the repository
  selection in the install flow.
