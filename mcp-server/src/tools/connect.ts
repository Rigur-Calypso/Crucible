/**
 * connect — the strongest security boundary and the single approval-gated action.
 * STUB: wire the socket proxy to the sandbox and mark this tool approval-required on the agent.
 *
 * The allowlist is enforced in code here (Layer 2). The sandbox's own egress lockdown is
 * Layer 1 (see docs/SECURITY_MODEL.md). Both must hold.
 */

import { evaluateDestination } from "../policy/networkPolicy.ts";

export interface ConnectInput {
  host: string;
  port: number;
}

export interface ConnectResult {
  ok: boolean;
  blocked?: boolean;
  target?: string;
  reason: string;
}

export async function connect(input: ConnectInput): Promise<ConnectResult> {
  const decision = await evaluateDestination(input.host, input.port);
  if (!decision.allowed) {
    // Fail closed. Return the reason so the UI policy panel / audit log can show why.
    return { ok: false, blocked: true, reason: decision.reason };
  }

  // ANTI-REBINDING: connect to decision.resolvedIp, NOT input.host. Do not re-resolve.
  // TODO(verify in impl): open the proxied socket to `${decision.resolvedIp}:${input.port}`
  // through the TrueForge sandbox, and confirm this tool is configured as approval-required
  // on the agent so the human gate fires before this call proceeds.
  return {
    ok: true,
    target: `${decision.resolvedIp}:${input.port}`,
    reason: decision.reason,
  };
}
