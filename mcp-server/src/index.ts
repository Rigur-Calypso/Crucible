/**
 * Crucible MCP server entrypoint.
 *
 * Registers the five Crucible tools with the official MCP TypeScript SDK
 * (@modelcontextprotocol/sdk v1.30.x) and serves them over stdio — the transport TrueForge
 * spawns a stdio MCP connector with. Each tool has an explicit zod input schema; the tool
 * bodies live in ./tools/* and are unit-tested independently of the transport.
 *
 * `connect` is the approval-gated boundary. Its allowlist is enforced in code in
 * ./policy/networkPolicy.ts (Layer 2); mark it approval-required on the TrueForge agent so the
 * human gate fires before it runs (see docs/TRUEFORGE_INTEGRATION.md §3).
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { listChallenges } from "./tools/listChallenges.ts";
import { getChallenge } from "./tools/getChallenge.ts";
import { resolveChallengeFile } from "./tools/fetchFile.ts";
import { submitFlag } from "./tools/submitFlag.ts";
import { connect } from "./tools/connect.ts";

/** Pure tool functions, exported for reuse/tests independent of the MCP transport. */
export const tools = { listChallenges, getChallenge, resolveChallengeFile, submitFlag, connect };

/**
 * Wrap a plain JSON result into an MCP tool result. The full JSON always travels in the text
 * content; `structuredContent` is attached only when the payload is a plain object, because the
 * MCP spec requires structured content to be a record (arrays/primitives would be rejected).
 */
function jsonResult(payload: unknown) {
  const content = [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }];
  const isRecord =
    typeof payload === "object" && payload !== null && !Array.isArray(payload);
  return isRecord
    ? { content, structuredContent: payload as Record<string, unknown> }
    : { content };
}

export function createServer(): McpServer {
  const server = new McpServer({ name: "crucible-mcp-server", version: "0.1.0" });

  server.registerTool(
    "list_challenges",
    {
      title: "List challenges",
      description:
        "List available arena challenges (lightweight metadata only, to keep context lean). " +
        "Call this first. Read-only; no approval required.",
      inputSchema: {},
    },
    async () => jsonResult(listChallenges()),
  );

  server.registerTool(
    "get_challenge",
    {
      title: "Get challenge detail",
      description:
        "Full description, connection info, and hints for one challenge. Read-only; no approval " +
        "required.",
      inputSchema: { challenge_id: z.string().min(1).describe("Challenge id, e.g. 'web-01'") },
    },
    async ({ challenge_id }) => jsonResult(getChallenge(challenge_id)),
  );

  server.registerTool(
    "fetch_file",
    {
      title: "Fetch challenge file",
      description:
        "Resolve a file that belongs to the named challenge. Rejects path traversal and never " +
        "performs an arbitrary filesystem read. Read-only; no approval required.",
      inputSchema: {
        challenge_id: z.string().min(1).describe("Owning challenge id, e.g. 'web-01'"),
        filename: z.string().min(1).describe("File within the challenge's own directory"),
      },
    },
    async ({ challenge_id, filename }) => jsonResult(resolveChallengeFile(challenge_id, filename)),
  );

  server.registerTool(
    "submit_flag",
    {
      title: "Submit flag",
      description:
        "Submit a captured flag. Correctness is validated SERVER-SIDE with a constant-time " +
        "compare — the agent does not decide correctness. Read-only; no approval required.",
      inputSchema: {
        challenge_id: z.string().min(1),
        flag: z.string().min(1).describe("The captured flag, e.g. 'crucible{...}'"),
      },
    },
    async ({ challenge_id, flag }) => jsonResult(submitFlag(challenge_id, flag)),
  );

  server.registerTool(
    "connect",
    {
      title: "Connect to a target (approval-gated)",
      description:
        "The single approval-gated action: open a connection to a live arena target. The " +
        "destination is validated in code against the arena allowlist (Layer 2) and FAILS " +
        "CLOSED — non-arena hosts, alternate encodings, and rebinding DNS are rejected. " +
        "Mark this tool approval-required on the agent so a human authorizes before it runs.",
      inputSchema: {
        host: z.string().min(1).describe("Arena host or IP, e.g. 'web-01' or '10.42.0.5'"),
        port: z.number().int().describe("Destination port; must be an allowed arena port"),
      },
      annotations: { destructiveHint: true, openWorldHint: true },
    },
    async ({ host, port }) => {
      const result = await connect({ host, port });
      return { ...jsonResult(result), isError: result.ok === false };
    },
  );

  return server;
}

async function main(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Serves until the transport (stdin) closes. Log to stderr so stdout stays clean MCP framing.
  process.stderr.write("crucible-mcp-server: listening on stdio\n");
}

// Run only when invoked directly (not when imported by tests).
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    process.stderr.write(`crucible-mcp-server fatal: ${String(err)}\n`);
    process.exit(1);
  });
}
