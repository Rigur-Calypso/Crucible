/**
 * Crucible MCP server entrypoint.
 *
 * Registers the six Crucible tools with the official MCP TypeScript SDK
 * (@modelcontextprotocol/sdk v1.30.x). Each tool has an explicit zod input schema; the tool
 * bodies live in ./tools/* and are unit-tested independently of the transport.
 *
 * `connect` and `http_request` are the approval-gated live-target actions. Their allowlist is
 * enforced in code in ./policy/networkPolicy.ts (Layer 2); mark BOTH approval-required on the
 * TrueForge agent so the human gate fires before they run (see docs/TRUEFORGE_INTEGRATION.md §3).
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { listChallenges } from "./tools/listChallenges.ts";
import { getChallenge } from "./tools/getChallenge.ts";
import { readChallengeFile } from "./tools/fetchFile.ts";
import { submitFlag } from "./tools/submitFlag.ts";
import { connect, type Connector } from "./tools/connect.ts";
import { httpRequest, type HttpFetcher } from "./tools/httpRequest.ts";

/** Pure tool functions, exported for reuse/tests independent of the MCP transport. */
export const tools = { listChallenges, getChallenge, readChallengeFile, submitFlag, connect, httpRequest };

/**
 * Wrap a plain JSON result into an MCP tool result. The full JSON always travels in the text
 * content; `structuredContent` is attached only when the payload is a plain object, because the
 * MCP spec requires structured content to be a record (arrays/primitives would be rejected).
 *
 * `isError` marks a failed operation so clients/agents don't treat a failure as success. Pass it
 * for any domain result that represents failure (unknown challenge, rejected path, blocked
 * destination, etc.) — mirroring what the `connect` handler already does.
 */
function jsonResult(payload: unknown, isError = false) {
  const content = [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }];
  const isRecord =
    typeof payload === "object" && payload !== null && !Array.isArray(payload);
  const base = isRecord
    ? { content, structuredContent: payload as Record<string, unknown> }
    : { content };
  return isError ? { ...base, isError: true } : base;
}

export interface CreateServerOptions {
  /** Override the TCP connector used by `connect` (tests inject a deterministic one). */
  connector?: Connector;
  /** Override the HTTP fetcher used by `http_request` (tests inject a deterministic one). */
  fetcher?: HttpFetcher;
}

export function createServer(options: CreateServerOptions = {}): McpServer {
  const server = new McpServer({ name: "crucible-mcp-server", version: "0.1.0" });

  server.registerTool(
    "list_challenges",
    {
      title: "List challenges",
      description:
        "List available arena challenges (lightweight metadata only, to keep context lean). " +
        "Call this first. Read-only; no approval required.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
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
      annotations: { readOnlyHint: true },
    },
    async ({ challenge_id }) => {
      const result = getChallenge(challenge_id);
      return jsonResult(result, "error" in result);
    },
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
      annotations: { readOnlyHint: true },
    },
    async ({ challenge_id, filename }) => {
      const result = await readChallengeFile(challenge_id, filename);
      return jsonResult(result, result.ok === false);
    },
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
      annotations: { readOnlyHint: true },
    },
    async ({ challenge_id, flag }) => {
      // A wrong-but-valid flag (correct:false, no reason) is a normal result, not an error.
      // Only an unprocessable submission (unknown challenge / invalid input) sets isError.
      const result = submitFlag(challenge_id, flag);
      return jsonResult(result, result.reason !== undefined);
    },
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
      const result = options.connector
        ? await connect({ host, port }, options.connector)
        : await connect({ host, port });
      return jsonResult(result, result.ok === false);
    },
  );

  server.registerTool(
    "http_request",
    {
      title: "Send an HTTP request to a target (approval-gated)",
      description:
        "The live-target EXECUTION action: send a real HTTP request (e.g. POST /login with a " +
        "SQL-injection payload) to an arena target and return the response, so you can confirm " +
        "exploitability and capture the flag. Same allowlist as `connect` (Layer 2, fail-closed): " +
        "non-arena hosts/ports are rejected. Mark this approval-required on the agent. " +
        "Example body for the web-01 login bypass: `username=admin'--&password=x` " +
        "(application/x-www-form-urlencoded).",
      inputSchema: {
        host: z.string().min(1).describe("Arena host or IP, e.g. 'web-01'"),
        port: z.number().int().describe("Destination port, e.g. 5000"),
        method: z.string().optional().describe("HTTP method (default GET); use POST for /login"),
        path: z.string().optional().describe("Request path, e.g. '/login'"),
        body: z.string().optional().describe("Request body, e.g. \"username=admin'--&password=x\""),
        content_type: z
          .string()
          .optional()
          .describe("Content-Type (default application/x-www-form-urlencoded)"),
      },
      annotations: { destructiveHint: true, openWorldHint: true },
    },
    async ({ host, port, method, path, body, content_type }) => {
      const input = { host, port, method, path, body, content_type };
      const result = options.fetcher
        ? await httpRequest(input, options.fetcher)
        : await httpRequest(input);
      return jsonResult(result, result.ok === false);
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
