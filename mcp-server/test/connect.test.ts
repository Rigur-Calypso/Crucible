/**
 * Real-socket tests for the default TCP connector used by `connect`. These prove the connector
 * actually opens (and refuses) a real socket — complementing the injected-connector branch tests
 * in server.test.ts. They connect to an ephemeral loopback listener directly (not through the
 * arena policy, which only permits arena IPs).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import { defaultConnector } from "../src/tools/connect.ts";

test("defaultConnector resolves against an open TCP port", async () => {
  const server = net.createServer();
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as net.AddressInfo).port;
  try {
    await defaultConnector("127.0.0.1", port, 2000); // resolves = real socket opened
  } finally {
    server.close();
  }
});

test("defaultConnector rejects a closed TCP port", async () => {
  // Reserve a port then close it, so nothing is listening.
  const tmp = net.createServer();
  await new Promise<void>((r) => tmp.listen(0, "127.0.0.1", r));
  const port = (tmp.address() as net.AddressInfo).port;
  await new Promise<void>((r) => tmp.close(() => r()));
  await assert.rejects(() => defaultConnector("127.0.0.1", port, 2000));
});
