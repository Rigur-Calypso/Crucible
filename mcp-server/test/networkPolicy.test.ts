/**
 * Fail-closed tests for the network policy (docs/SECURITY_MODEL.md §6).
 * Run: `npm test` (uses `node --import tsx --test`).
 *
 * These assume the example allowlist in networkPolicy.ts (10.42.0.0/24, ports {5000,8000}).
 * If the arena subnet changes, update the policy AND these expectations together.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  evaluateIpLiteral,
  evaluateDestination,
  type Resolver,
} from "../src/policy/networkPolicy.ts";

// ---- Allowed ----------------------------------------------------------------
test("allows arena IPv4 on a permitted port", () => {
  assert.equal(evaluateIpLiteral("10.42.0.5", 5000).allowed, true);
});

// ---- Rejected: network ------------------------------------------------------
test("rejects a public IPv4", () => {
  assert.equal(evaluateIpLiteral("8.8.8.8", 5000).allowed, false);
});

test("rejects localhost / loopback", () => {
  assert.equal(evaluateIpLiteral("127.0.0.1", 5000).allowed, false);
});

test("rejects private IPv4 outside the arena", () => {
  assert.equal(evaluateIpLiteral("192.168.1.5", 5000).allowed, false);
  assert.equal(evaluateIpLiteral("10.0.0.5", 5000).allowed, false);
  assert.equal(evaluateIpLiteral("172.16.0.1", 5000).allowed, false);
});

test("rejects link-local", () => {
  assert.equal(evaluateIpLiteral("169.254.1.1", 5000).allowed, false);
});

test("rejects IPv6 (outside approved network)", () => {
  assert.equal(evaluateIpLiteral("::1", 5000).allowed, false);
  assert.equal(evaluateIpLiteral("fc00::1", 5000).allowed, false);
  assert.equal(evaluateIpLiteral("2001:4860:4860::8888", 5000).allowed, false);
});

test("rejects alternate encodings and malformed addresses", () => {
  for (const bad of [
    "0x0a.42.0.5", // hex
    "2130706433", // 32-bit integer form of 127.0.0.1
    "0177.0.0.1", // octal
    "10.42.0.5:80", // host:port smuggling
    "10.42.0.5 ", // trailing space
    "not-an-ip",
    "",
  ]) {
    assert.equal(evaluateIpLiteral(bad, 5000).allowed, false, `should reject "${bad}"`);
  }
});

test("rejects a disallowed port on an allowed host", () => {
  assert.equal(evaluateIpLiteral("10.42.0.5", 22).allowed, false);
  assert.equal(evaluateIpLiteral("10.42.0.5", 443).allowed, false);
});

// ---- Rejected: hostname / DNS ----------------------------------------------
const fakeResolver =
  (map: Record<string, string[]>): Resolver =>
  async (host) => (map[host] ?? []).map((address) => ({ address, family: 4 }));

test("allows an arena hostname that resolves in-arena, and pins the IP", async () => {
  const r = await evaluateDestination("web-01", 5000, fakeResolver({ "web-01": ["10.42.0.5"] }));
  assert.equal(r.allowed, true);
  assert.equal(r.resolvedIp, "10.42.0.5"); // caller must connect to this, not re-resolve
});

test("rejects a hostname that resolves outside the arena", async () => {
  const r = await evaluateDestination("evil.example", 5000, fakeResolver({ "evil.example": ["8.8.8.8"] }));
  assert.equal(r.allowed, false);
});

test("rejects a hostname if ANY resolved address is out-of-arena (split-result)", async () => {
  const r = await evaluateDestination("mixed", 5000, fakeResolver({ mixed: ["10.42.0.5", "8.8.8.8"] }));
  assert.equal(r.allowed, false);
});

test("rejects an unresolvable hostname (fail closed)", async () => {
  const r = await evaluateDestination("nx", 5000, fakeResolver({}));
  assert.equal(r.allowed, false);
});

test("fails closed on a resolver error", async () => {
  const throwing: Resolver = async () => {
    throw new Error("dns boom");
  };
  const r = await evaluateDestination("web-01", 5000, throwing);
  assert.equal(r.allowed, false);
});
