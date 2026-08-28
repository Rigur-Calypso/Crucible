/**
 * crypto-01 — the non-live, static-analysis challenge. These tests drive the REAL MCP tool path
 * (a linked in-memory client/server pair, like server.test.ts) so they cover tool registration,
 * schemas, handler wiring, and result serialization — not just the internal functions. The solve
 * proves it end-to-end: fetch_file (returns the ciphertext base64) → brute-force single-byte XOR →
 * submit_flag validates server-side. No network, no approval gate. Run: `npm test`.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../src/index.ts";

async function connectedClient(): Promise<Client> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createServer();
  const client = new Client({ name: "test", version: "0.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

/** Parse the JSON payload the tools return in content[0].text. */
function jsonOf(result: unknown): any {
  const text = (result as { content?: Array<{ text?: string }> }).content?.[0]?.text ?? "";
  return JSON.parse(text);
}

test("crypto-01 is registered as a non-live crypto challenge (via list_challenges / get_challenge)", async () => {
  const client = await connectedClient();
  const list = jsonOf(await client.callTool({ name: "list_challenges", arguments: {} }));
  assert.ok(Array.isArray(list) && list.some((c: any) => c.id === "crypto-01" && c.category === "crypto"));

  const detail = jsonOf(await client.callTool({ name: "get_challenge", arguments: { challenge_id: "crypto-01" } }));
  assert.equal(detail.connection, undefined); // non-live: no network target
  assert.deepEqual(detail.files, ["brief.txt", "cipher.bin"]);
  await client.close();
});

test("crypto-01 is solvable through the MCP path: fetch_file → brute-force XOR → submit_flag", async () => {
  const client = await connectedClient();

  // 1. Pull the ciphertext through the real fetch_file tool (returns base64).
  const fetched = jsonOf(await client.callTool({
    name: "fetch_file",
    arguments: { challenge_id: "crypto-01", filename: "cipher.bin" },
  }));
  assert.equal(fetched.ok, true);
  assert.equal(fetched.encoding, "base64");
  const cipher = Buffer.from(fetched.content, "base64");

  // 2. Brute-force all 256 single-byte keys; keep decodes shaped like a flag.
  const candidates: string[] = [];
  for (let key = 0; key < 256; key++) {
    const decoded = Buffer.from(cipher.map((b) => b ^ key)).toString("latin1");
    if (decoded.startsWith("crucible{") && decoded.endsWith("}")) candidates.push(decoded);
  }
  assert.equal(candidates.length, 1, "exactly one key should yield a well-formed flag");
  const recovered = candidates[0]!;

  // 3. Submit the recovered flag through the real submit_flag tool (validated server-side).
  const submit = jsonOf(await client.callTool({
    name: "submit_flag",
    arguments: { challenge_id: "crypto-01", flag: recovered },
  }));
  assert.equal(submit.correct, true);
  await client.close();
});

test("crypto-01 rejects a wrong flag through submit_flag (server-side)", async () => {
  const client = await connectedClient();
  const submit = jsonOf(await client.callTool({
    name: "submit_flag",
    arguments: { challenge_id: "crypto-01", flag: "crucible{wrong}" },
  }));
  assert.equal(submit.correct, false);
  await client.close();
});
