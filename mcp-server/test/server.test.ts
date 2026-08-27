/**
 * Integration tests for the wired MCP server (src/index.ts). These exercise the real
 * @modelcontextprotocol/sdk request path in-process (no child process) via a linked in-memory
 * transport pair, so they cover tool registration, schemas, and result shaping — not just the
 * pure tool functions.
 *
 * Run: `npm test`.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../src/index.ts";

async function connectedClient(
  options: Parameters<typeof createServer>[0] = {},
): Promise<Client> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createServer(options);
  const client = new Client({ name: "test", version: "0.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

function textOf(result: unknown): string {
  const content = (result as { content?: Array<{ text?: string }> }).content;
  return content?.[0]?.text ?? "";
}

test("registers exactly the six Crucible tools", async () => {
  const client = await connectedClient();
  const { tools } = await client.listTools();
  assert.deepEqual(
    tools.map((t) => t.name).sort(),
    ["connect", "fetch_file", "get_challenge", "http_request", "list_challenges", "submit_flag"],
  );
  await client.close();
});

test("http_request over MCP: blocked destination is isError; arena request returns the flag", async () => {
  const client = await connectedClient({
    fetcher: async (a) =>
      a.path === "/login"
        ? { status: 200, body: '{"ok":true,"flag":"crucible{sqli_auth_bypass_web01}"}', truncated: false }
        : { status: 404, body: "", truncated: false },
  });
  const blocked = await client.callTool({
    name: "http_request",
    arguments: { host: "8.8.8.8", port: 5000, method: "GET", path: "/" },
  });
  assert.equal(blocked.isError, true);

  const exploit = await client.callTool({
    name: "http_request",
    arguments: { host: "10.42.0.5", port: 5000, method: "POST", path: "/login", body: "username=admin'--&password=x" },
  });
  assert.notEqual(exploit.isError, true);
  assert.match(textOf(exploit), /crucible\{sqli_auth_bypass_web01\}/);
  await client.close();
});

test("list_challenges returns arena metadata", async () => {
  const client = await connectedClient();
  const res = await client.callTool({ name: "list_challenges", arguments: {} });
  assert.match(textOf(res), /web-01/);
  await client.close();
});

test("submit_flag validates the correct flag server-side and rejects a wrong one", async () => {
  const client = await connectedClient();
  const ok = await client.callTool({
    name: "submit_flag",
    arguments: { challenge_id: "web-01", flag: "crucible{sqli_auth_bypass_web01}" },
  });
  assert.match(textOf(ok), /"correct": true/);
  const bad = await client.callTool({
    name: "submit_flag",
    arguments: { challenge_id: "web-01", flag: "crucible{nope}" },
  });
  assert.match(textOf(bad), /"correct": false/);
  await client.close();
});

test("connect FAILS CLOSED on a non-arena destination and flags an error", async () => {
  const client = await connectedClient();
  const res = await client.callTool({ name: "connect", arguments: { host: "8.8.8.8", port: 5000 } });
  assert.equal(res.isError, true);
  assert.match(textOf(res), /outside the arena subnet/);
  await client.close();
});

test("connect: allowed + reachable → opens a real socket to the PINNED ip and succeeds", async () => {
  const seen: Array<{ ip: string; port: number }> = [];
  const client = await connectedClient({
    connector: async (ip, port) => {
      seen.push({ ip, port });
    }, // resolves = connection succeeds
  });
  const res = await client.callTool({ name: "connect", arguments: { host: "10.42.0.5", port: 5000 } });
  assert.notEqual(res.isError, true);
  assert.match(textOf(res), /"connected": true/);
  assert.match(textOf(res), /"target": "10.42.0.5:5000"/);
  assert.deepEqual(seen, [{ ip: "10.42.0.5", port: 5000 }]); // connected to the pinned IP
  await client.close();
});

test("connect: allowed but UNREACHABLE → honest failure, not a false success", async () => {
  const client = await connectedClient({
    connector: async () => {
      throw new Error("ECONNREFUSED");
    },
  });
  const res = await client.callTool({ name: "connect", arguments: { host: "10.42.0.5", port: 5000 } });
  assert.equal(res.isError, true);
  assert.match(textOf(res), /connection failed/);
  await client.close();
});

test("connect: a BLOCKED destination never invokes the connector", async () => {
  let called = false;
  const client = await connectedClient({
    connector: async () => {
      called = true;
    },
  });
  const res = await client.callTool({ name: "connect", arguments: { host: "8.8.8.8", port: 5000 } });
  assert.equal(res.isError, true);
  assert.match(textOf(res), /outside the arena subnet/);
  assert.equal(called, false); // policy denial short-circuits before any I/O
  await client.close();
});

test("fetch_file rejects path traversal and flags isError", async () => {
  const client = await connectedClient();
  const res = await client.callTool({
    name: "fetch_file",
    arguments: { challenge_id: "web-01", filename: "../../etc/passwd" },
  });
  assert.match(textOf(res), /path traversal rejected/);
  assert.equal(res.isError, true);
  await client.close();
});

test("fetch_file reads a real challenge artifact and returns base64 content", async () => {
  const client = await connectedClient();
  const res = await client.callTool({
    name: "fetch_file",
    arguments: { challenge_id: "web-01", filename: "briefing.txt" },
  });
  assert.notEqual(res.isError, true);
  const text = textOf(res);
  assert.match(text, /"encoding": "base64"/);
  const parsed = JSON.parse(text) as { content: string };
  const decoded = Buffer.from(parsed.content, "base64").toString("utf8");
  assert.match(decoded, /investigator briefing/);
  await client.close();
});

test("fetch_file refuses an unknown challenge before any read (ownership check)", async () => {
  const client = await connectedClient();
  const res = await client.callTool({
    name: "fetch_file",
    arguments: { challenge_id: "not-a-real-challenge", filename: "briefing.txt" },
  });
  assert.equal(res.isError, true);
  assert.match(textOf(res), /unknown challenge/);
  await client.close();
});

test("fetch_file flags isError for a missing file", async () => {
  const client = await connectedClient();
  const res = await client.callTool({
    name: "fetch_file",
    arguments: { challenge_id: "web-01", filename: "does-not-exist.bin" },
  });
  assert.equal(res.isError, true);
  assert.match(textOf(res), /not found/);
  await client.close();
});

test("get_challenge flags isError for an unknown challenge", async () => {
  const client = await connectedClient();
  const res = await client.callTool({ name: "get_challenge", arguments: { challenge_id: "nope-99" } });
  assert.equal(res.isError, true);
  await client.close();
});

test("submit_flag: wrong-but-valid flag is NOT isError; unknown challenge IS", async () => {
  const client = await connectedClient();
  const wrong = await client.callTool({
    name: "submit_flag",
    arguments: { challenge_id: "web-01", flag: "crucible{nope}" },
  });
  assert.notEqual(wrong.isError, true); // a wrong flag is a normal negative result
  assert.match(textOf(wrong), /"correct": false/);
  const unknown = await client.callTool({
    name: "submit_flag",
    arguments: { challenge_id: "no-such", flag: "crucible{x}" },
  });
  assert.equal(unknown.isError, true);
  await client.close();
});
