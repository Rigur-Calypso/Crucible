/**
 * Tests for the SARIF 2.1.0 finding serializer (src/finding/sarif.ts). These assert the output is
 * well-formed, GitHub-ingestible SARIF (source-file physical location, supported fingerprint key),
 * deterministic, and that untrusted input is validated. Run: `npm test`.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { toSarif, parseFinding, WEB01_FINDING, type CrucibleFinding } from "../src/finding/sarif.ts";

test("emits a well-formed SARIF 2.1.0 log with one run, rule, and result", () => {
  const s = toSarif(WEB01_FINDING) as any;
  assert.equal(s.version, "2.1.0");
  assert.match(s.$schema, /sarif-schema-2\.1\.0\.json$/);
  assert.equal(s.runs.length, 1);
  const run = s.runs[0];
  assert.equal(run.tool.driver.name, "The Crucible");
  assert.equal(run.tool.driver.rules.length, 1);
  assert.equal(run.results.length, 1);
});

test("rule and result reference the same ruleId, with a CWE tag and security-severity", () => {
  const s = toSarif(WEB01_FINDING) as any;
  const rule = s.runs[0].tool.driver.rules[0];
  const result = s.runs[0].results[0];
  assert.equal(rule.id, "sql-injection-auth-bypass");
  assert.equal(result.ruleId, rule.id);
  assert.equal(result.ruleIndex, 0);
  assert.ok(rule.properties.tags.includes("external/cwe/cwe-89"));
  assert.equal(rule.properties["security-severity"], "8.8");
});

test("severity → level mapping covers the closed set", () => {
  const level = (sev: CrucibleFinding["severity"]) =>
    (toSarif({ ...WEB01_FINDING, severity: sev }) as any).runs[0].results[0].level;
  assert.equal(level("critical"), "error");
  assert.equal(level("high"), "error");
  assert.equal(level("medium"), "warning");
  assert.equal(level("low"), "note");
});

test("physical location is a repo-relative SOURCE file (GitHub-ingestible), never an http URI", () => {
  const s = toSarif(WEB01_FINDING) as any;
  const loc = s.runs[0].results[0].locations[0];
  assert.equal(loc.physicalLocation.artifactLocation.uri, "arena/web-01/app.py");
  assert.equal(loc.physicalLocation.region.startLine, 50);
  assert.equal(loc.logicalLocations[0].fullyQualifiedName, "web-01");
  // The endpoint lives in the message + properties, not as a physical-location URI.
  assert.equal(s.runs[0].results[0].properties.endpoint, "http://web-01:5000/login");
  assert.match(s.runs[0].results[0].message.text, /http:\/\/web-01:5000\/login/);
});

test("a finding without a sourceFile emits a logicalLocation only (no http physicalLocation)", () => {
  const { sourceFile: _f, sourceLine: _l, ...noSrc } = WEB01_FINDING;
  const loc = (toSarif(noSrc) as any).runs[0].results[0].locations[0];
  assert.equal(loc.physicalLocation, undefined);
  assert.equal(loc.logicalLocations[0].fullyQualifiedName, "web-01");
});

test("provides the GitHub-supported primaryLocationLineHash fingerprint, stable across emits", () => {
  const a = (toSarif(WEB01_FINDING) as any).runs[0].results[0].partialFingerprints;
  const b = (toSarif(WEB01_FINDING) as any).runs[0].results[0].partialFingerprints;
  assert.match(a.primaryLocationLineHash, /^[0-9a-f]{64}$/);
  assert.equal(a.primaryLocationLineHash, b.primaryLocationLineHash); // stable → dedups
  assert.equal(a["crucible/challenge"], "web-01");
});

test("output is DETERMINISTIC: identical inputs → identical bytes (no clock read)", () => {
  const one = JSON.stringify(toSarif(WEB01_FINDING));
  const two = JSON.stringify(toSarif(WEB01_FINDING));
  assert.equal(one, two);
});

test("detectedAt: preserved when set; omitted (not invented) when absent and no now given", () => {
  assert.equal((toSarif(WEB01_FINDING) as any).runs[0].results[0].properties.detectedAt, "2026-08-28T00:00:00.000Z");
  const { detectedAt: _d, ...noTs } = WEB01_FINDING;
  assert.equal((toSarif(noTs) as any).runs[0].results[0].properties.detectedAt, undefined);
  assert.equal((toSarif(noTs, { now: "2020-01-01T00:00:00.000Z" }) as any).runs[0].results[0].properties.detectedAt, "2020-01-01T00:00:00.000Z");
});

test("parseFinding rejects malformed input instead of producing junk SARIF", () => {
  assert.throws(() => parseFinding({}));
  assert.throws(() => parseFinding({ ...WEB01_FINDING, severity: "bogus" }));
  assert.throws(() => parseFinding({ ...WEB01_FINDING, cwe: "89" }));
  assert.throws(() => parseFinding({ ...WEB01_FINDING, confirmed: "yes" }));
  // A valid finding round-trips and serializes.
  const ok = parseFinding({ ...WEB01_FINDING });
  assert.doesNotThrow(() => JSON.parse(JSON.stringify(toSarif(ok))));
});
