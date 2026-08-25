/**
 * Crucible network policy — Layer 2 of the security boundary (see docs/SECURITY_MODEL.md).
 *
 * Pure, dependency-free logic so it is trivially testable and reviewable by a human and by Qodo.
 * The invariant this enforces:
 *
 *   No connection may be established unless its destination resolves to a canonical IPv4
 *   address inside an approved arena CIDR, on an approved port. Everything else is DENIED.
 *
 * It FAILS CLOSED: malformed input, alternate IP encodings, IPv6, unresolved hostnames, and
 * any resolver error all result in denial.
 *
 * SINGLE SOURCE OF TRUTH: ARENA_CIDRS_V4 and ALLOWED_PORTS below must match the real arena
 * network in arena/docker-compose.yml. Verify against the running Docker network before a demo.
 */

import net from "node:net";
import dnsPromises from "node:dns/promises";

/** Arena allocation. ADJUST to the real docker-compose subnet. Example value only. */
export const ARENA_CIDRS_V4: readonly string[] = ["10.42.0.0/24"];

/** Ports arena services actually listen on. Keep as narrow as possible. */
export const ALLOWED_PORTS: ReadonlySet<number> = new Set<number>([5000, 8000]);

export interface PolicyDecision {
  allowed: boolean;
  reason: string;
  /** Canonical IP the caller MUST connect to (anti-rebinding). Present only when allowed. */
  resolvedIp?: string;
}

export type Resolver = (
  host: string,
) => Promise<Array<{ address: string; family: number }>>;

const defaultResolver: Resolver = (host) => dnsPromises.lookup(host, { all: true });

function deny(reason: string): PolicyDecision {
  return { allowed: false, reason };
}

function ipv4ToInt(ip: string): number {
  return (
    ip.split(".").reduce((acc, octet) => ((acc << 8) + (Number(octet) & 0xff)) >>> 0, 0) >>> 0
  );
}

function inCidrV4(ip: string, cidr: string): boolean {
  const [range, bitsStr] = cidr.split("/");
  if (range === undefined || bitsStr === undefined) return false;
  const bits = Number(bitsStr);
  if (!Number.isInteger(bits) || bits < 0 || bits > 32) return false;
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return ((ipv4ToInt(ip) & mask) >>> 0) === ((ipv4ToInt(range) & mask) >>> 0);
}

function isArenaIpV4(ip: string): boolean {
  return ARENA_CIDRS_V4.some((cidr) => inCidrV4(ip, cidr));
}

/**
 * Evaluate a *literal* host + port. Rejects anything that is not a canonical dotted-quad IPv4
 * inside the arena. IPv6 and all alternate encodings (octal/hex/32-bit-integer) are rejected
 * here because net.isIP only recognises canonical forms.
 */
export function evaluateIpLiteral(host: string, port: number): PolicyDecision {
  if (!Number.isInteger(port) || !ALLOWED_PORTS.has(port)) {
    return deny(`port ${port} not permitted`);
  }
  const family = net.isIP(host);
  if (family === 6) return deny("IPv6 is outside the approved network");
  if (family !== 4) return deny("not a canonical IPv4 literal (malformed or alternate encoding)");
  if (!isArenaIpV4(host)) return deny(`${host} is outside the arena subnet`);
  return { allowed: true, reason: "arena IPv4 on permitted port", resolvedIp: host };
}

/**
 * Evaluate a destination that may be an IP literal or a hostname. Hostnames are resolved and
 * EVERY resolved address must be inside the arena (defeats split-result tricks). The caller MUST
 * connect to `resolvedIp`, never re-resolve the hostname — that is the anti-DNS-rebinding
 * guarantee. Fails closed on any resolver error.
 */
export async function evaluateDestination(
  host: string,
  port: number,
  resolver: Resolver = defaultResolver,
): Promise<PolicyDecision> {
  try {
    if (typeof host !== "string" || host.length === 0) return deny("empty host");
    if (net.isIP(host) !== 0) return evaluateIpLiteral(host, port);

    const results = await resolver(host);
    if (!results || results.length === 0) return deny("hostname did not resolve");

    for (const record of results) {
      const decision = evaluateIpLiteral(record.address, port);
      if (!decision.allowed) {
        return deny(`hostname resolved to disallowed address ${record.address}: ${decision.reason}`);
      }
    }
    // All resolved addresses are in-arena; pin the first so the caller cannot be rebound.
    const pinned = results[0];
    if (pinned === undefined) return deny("hostname did not resolve");
    return {
      allowed: true,
      reason: "arena hostname (all resolved addresses in-arena)",
      resolvedIp: pinned.address,
    };
  } catch {
    return deny("resolution or validation error (fail closed)");
  }
}
