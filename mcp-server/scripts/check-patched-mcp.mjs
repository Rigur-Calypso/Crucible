#!/usr/bin/env node
/**
 * check-patched-mcp.mjs — proves the differential THROUGH THE PRODUCTION CRUCIBLE PATH (MCP →
 * policy → HTTP → arena), not just at the target level. Fires the identical login-bypass payload
 * (username=admin'--) at both twins via the `http_request` tool over the real MCP endpoint and
 * asserts opposite outcomes:
 *   1. web-01          → the flag is returned            (EXPLOITABLE via the Crucible path)
 *   2. web-01-patched  → NO flag, non-2xx login response (NOT exploitable via the Crucible path)
 *
 * This is the counterpart to check-http-request.mjs and closes the gap Qodo flagged: the "The
 * Crucible validates, not pattern-matches" claim is backed by the policy-enforced tool, not only a
 * direct request. The HUMAN approval gate is a TrueForge-side control (upstream of this endpoint,
 * per docs/SECURITY_MODEL.md); this pre-flight check exercises the tool + policy path only and does
 * not claim to exercise the human gate. Exit 0 on success, 1 on failure. Used by verify-differential.sh.
 *
 * Env: MCP_URL (default http://127.0.0.1:8848/mcp), CRUCIBLE_MCP_TOKEN (bearer, if required).
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

const inject = (client, host) =>
  client.callTool({
    name: "http_request",
    arguments: { host, port: 5000, method: "POST", path: "/login", body: "username=admin'--&password=x" },
  });

const transport = new StreamableHTTPClientTransport(new URL(URL_), { requestInit: { headers } });
const client = new Client({ name: "differential-mcp-check", version: "0.0.0" });
try {
  await client.connect(transport);

  // 1. Vulnerable twin: the same payload must capture the flag through the tool path.
  const vuln = await inject(client, "web-01");
  const flag = /crucible\{[^}]+\}/.exec(textOf(vuln))?.[0];
  if (flag) pass(`web-01 via http_request: flag returned (EXPLOITABLE): ${flag}`);
  else fail(`web-01 via http_request did not return a flag: ${textOf(vuln).slice(0, 160)}`);

  // 2. Patched twin: the identical payload must NOT yield a flag through the same tool path.
  const patched = await inject(client, "web-01-patched");
  const patchedText = textOf(patched);
  const leaked = /crucible\{[^}]+\}/.test(patchedText);
  let status;
  try {
    status = JSON.parse(patchedText).status;
  } catch {
    status = undefined;
  }
  if (leaked) {
    fail(`web-01-patched via http_request LEAKED a flag — patch ineffective: ${patchedText.slice(0, 160)}`);
  } else if (status !== undefined && status >= 200 && status < 300) {
    fail(`web-01-patched via http_request unexpectedly authenticated (HTTP ${status}) the injection`);
  } else {
    pass(`web-01-patched via http_request: no flag, login rejected (HTTP ${status ?? "?"}) (NOT exploitable)`);
  }
} catch (err) {
  fail(`could not exercise the differential over MCP: ${err instanceof Error ? err.message : String(err)}`);
} finally {
  await client.close().catch(() => {});
}

process.exit(ok ? 0 : 1);
