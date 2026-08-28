/**
 * Tests for the gated-action audit log (src/audit/auditLog.ts) and its wiring into the MCP server.
 * Two layers:
 *   1. the JSONL sink writes parseable append-only lines, and env selects file-backed vs no-op;
 *   2. calling the gated tools through the real MCP server emits one audit event each, with the
 *      correct policy decision + outcome (blocked destination vs executed arena request).
 * Run: `npm test`.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../src/index.ts";
import {
  appendJsonlSink,
  createAuditSinkFromEnv,
  noopSink,
  type AuditEvent,
} from "../src/audit/auditLog.ts";

test("appendJsonlSink writes one parseable JSON line per event (append-only)", () => {
  const file = path.join(os.tmpdir(), `crucible-audit-${process.pid}-${Date.now()}.jsonl`);
  const sink = appendJsonlSink(file);
  const e1: AuditEvent = { ts: "t1", tool: "connect", host: "10.42.0.5", port: 5000, decision: "allowed", outcome: "executed", reason: "ok" };
  const e2: AuditEvent = { ts: "t2", tool: "http_request", host: "8.8.8.8", port: 5000, decision: "blocked", outcome: "blocked", reason: "outside arena" };
  sink(e1);
  sink(e2);
  try {
    const lines = readFileSync(file, "utf8").trim().split("\n");
    assert.equal(lines.length, 2);
    assert.deepEqual(JSON.parse(lines[0]!), e1);
    assert.deepEqual(JSON.parse(lines[1]!), e2);
  } finally {
    rmSync(file, { force: true });
  }
});

test("createAuditSinkFromEnv is no-op without CRUCIBLE_AUDIT_LOG, file-backed with it", () => {
  assert.equal(createAuditSinkFromEnv({}), noopSink);
  const file = path.join(os.tmpdir(), `crucible-audit-env-${process.pid}-${Date.now()}.jsonl`);
  const sink = createAuditSinkFromEnv({ CRUCIBLE_AUDIT_LOG: file });
  assert.notEqual(sink, noopSink);
});

async function connectedClient(options: Parameters<typeof createServer>[0] = {}): Promise<Client> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createServer(options);
  const client = new Client({ name: "test", version: "0.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

test("a BLOCKED connect emits an audit event with decision=blocked, outcome=blocked", async () => {
  const events: AuditEvent[] = [];
  const client = await connectedClient({ audit: (e) => events.push(e) });
  await client.callTool({ name: "connect", arguments: { host: "8.8.8.8", port: 5000 } });
  await client.close();
  assert.equal(events.length, 1);
  assert.equal(events[0]!.tool, "connect");
  assert.equal(events[0]!.decision, "blocked");
  assert.equal(events[0]!.outcome, "blocked");
  assert.equal(events[0]!.host, "8.8.8.8");
});

test("an executed http_request against the arena emits decision=allowed, outcome=executed", async () => {
  const events: AuditEvent[] = [];
  const client = await connectedClient({
    audit: (e) => events.push(e),
    fetcher: async () => ({ status: 200, body: '{"ok":true,"flag":"crucible{sqli_auth_bypass_web01}"}', truncated: false }),
  });
  await client.callTool({
    name: "http_request",
    arguments: { host: "10.42.0.5", port: 5000, method: "POST", path: "/login", body: "username=admin'--&password=x" },
  });
  await client.close();
  assert.equal(events.length, 1);
  assert.equal(events[0]!.tool, "http_request");
  assert.equal(events[0]!.decision, "allowed");
  assert.equal(events[0]!.outcome, "executed");
  assert.equal(events[0]!.method, "POST");
  assert.equal(events[0]!.path, "/login");
  assert.equal(events[0]!.target, "10.42.0.5:5000");
});

test("read-only tools do not emit audit events (only the gated tools are logged)", async () => {
  const events: AuditEvent[] = [];
  const client = await connectedClient({ audit: (e) => events.push(e) });
  await client.callTool({ name: "list_challenges", arguments: {} });
  await client.callTool({ name: "submit_flag", arguments: { challenge_id: "web-01", flag: "crucible{nope}" } });
  await client.close();
  assert.equal(events.length, 0);
});
