/**
 * Integration tests for the production HTTP transport (src/http.ts) — the path TrueForge actually
 * uses. Covers bearer-token auth, the request-body size limit, and that `connect` still fails
 * closed over HTTP. (Reaching a live arena target needs the containerized MCP on the arena
 * network — exercised by the compose stack, not here.)
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createHttpServer } from "../src/http.ts";

const TOKEN = "test-secret-token";

async function withServer(fn: (baseUrl: string) => Promise<void>): Promise<void> {
  // DNS-rebinding protection needs a fixed host:port; disable it here (functional checks only).
  const server = createHttpServer({ token: TOKEN, maxBodyBytes: 1024, enableDnsRebindingProtection: false });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as AddressInfo).port;
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
}

test("HTTP: rejects requests without the bearer token (401)", async () => {
  await withServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
    });
    assert.equal(res.status, 401);
  });
});

test("HTTP: authed MCP client lists tools and connect fails closed", async () => {
  await withServer(async (baseUrl) => {
    const transport = new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`), {
      requestInit: { headers: { Authorization: `Bearer ${TOKEN}` } },
    });
    const client = new Client({ name: "http-test", version: "0.0.0" });
    await client.connect(transport);
    const { tools } = await client.listTools();
    assert.equal(tools.length, 5);
    const blocked = await client.callTool({ name: "connect", arguments: { host: "8.8.8.8", port: 443 } });
    assert.equal(blocked.isError, true);
    await client.close();
  });
});

test("HTTP: over-sized request body is rejected with 413", async () => {
  await withServer(async (baseUrl) => {
    const big = "x".repeat(2048); // > the 1024-byte test limit
    const res = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json", Authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { big } }),
    });
    assert.equal(res.status, 413);
  });
});
