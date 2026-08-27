/**
 * HTTP entrypoint — serves the Crucible MCP tools over the MCP Streamable HTTP transport, so
 * TrueForge can register this as a *remote* MCP server (`type: "remote"`, `url: .../mcp`).
 * TrueForge only connects to remote/URL MCP servers, not stdio subprocesses, which is also why
 * the MCP server is containerized onto the arena network (so `connect` can reach arena targets).
 *
 * Canonical stateful pattern: an `initialize` POST (no session header) creates a session +
 * transport; subsequent POST/GET/DELETE reuse it via the `mcp-session-id` header.
 *
 * Run: `npm run start:http`  ·  Env: CRUCIBLE_MCP_PORT (default 8848), CRUCIBLE_MCP_PATH (/mcp).
 */

import http from "node:http";
import { randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { createServer } from "./index.ts";

const PORT = Number(process.env.CRUCIBLE_MCP_PORT ?? 8848);
const MCP_PATH = process.env.CRUCIBLE_MCP_PATH ?? "/mcp";

const transports: Record<string, StreamableHTTPServerTransport> = {};

async function readJsonBody(req: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  if (chunks.length === 0) return undefined;
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function sendJson(res: http.ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(payload));
}

const httpServer = http.createServer(async (req, res) => {
  try {
    const url = req.url ?? "/";
    if (url === "/health" || url === "/") {
      sendJson(res, 200, { ok: true, server: "crucible-mcp-server", mcp: MCP_PATH });
      return;
    }
    if (!url.startsWith(MCP_PATH)) {
      sendJson(res, 404, { error: "not found" });
      return;
    }

    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    if (req.method === "POST") {
      const body = await readJsonBody(req);
      let transport = sessionId ? transports[sessionId] : undefined;

      if (!transport) {
        if (!isInitializeRequest(body)) {
          sendJson(res, 400, {
            jsonrpc: "2.0",
            error: { code: -32000, message: "No valid session; send an initialize request first." },
            id: null,
          });
          return;
        }
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (sid) => {
            transports[sid] = transport as StreamableHTTPServerTransport;
          },
        });
        transport.onclose = () => {
          if (transport?.sessionId) delete transports[transport.sessionId];
        };
        const server = createServer();
        await server.connect(transport);
      }
      await transport.handleRequest(req, res, body);
      return;
    }

    // GET (SSE stream) and DELETE (session teardown) require an existing session.
    if (req.method === "GET" || req.method === "DELETE") {
      const transport = sessionId ? transports[sessionId] : undefined;
      if (!transport) {
        sendJson(res, 400, { error: "unknown or missing mcp-session-id" });
        return;
      }
      await transport.handleRequest(req, res);
      return;
    }

    sendJson(res, 405, { error: "method not allowed" });
  } catch (err) {
    process.stderr.write(`crucible-mcp-server http error: ${String(err)}\n`);
    if (!res.headersSent) sendJson(res, 500, { error: "internal error" });
  }
});

httpServer.listen(PORT, () => {
  process.stderr.write(`crucible-mcp-server: Streamable HTTP on http://0.0.0.0:${PORT}${MCP_PATH}\n`);
});
