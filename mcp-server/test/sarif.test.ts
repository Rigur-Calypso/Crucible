/**
 * Tests for the SARIF 2.1.0 finding serializer (src/finding/sarif.ts). These assert the output is
 * well-formed SARIF that downstream tooling (incl. GitHub code scanning) can ingest, and that the
 * finding's substance survives serialization. Run: `npm test`.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { toSarif, WEB01_FINDING, type CrucibleFinding } from "../src/finding/sarif.ts";

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

test("high severity maps to SARIF level 'error'", () => {
  const s = toSarif(WEB01_FINDING) as any;
  assert.equal(s.runs[0].results[0].level, "error");
  assert.equal(s.runs[0].tool.driver.rules[0].defaultConfiguration.level, "error");
});

test("severity → level mapping covers the closed set", () => {
  const base: CrucibleFinding = { ...WEB01_FINDING };
  const level = (sev: CrucibleFinding["severity"]) =>
    (toSarif({ ...base, severity: sev }) as any).runs[0].results[0].level;
  assert.equal(level("critical"), "error");
  assert.equal(level("high"), "error");
  assert.equal(level("medium"), "warning");
  assert.equal(level("low"), "note");
});

test("result carries the target location, evidence, and confirmed flag", () => {
  const s = toSarif(WEB01_FINDING) as any;
  const result = s.runs[0].results[0];
  assert.equal(result.locations[0].physicalLocation.artifactLocation.uri, "http://web-01:5000/login");
  assert.equal(result.locations[0].logicalLocations[0].fullyQualifiedName, "web-01");
  assert.equal(result.properties.confirmed, true);
  assert.match(result.properties.evidence, /crucible\{sqli_auth_bypass_web01\}/);
  assert.match(result.message.text, /Authentication Bypass/);
});

test("detectedAt defaults to a timestamp when omitted, and is preserved when provided", () => {
  const withTs = toSarif({ ...WEB01_FINDING, detectedAt: "2026-08-28T00:00:00.000Z" }) as any;
  assert.equal(withTs.runs[0].results[0].properties.detectedAt, "2026-08-28T00:00:00.000Z");

  const { detectedAt: _omit, ...noTs } = WEB01_FINDING;
  const auto = toSarif(noTs) as any;
  assert.match(auto.runs[0].results[0].properties.detectedAt, /^\d{4}-\d{2}-\d{2}T/);
});

test("the full SARIF log round-trips through JSON (serializable, no cycles)", () => {
  const s = toSarif(WEB01_FINDING);
  assert.doesNotThrow(() => JSON.parse(JSON.stringify(s)));
});
