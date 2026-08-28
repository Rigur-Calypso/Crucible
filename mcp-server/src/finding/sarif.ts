/**
 * SARIF serializer for a Crucible security finding.
 *
 * The Crucible's product is a *security finding*, not a captured flag. Emitting that finding as
 * SARIF 2.1.0 — the OASIS-standard Static Analysis Results Interchange Format, and the format
 * GitHub code scanning ingests — makes the "real security tooling, not a CTF game" claim concrete:
 * the output drops straight into the same pipelines a human security tool would feed.
 *
 * This module is pure (trivially testable) and deterministic: it never reads the clock — a caller
 * that wants "now" passes it in. It does NOT decide whether a vulnerability exists — it serializes a
 * finding the agent already validated end-to-end (the flag capture is the confirmation).
 * `submit_flag` remains the server-side source of truth for capture.
 */

import { createHash } from "node:crypto";
import { z } from "zod";

export type Severity = "critical" | "high" | "medium" | "low";

/** A validated Crucible finding, in the domain's own terms (transport-independent). */
export interface CrucibleFinding {
  /** Owning arena challenge, e.g. "web-01". */
  challengeId: string;
  /** Stable rule slug, e.g. "sql-injection-auth-bypass". Becomes the SARIF ruleId. */
  ruleId: string;
  /** Human title, e.g. "SQL Injection — Authentication Bypass". */
  title: string;
  /** Full description of the vulnerability and how it was confirmed. */
  description: string;
  severity: Severity;
  /** CWE identifier number, e.g. 89 for SQL injection. */
  cwe: number;
  /** The endpoint the finding concerns, e.g. "http://web-01:5000/login". */
  target: string;
  /**
   * Optional repo-relative source path of the root-cause code, e.g. "arena/web-01/app.py". When
   * present it becomes the SARIF physicalLocation so GitHub code scanning can anchor the alert to a
   * file. When absent, only a logicalLocation is emitted (no http physicalLocation, which GitHub
   * relativizes against the checkout and would reject).
   */
  sourceFile?: string;
  /** 1-based line within sourceFile of the root-cause code. */
  sourceLine?: number;
  /** True when validated end-to-end (the flag was captured through the live target). */
  confirmed: boolean;
  /** Human-readable evidence: the payload used and the captured proof. */
  evidence: string;
  /** Recommended fix. */
  remediation: string;
  /** ISO timestamp of detection. Deterministic output requires this be set (or passed via options). */
  detectedAt?: string;
}

/**
 * Runtime schema for a finding loaded from untrusted JSON (the emit CLI). Serializing unvalidated
 * input can silently produce malformed SARIF (e.g. `undefined on undefined`), so callers MUST parse
 * before serializing. Kept structurally in sync with CrucibleFinding above.
 */
export const CrucibleFindingSchema = z.object({
  challengeId: z.string().min(1),
  ruleId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  severity: z.enum(["critical", "high", "medium", "low"]),
  cwe: z.number().int().nonnegative(),
  target: z.string().min(1),
  sourceFile: z.string().min(1).optional(),
  sourceLine: z.number().int().positive().optional(),
  confirmed: z.boolean(),
  evidence: z.string().min(1),
  remediation: z.string().min(1),
  detectedAt: z.string().min(1).optional(),
});

/** Validate untrusted input into a CrucibleFinding, throwing a ZodError on any malformed field. */
export function parseFinding(input: unknown): CrucibleFinding {
  return CrucibleFindingSchema.parse(input);
}

/** GitHub uses properties["security-severity"] (a CVSS-like 0–10 string) to bucket alerts. */
const SECURITY_SEVERITY: Record<Severity, string> = {
  critical: "9.5",
  high: "8.8",
  medium: "5.5",
  low: "3.1",
};

/** SARIF `level` is a small closed set; map our severity onto it. */
function sarifLevel(severity: Severity): "error" | "warning" | "note" {
  if (severity === "critical" || severity === "high") return "error";
  if (severity === "medium") return "warning";
  return "note";
}

const DRIVER_NAME = "The Crucible";
const INFORMATION_URI = "https://github.com/Rigur-Calypso/Crucible";
const DRIVER_VERSION = "0.1.0";

/** Options for serialization. `now` supplies a timestamp only when the finding has no detectedAt. */
export interface ToSarifOptions {
  now?: string;
}

/**
 * Serialize one finding to a SARIF 2.1.0 log (a single run with a single rule + result).
 * Pure and deterministic: identical inputs produce identical bytes (no clock read). The returned
 * value is a plain JSON-serializable object.
 */
export function toSarif(finding: CrucibleFinding, options: ToSarifOptions = {}): Record<string, unknown> {
  const detectedAt = finding.detectedAt ?? options.now; // may be undefined → omitted, never invented
  const cweTag = `external/cwe/cwe-${finding.cwe}`;
  const level = sarifLevel(finding.severity);

  const rule = {
    id: finding.ruleId,
    name: finding.title,
    shortDescription: { text: finding.title },
    fullDescription: { text: finding.description },
    helpUri: `https://cwe.mitre.org/data/definitions/${finding.cwe}.html`,
    help: { text: finding.remediation },
    defaultConfiguration: { level },
    properties: {
      tags: ["security", cweTag],
      "security-severity": SECURITY_SEVERITY[finding.severity],
    },
  };

  // Anchor to a repo-relative source file when known (GitHub can ingest it); otherwise fall back to
  // a logicalLocation only. An http endpoint is NEVER used as a physicalLocation.uri — GitHub
  // relativizes physical locations against the checkout and would reject a non-file scheme. The
  // endpoint always travels in the message + properties instead.
  const logicalLocations = [{ fullyQualifiedName: finding.challengeId, kind: "resource" }];
  const location: Record<string, unknown> =
    finding.sourceFile !== undefined
      ? {
          physicalLocation: {
            artifactLocation: { uri: finding.sourceFile },
            ...(finding.sourceLine !== undefined ? { region: { startLine: finding.sourceLine } } : {}),
          },
          logicalLocations,
        }
      : { logicalLocations };

  // GitHub code scanning de-duplicates on partialFingerprints.primaryLocationLineHash. Provide a
  // stable hash derived from the finding's identity so re-emits collapse to one alert; keep the
  // human-readable crucible/* keys too (valid SARIF; used by tools that read custom fingerprints).
  const identity = [finding.ruleId, finding.challengeId, finding.sourceFile ?? finding.target, finding.sourceLine ?? ""].join("|");
  const primaryLocationLineHash = createHash("sha256").update(identity).digest("hex");

  const result = {
    ruleId: finding.ruleId,
    ruleIndex: 0,
    level,
    message: {
      text: `${finding.title} on ${finding.target}. ${finding.evidence}`,
    },
    locations: [location],
    partialFingerprints: {
      primaryLocationLineHash,
      "crucible/challenge": finding.challengeId,
      "crucible/rule": finding.ruleId,
    },
    properties: {
      confirmed: finding.confirmed,
      challengeId: finding.challengeId,
      endpoint: finding.target,
      ...(detectedAt !== undefined ? { detectedAt } : {}),
      evidence: finding.evidence,
    },
  };

  return {
    version: "2.1.0",
    $schema:
      "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json",
    runs: [
      {
        tool: {
          driver: {
            name: DRIVER_NAME,
            informationUri: INFORMATION_URI,
            version: DRIVER_VERSION,
            rules: [rule],
          },
        },
        results: [result],
      },
    ],
  };
}

/**
 * The canonical, validated finding for the flagship target. This is what a successful Security
 * Case against web-01 produces — kept here as the reference finding the emitter ships by default.
 */
export const WEB01_FINDING: CrucibleFinding = {
  challengeId: "web-01",
  ruleId: "sql-injection-auth-bypass",
  title: "SQL Injection — Authentication Bypass",
  description:
    "The /login handler builds its SQL query by string interpolation of the untrusted `username` " +
    "field, so a crafted value (`admin'--`) comments out the password check and authenticates as " +
    "admin without credentials. Confirmed end-to-end: the injected request authenticated and the " +
    "protected resource (the arena flag) was returned and validated server-side.",
  severity: "high",
  cwe: 89,
  target: "http://web-01:5000/login",
  // Root-cause code, so GitHub anchors the alert to a real file (the endpoint stays in message/props).
  sourceFile: "arena/web-01/app.py",
  sourceLine: 50,
  // Fixed timestamp keeps the default emitter output byte-for-byte deterministic (see emit.ts).
  detectedAt: "2026-08-28T00:00:00.000Z",
  confirmed: true,
  evidence:
    "Payload `username=admin'--&password=x` to POST /login returned HTTP 200 with the protected " +
    "flag crucible{sqli_auth_bypass_web01}; server-side submit_flag validated it as correct.",
  remediation:
    "Use parameterized queries / bound parameters for all user-supplied values (never string " +
    "interpolation), and enforce least-privilege on the DB account. See arena/web-01-patched for " +
    "the fixed variant.",
};
