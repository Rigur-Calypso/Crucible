# Challenge Design — web-01 (flagship)

web-01 is the demo. Its single job is to be **reliably solvable by the agent on camera** while
still being a real vulnerability. Reliability here is a feature, not a compromise.

## The vulnerability (deliberate)
A login endpoint builds its SQL by string interpolation:

```
SELECT role FROM users WHERE username = '<username>' AND password = '<password>'
```

There is one user (`admin`) with an unguessable password. The intended solve is a classic
authentication bypass via SQL injection — e.g. username `admin'--` (comment out the password
check) or `' OR '1'='1' -- `. On success the app returns the flag.

## Why this is the right flagship
- **Deterministic.** No randomness, no timing, no rate limits, no external calls. The same input
  always produces the same result, so the agent's run is repeatable.
- **Unambiguous vulnerability class.** It maps cleanly to a single finding (authentication
  bypass, HIGH), which makes the security finding crisp.
- **A clear autonomy/approval split.** Recon and reading `/challenge.json` are read-only and
  autonomous; sending the injection payload to `/login` is the security-sensitive action that
  trips the approval gate. That split is exactly the story the demo tells.

## Intended solve path (what the agent should do)
1. `list_challenges` → `get_challenge` (or fetch `/challenge.json`) to learn the endpoint.
2. Hypothesis: the login form is injectable → authentication bypass possible.
3. Generate a PoC (a small HTTP request with the injection payload) and dry-run its shape in the
   sandbox.
4. **Request authorization** to send it to the live target.
5. On approval, send it, receive the flag, verify, and report.

## Anti-flakiness checklist (do before the demo)
- [ ] Keep error responses stable and non-random (fixed status codes and bodies).
- [ ] No login throttling / lockouts / captchas.
- [ ] Fresh in-memory DB per request so state can't drift between runs.
- [ ] Flag returned only on genuine admin auth, and validated server-side by `submit_flag`.
- [ ] Run the full agent path end-to-end several times and confirm consistent success.
- [ ] Pin the model used for the demo.

## Difficulty tuning
If the agent overshoots (tries elaborate exploits), make the hint in `get_challenge` point at the
login form. If it under-attempts, ensure the description frames it as an authentication task.
Tune the prompt/hints, not the vulnerability — the bug stays simple and deterministic.

## Explicitly out of scope for web-01
No second-order injection, no blind/time-based variants, no WAF. Those add flakiness for zero
demo value. Keep web-01 the clean, reliable centerpiece; save cleverness for optional challenges.
