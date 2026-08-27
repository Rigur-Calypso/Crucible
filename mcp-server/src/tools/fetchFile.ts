/**
 * fetch_file — serves ONLY files that belong to the named challenge, and returns their CONTENT
 * (not just a path). Rejects path traversal and symlink escapes, and never performs an arbitrary
 * filesystem read.
 *
 * Artifact root: a dedicated, agent-facing directory (env `CRUCIBLE_CHALLENGE_FILES_ROOT`,
 * default `mcp-server/challenge-files/`). This is deliberately SEPARATE from the arena container
 * sources so the challenge's solution/flag is never served through this tool — only files placed
 * under `<root>/<challengeId>/` are reachable.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { promises as fs } from "node:fs";

const HERE = path.dirname(fileURLToPath(import.meta.url)); // mcp-server/src/tools
/** Agent-facing artifact root. Override with CRUCIBLE_CHALLENGE_FILES_ROOT. */
export const CHALLENGE_FILES_ROOT =
  process.env.CRUCIBLE_CHALLENGE_FILES_ROOT ?? path.resolve(HERE, "../../challenge-files");

export interface ResolveResult {
  ok: boolean;
  path?: string;
  reason?: string;
}

/**
 * Resolve a requested file to an absolute path provably inside the challenge's own directory,
 * or reject. Pure/synchronous containment check (no I/O) — fails closed on anything ambiguous.
 */
export function resolveChallengeFile(
  challengeId: string,
  filename: string,
  root: string = CHALLENGE_FILES_ROOT,
): ResolveResult {
  if (!/^[a-z0-9-]+$/.test(challengeId)) return { ok: false, reason: "invalid challenge id" };
  if (typeof filename !== "string" || filename.length === 0) return { ok: false, reason: "empty filename" };
  if (filename.includes("\0")) return { ok: false, reason: "null byte in filename" };

  const base = path.resolve(root, challengeId);
  const target = path.resolve(base, filename);

  // Containment: target must be base itself or strictly under base/.
  if (target !== base && !target.startsWith(base + path.sep)) {
    return { ok: false, reason: "path traversal rejected (fail closed)" };
  }
  return { ok: true, path: target };
}

export interface ReadResult {
  ok: boolean;
  filename?: string;
  encoding?: "base64";
  bytes?: number;
  content?: string;
  reason?: string;
}

/**
 * Resolve, verify (real path stays inside the challenge dir — defeats symlink escape), then read
 * and return the file's bytes as base64. Fails closed: traversal, symlink escape, missing file,
 * or a non-regular file all return `{ ok: false, reason }`.
 */
export async function readChallengeFile(
  challengeId: string,
  filename: string,
  root: string = CHALLENGE_FILES_ROOT,
): Promise<ReadResult> {
  const resolved = resolveChallengeFile(challengeId, filename, root);
  if (!resolved.ok || resolved.path === undefined) {
    return { ok: false, reason: resolved.reason ?? "unresolved" };
  }
  try {
    // Symlink-escape guard: the real target must stay within the real challenge directory.
    const realBase = await fs.realpath(path.resolve(root, challengeId));
    const realTarget = await fs.realpath(resolved.path);
    if (realTarget !== realBase && !realTarget.startsWith(realBase + path.sep)) {
      return { ok: false, reason: "symlink escapes challenge directory (fail closed)" };
    }
    const st = await fs.stat(realTarget);
    if (!st.isFile()) return { ok: false, reason: "not a regular file" };
    const buf = await fs.readFile(realTarget);
    return {
      ok: true,
      filename,
      encoding: "base64",
      bytes: buf.length,
      content: buf.toString("base64"),
    };
  } catch {
    // ENOENT and any realpath/stat error → fail closed as "not found".
    return { ok: false, reason: "file not found or unreadable" };
  }
}
