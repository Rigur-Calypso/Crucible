/**
 * fetch_file — serves ONLY files that belong to the named challenge. Rejects path traversal
 * and never performs an arbitrary filesystem read. STUB: wire to the MCP SDK + real artifact root.
 */

import path from "node:path";

/** TODO: real per-challenge artifact root, mounted read-only. */
const CHALLENGES_ROOT = "/arena";

export interface ResolveResult {
  ok: boolean;
  path?: string;
  reason?: string;
}

/**
 * Resolve a requested file to an absolute path that is provably inside the challenge's own
 * directory, or reject. Fails closed on anything ambiguous.
 */
export function resolveChallengeFile(challengeId: string, filename: string): ResolveResult {
  if (!/^[a-z0-9-]+$/.test(challengeId)) return { ok: false, reason: "invalid challenge id" };
  if (typeof filename !== "string" || filename.length === 0) return { ok: false, reason: "empty filename" };
  if (filename.includes("\0")) return { ok: false, reason: "null byte in filename" };

  const base = path.resolve(CHALLENGES_ROOT, challengeId);
  const target = path.resolve(base, filename);

  // Containment: target must be base itself or strictly under base/.
  if (target !== base && !target.startsWith(base + path.sep)) {
    return { ok: false, reason: "path traversal rejected (fail closed)" };
  }
  return { ok: true, path: target };
  // NOTE: after resolving, also verify the final path is not a symlink escaping `base`
  // (lstat + realpath) before reading. TODO(verify in impl).
}
