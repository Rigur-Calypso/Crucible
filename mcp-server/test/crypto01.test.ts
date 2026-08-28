/**
 * crypto-01 — the non-live, static-analysis challenge. These tests prove it is registered and,
 * crucially, that it is SOLVABLE through the real tool path the agent uses: fetch_file (returns the
 * ciphertext base64-encoded) → brute-force single-byte XOR → submit_flag validates server-side.
 * No network, no approval gate. Run: `npm test`.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { listChallenges } from "../src/tools/listChallenges.ts";
import { getChallenge } from "../src/tools/getChallenge.ts";
import { submitFlag } from "../src/tools/submitFlag.ts";
import { readChallengeFile } from "../src/tools/fetchFile.ts";

test("crypto-01 is registered as a non-live crypto challenge (no connection, has files)", () => {
  assert.ok(listChallenges().some((c) => c.id === "crypto-01" && c.category === "crypto"));
  const detail = getChallenge("crypto-01");
  assert.ok(!("error" in detail));
  if ("error" in detail) return;
  assert.equal(detail.connection, undefined); // non-live: no network target
  assert.deepEqual(detail.files, ["brief.txt", "cipher.bin"]);
});

test("crypto-01 is solvable through fetch_file → brute-force XOR → submit_flag", async () => {
  // 1. Pull the ciphertext exactly as the agent would (fetch_file returns base64).
  const fetched = await readChallengeFile("crypto-01", "cipher.bin");
  assert.equal(fetched.ok, true);
  assert.equal(fetched.encoding, "base64");
  const cipher = Buffer.from(fetched.content!, "base64");

  // 2. Brute-force all 256 single-byte keys; keep decodes shaped like a flag.
  const candidates: string[] = [];
  for (let key = 0; key < 256; key++) {
    const decoded = Buffer.from(cipher.map((b) => b ^ key)).toString("latin1");
    if (decoded.startsWith("crucible{") && decoded.endsWith("}")) candidates.push(decoded);
  }
  assert.equal(candidates.length, 1, "exactly one key should yield a well-formed flag");
  const recovered = candidates[0]!;

  // 3. The recovered flag validates server-side (the agent does not decide correctness).
  assert.equal(submitFlag("crypto-01", recovered).correct, true);
});

test("crypto-01 rejects a wrong flag server-side", () => {
  assert.equal(submitFlag("crypto-01", "crucible{wrong}").correct, false);
});
