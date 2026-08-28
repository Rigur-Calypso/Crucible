/**
 * Gated-action audit log — an append-only record of every INVOCATION of the two approval-gated
 * tools (`connect`, `http_request`) that reaches the MCP server, together with the Layer-2 policy
 * decision and the outcome.
 *
 * HONESTY / SCOPE (important): the human approve/deny click happens in TrueForge, upstream of this
 * server — the MCP server never sees it and this log does NOT claim to. What this log faithfully
 * witnesses is what actually hit the enforcement layer: which gated tool was called, with what
 * destination, whether the in-code allowlist ALLOWED or BLOCKED it (and why), and whether the
 * action then executed, was blocked, or failed. That is real, inspectable control evidence — the
 * record of what the boundary did — without overstating what this component can observe.
 *
 * Append-only JSON Lines so it is tamper-evident-ish and trivially greppable. Disabled by default;
 * set CRUCIBLE_AUDIT_LOG=/path/to/audit.jsonl to turn it on.
 */

import { appendFileSync } from "node:fs";

export type GatedTool = "connect" | "http_request";
export type PolicyDecisionKind = "allowed" | "blocked";
export type Outcome = "executed" | "blocked" | "failed";

export interface AuditEvent {
  /** ISO 8601 timestamp of the invocation. */
  ts: string;
  tool: GatedTool;
  /** The requested destination, as the agent asked for it. */
  host: string;
  port: number;
  method?: string;
  path?: string;
  /** Layer-2 allowlist decision that reached this server. */
  decision: PolicyDecisionKind;
  /** What happened after the decision. `blocked` when the policy refused the destination. */
  outcome: Outcome;
  /** The pinned target actually contacted (ip:port), when the policy allowed it. */
  target?: string;
  /** Human-readable reason from the tool result. */
  reason: string;
}

/** A sink consumes audit events. Injectable so tests never touch the filesystem. */
export type AuditSink = (event: AuditEvent) => void;

/** Default: discard. The server is silent about auditing unless explicitly configured. */
export const noopSink: AuditSink = () => {};

/**
 * A sink that appends each event as one JSON line to `path`. A write failure must never break a
 * tool call, so it is swallowed to stderr — the log is evidence, not a dependency of the action.
 */
export function appendJsonlSink(path: string): AuditSink {
  return (event: AuditEvent) => {
    try {
      appendFileSync(path, JSON.stringify(event) + "\n");
    } catch (err) {
      process.stderr.write(
        `crucible audit: failed to append to ${path}: ${err instanceof Error ? err.message : String(err)}\n`,
      );
    }
  };
}

/** Build the sink from the environment: file-backed when CRUCIBLE_AUDIT_LOG is set, else no-op. */
export function createAuditSinkFromEnv(env: NodeJS.ProcessEnv = process.env): AuditSink {
  const path = env.CRUCIBLE_AUDIT_LOG;
  return path ? appendJsonlSink(path) : noopSink;
}

/**
 * Wrap ANY sink so it can never throw into the caller. The audit log is evidence, not a dependency
 * of the action — a gated tool call must return its real result even if the sink (including an
 * injected one) fails. Errors are reported to stderr and swallowed.
 */
export function nonThrowing(sink: AuditSink): AuditSink {
  return (event: AuditEvent) => {
    try {
      sink(event);
    } catch (err) {
      process.stderr.write(
        `crucible audit: sink threw (ignored): ${err instanceof Error ? err.message : String(err)}\n`,
      );
    }
  };
}
