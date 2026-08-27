/**
 * connect — the strongest security boundary and the single approval-gated action.
 *
 * Two independent gates, both in code:
 *   1. Policy (Layer 2): the destination must pass `evaluateDestination` — arena subnet, allowed
 *      port, fail-closed. A denied destination never touches the network.
 *   2. Real I/O: on an allowed destination, connect opens an actual TCP socket to the PINNED
 *      resolved IP (never re-resolving — anti-rebinding), with a bounded timeout, and reports the
 *      real outcome. It no longer reports success without doing anything.
 *
 * Mark this tool approval-required on the TrueForge agent so the human gate fires before it runs.
 * Reaching the internal arena requires the MCP server to be attached to the arena network (see
 * docs/SECURITY_MODEL.md §3a / TRUEFORGE_INTEGRATION.md — deployment `[verify in impl]`); when it
 * is not (e.g. the MCP server runs on the host), an allowed arena IP is unreachable and connect
 * honestly reports `connected: false` rather than a false success.
 */

import net from "node:net";
import { evaluateDestination } from "../policy/networkPolicy.ts";

export interface ConnectInput {
  host: string;
  port: number;
}

export interface ConnectResult {
  ok: boolean;
  /** True when the policy REJECTED the destination (distinct from a runtime connection failure). */
  blocked?: boolean;
  /** True when a real socket to the pinned IP was established. */
  connected?: boolean;
  target?: string;
  reason: string;
}

/**
 * Establish a TCP connection to `ip:port`, resolving on success and rejecting on failure/timeout.
 * Injectable so tests can exercise the success/failure paths without real infrastructure.
 */
export type Connector = (ip: string, port: number, timeoutMs: number) => Promise<void>;

export const defaultConnector: Connector = (ip, port, timeoutMs) =>
  new Promise<void>((resolve, reject) => {
    const socket = net.connect({ host: ip, port });
    const done = (err?: Error) => {
      socket.destroy();
      if (err) reject(err);
      else resolve();
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => done());
    socket.once("timeout", () => done(new Error(`connection timed out after ${timeoutMs}ms`)));
    socket.once("error", (err) => done(err));
  });

export async function connect(
  input: ConnectInput,
  connector: Connector = defaultConnector,
  timeoutMs = 5000,
): Promise<ConnectResult> {
  const decision = await evaluateDestination(input.host, input.port);
  if (!decision.allowed || decision.resolvedIp === undefined) {
    // Fail closed. Return the reason so the UI policy panel / audit log can show why.
    return { ok: false, blocked: true, connected: false, reason: decision.reason };
  }

  // ANTI-REBINDING: connect to the pinned decision.resolvedIp, NOT input.host. Do not re-resolve.
  const target = `${decision.resolvedIp}:${input.port}`;
  try {
    await connector(decision.resolvedIp, input.port, timeoutMs);
    return { ok: true, connected: true, target, reason: `connected to ${target}` };
  } catch (err) {
    // Policy allowed it, but the socket did not open (e.g. MCP server not on the arena network).
    return {
      ok: false,
      connected: false,
      target,
      reason: `policy allowed but connection failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
