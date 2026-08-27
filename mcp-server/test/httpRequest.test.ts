/**
 * Tests for http_request — the approval-gated live-target execution tool. Covers policy
 * fail-closed, anti-rebinding (pinned IP passed to the fetcher, Host = original hostname), the
 * success path returning a response, and a real-socket path against a local HTTP server.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { httpRequest, defaultFetcher, type HttpFetcher } from "../src/tools/httpRequest.ts";

test("http_request FAILS CLOSED on a non-arena destination (no fetch happens)", async () => {
  let called = false;
  const fetcher: HttpFetcher = async () => {
    called = true;
    return { status: 200, body: "", truncated: false };
  };
  const r = await httpRequest({ host: "8.8.8.8", port: 5000 }, fetcher);
  assert.equal(r.ok, false);
  assert.equal(r.blocked, true);
  assert.equal(called, false);
});

test("http_request allowed: connects to the PINNED ip with Host = hostname, returns the response", async () => {
  const seen: Array<{ ip: string; host: string; method: string; path: string; body?: string }> = [];
  const fetcher: HttpFetcher = async (a) => {
    seen.push({ ip: a.ip, host: a.host, method: a.method, path: a.path, body: a.body });
    return { status: 200, body: '{"ok":true,"flag":"crucible{sqli_auth_bypass_web01}"}', truncated: false };
  };
  const r = await httpRequest(
    { host: "10.42.0.5", port: 5000, method: "POST", path: "/login", body: "username=admin'--&password=x" },
    fetcher,
  );
  assert.equal(r.ok, true);
  assert.equal(r.status, 200);
  assert.match(r.body ?? "", /crucible\{/);
  assert.deepEqual(seen[0], {
    ip: "10.42.0.5", // pinned IP, not a re-resolved hostname
    host: "10.42.0.5",
    method: "POST",
    path: "/login",
    body: "username=admin'--&password=x",
  });
});

test("http_request reports an honest failure when the request errors", async () => {
  const fetcher: HttpFetcher = async () => {
    throw new Error("ECONNREFUSED");
  };
  const r = await httpRequest({ host: "10.42.0.5", port: 5000 }, fetcher);
  assert.equal(r.ok, false);
  assert.notEqual(r.blocked, true); // policy allowed; this is a runtime failure
  assert.match(r.reason, /request failed/);
});

test("defaultFetcher performs a real HTTP request against a local server", async () => {
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ method: req.method, path: req.url, host: req.headers.host, body }));
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as AddressInfo).port;
  try {
    const res = await defaultFetcher({
      ip: "127.0.0.1", port, host: "web-01", method: "POST", path: "/login",
      body: "username=admin'--&password=x", timeoutMs: 2000, maxBytes: 64 * 1024,
    });
    assert.equal(res.status, 200);
    const parsed = JSON.parse(res.body) as { method: string; path: string; host: string; body: string };
    assert.equal(parsed.method, "POST");
    assert.equal(parsed.path, "/login");
    assert.equal(parsed.host, "web-01"); // Host header carries the original hostname
    assert.equal(parsed.body, "username=admin'--&password=x");
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
});
