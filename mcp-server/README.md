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
register with explicit zod input schemas and are served over stdio (`src/index.ts`); every tool
sets MCP `isError` on failure. `fetch_file` reads real file content (base64) with a symlink-escape
guard. `connect` performs **real TCP I/O** to the pinned resolved IP after the policy check, and
reports the true outcome (`connected: true/false`) — it no longer reports success without acting.
Tests exercise the real SDK request path plus real-socket open/refuse.

Remaining, deployment-level (`[verify in impl]`): the MCP server must be **attached to the internal
arena network** for `connect` to actually reach arena targets by hostname/IP (until then an allowed
arena IP is unreachable from the host and `connect` honestly reports `connected: false`), and
`connect` must be marked approval-required on the agent. See `../docs/TRUEFORGE_INTEGRATION.md`
§2–3 and `../docs/SECURITY_MODEL.md` §3a.
