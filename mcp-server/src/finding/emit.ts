/**
 * emit.ts — CLI that serializes a Crucible finding to SARIF 2.1.0 on stdout.
 *
 *   npm run emit:finding                 # emits the reference web-01 finding
 *   npm run emit:finding -- finding.json # emits a finding you provide (same shape as CrucibleFinding)
 *   npm run emit:finding -- > web-01.sarif.json
 *
 * Deterministic and offline: it does not touch the arena. Use it after a Security Case to hand a
 * judge / pipeline the finding in the same format a human static-analysis tool would produce.
 */

import { readFileSync } from "node:fs";
import { toSarif, WEB01_FINDING, type CrucibleFinding } from "./sarif.ts";

function loadFinding(argv: string[]): CrucibleFinding {
  const file = argv[2];
  if (!file) return WEB01_FINDING;
  const parsed = JSON.parse(readFileSync(file, "utf8")) as CrucibleFinding;
  return parsed;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const finding = loadFinding(process.argv);
    process.stdout.write(JSON.stringify(toSarif(finding), null, 2) + "\n");
  } catch (err) {
    process.stderr.write(`emit-finding failed: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  }
}
