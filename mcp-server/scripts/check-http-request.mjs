#!/usr/bin/env node
/**
 * check-http-request.mjs — exercises the `http_request` MCP tool against the running arena, over
 * the real MCP endpoint (the production path: MCP → policy → HTTP → arena). Asserts:
 *   1. the login-bypass exploit (POST /login, username=admin'--) returns the flag, and
 *   2. a non-arena destination is BLOCKED (fail-closed).
 * Exit 0 on success, 1 on failure. Used by arena/verify-arena.sh.
 *
 * Env: MCP_URL (default http://127.0.0.1:8848/mcp), CRUCIBLE_MCP_TOKEN (bearer, if the endpoint
 * requires auth).
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const URL_ = process.env.MCP_URL ?? "http://127.0.0.1:8848/mcp";
const TOKEN = process.env.CRUCIBLE_MCP_TOKEN ?? "";
const headers = TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {};

const textOf = (r) => r?.content?.[0]?.text ?? "";
const pass = (m) => console.log(`  \x1b[32mPASS\x1b[0m ${m}`);
const fail = (m) => {
  console.log(`  \x1b[31mFAIL\x1b[0m ${m}`);
  ok = false;
};
let ok = true;

const transport = new StreamableHTTPClientTransport(new URL(URL_), { requestInit: { headers } });
const client = new Client({ name: "arena-http-check", version: "0.0.0" });
try {
  await client.connect(transport);

  const exploit = await client.callTool({
    name: "http_request",
    arguments: { host: "web-01", port: 5000, method: "POST", path: "/login", body: "username=admin'--&password=x" },
  });
  const flag = /crucible\{[^}]+\}/.exec(textOf(exploit))?.[0];
  if (flag) pass(`http_request exploit (POST /login, admin'--) returned the flag: ${flag}`);
  else fail(`http_request exploit did not return a flag: ${textOf(exploit).slice(0, 140)}`);

  const blocked = await client.callTool({
    name: "http_request",
    arguments: { host: "8.8.8.8", port: 443, method: "GET", path: "/" },
  });
  if (blocked.isError) pass("http_request blocked a non-arena destination (fail-closed)");
  else fail(`http_request did NOT block 8.8.8.8: ${textOf(blocked).slice(0, 140)}`);
} catch (err) {
  fail(`could not exercise http_request over MCP: ${err instanceof Error ? err.message : String(err)}`);
} finally {
  await client.close().catch(() => {});
}

process.exit(ok ? 0 : 1);
