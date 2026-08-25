# Crucible MCP Server

The only sanctioned path from the agent to the self-owned arena. Exposes five tools to
TrueForge over MCP: `list_challenges`, `get_challenge`, `fetch_file`, `submit_flag`, `connect`.

## The security-critical part
`src/policy/networkPolicy.ts` enforces the arena allowlist **in code** (Layer 2 of the boundary,
see `../docs/SECURITY_MODEL.md`). It fails closed and is covered by `test/networkPolicy.test.ts`.
`connect` is the single approval-gated action and must connect to the *pinned resolved IP*, never
re-resolve (anti-DNS-rebinding).

> Judges / reviewers: the allowlist lives in `src/policy/networkPolicy.ts` (`ARENA_CIDRS_V4`).
> That constant must match the arena subnet in `../arena/docker-compose.yml`.

## Run
```
npm install
npm run typecheck  # tsc strict + noUncheckedIndexedAccess
npm test        # network-policy fail-closed tests + in-process MCP integration tests
npm start       # serve the five tools over stdio (the transport TrueForge connects to)
```

## Status
Wired to the official MCP TypeScript SDK (`@modelcontextprotocol/sdk` v1.30.x). All five tools
register with explicit zod input schemas and are served over stdio (`src/index.ts`); the
integration tests in `test/server.test.ts` exercise the real SDK request path (registration,
server-side flag validation, `connect` failing closed, `fetch_file` traversal rejection).

Remaining wiring is isolated to `connect`: opening the proxied socket to the pinned resolved IP
**through the TrueForge sandbox**, and marking `connect` approval-required on the agent. The
allowlist decision (Layer 2) already runs and fails closed today; only the socket hand-off to the
sandbox is pending (`[verify in impl]`, see `../docs/TRUEFORGE_INTEGRATION.md` §2–3).
