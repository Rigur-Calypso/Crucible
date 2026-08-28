/**
 * emit.ts — CLI that serializes a Crucible finding to SARIF 2.1.0 on stdout.
 *
 *   npm run emit:finding                 # emits the reference web-01 finding (deterministic bytes)
 *   npm run emit:finding -- finding.json # emits a finding you provide (validated; same shape as CrucibleFinding)
 *   npm run emit:finding -- > web-01.sarif.json
 *
 * Offline: it does not touch the arena. A provided file is VALIDATED before serialization — invalid
 * input fails with a nonzero exit rather than emitting malformed SARIF. The reference finding carries
 * a fixed timestamp so its output is byte-for-byte deterministic; a provided finding without its own
 * `detectedAt` is stamped with the current time here (at the CLI boundary, keeping the serializer pure).
 */

import { readFileSync } from "node:fs";
import { toSarif, WEB01_FINDING, parseFinding, type CrucibleFinding } from "./sarif.ts";

interface Loaded {
  finding: CrucibleFinding;
  now?: string; // supplied only for provided findings lacking their own detectedAt
}

function loadFinding(argv: string[]): Loaded {
  const file = argv[2];
  if (!file) return { finding: WEB01_FINDING }; // has a fixed detectedAt → deterministic
  const finding = parseFinding(JSON.parse(readFileSync(file, "utf8")));
  return { finding, now: new Date().toISOString() };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const { finding, now } = loadFinding(process.argv);
    process.stdout.write(JSON.stringify(toSarif(finding, { now }), null, 2) + "\n");
  } catch (err) {
    process.stderr.write(`emit-finding failed: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  }
}
