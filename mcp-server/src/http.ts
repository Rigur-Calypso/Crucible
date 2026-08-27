/**
 * HTTP entrypoint — serves the Crucible MCP tools over the MCP Streamable HTTP transport, so
 * TrueForge can register this as a *remote* MCP server (`type: "remote"`, `url: .../mcp`).
 * TrueForge only connects to remote/URL MCP servers, not stdio subprocesses, which is also why
 * the MCP server is containerized onto the arena network (so `connect` can reach arena targets).
 *
 * Hardening (this endpoint can invoke the approval-gated `connect`, so it is defended):
 *   - Published to loopback only (see docker-compose `127.0.0.1:8848:8848`).
 *   - Optional bearer-token auth: if a token is set, every /mcp request must present
 *     `Authorization: Bearer <token>` (TrueForge sends it via the connector's header auth). This
 *     stops any other local process from invoking `connect` directly.
 *   - DNS-rebinding protection (Host allowlist) enabled on the transport.
 *   - Bounded request bodies (413 over the limit) — no unbounded buffering.
 *
 * Canonical stateful pattern: an `initialize` POST (no session header) creates a session +
 * transport; subsequent POST/GET/DELETE reuse it via the `mcp-session-id` header.
 *
 * Run: `npm run start:http`  ·  Env: CRUCIBLE_MCP_PORT (8848), CRUCIBLE_MCP_PATH (/mcp),
 *   CRUCIBLE_MCP_TOKEN (shared secret; strongly recommended), CRUCIBLE_MCP_ALLOWED_HOSTS
 *   (comma-separated Host allowlist), CRUCIBLE_MCP_MAX_BODY_BYTES (default 4 MiB).
 */

import http from "node:http";
import { randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { createServer } from "./index.ts";

export interface HttpServerOptions {
  path?: string;
  token?: string;
  maxBodyBytes?: number;
  allowedHosts?: string[];
  enableDnsRebindingProtection?: boolean;
}

class BodyTooLarge extends Error {}

/** Read a JSON body, aborting with 413 once the byte limit is exceeded (no unbounded buffering). */
async function readJsonBody(req: http.IncomingMessage, maxBytes: number): Promise<unknown> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = chunk as Buffer;
    total += buf.length;
    if (total > maxBytes) {
      // Stop accumulating and drain the rest so we can still send a clean 413 (do NOT reset the
      // socket, which would prevent the client from receiving the response).
      req.resume();
      throw new BodyTooLarge();
    }
    chunks.push(buf);
  }
  if (chunks.length === 0) return undefined;
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function sendJson(res: http.ServerResponse, status: number, payload: unknown): void {
  if (res.headersSent) return;
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(payload));
}

/** Build the Crucible MCP HTTP server. Config is explicit (testable); the CLI fills it from env. */
export function createHttpServer(opts: HttpServerOptions = {}): http.Server {
  const MCP_PATH = opts.path ?? "/mcp";
  const TOKEN = opts.token ?? "";
  const MAX_BODY_BYTES = opts.maxBodyBytes ?? 4 * 1024 * 1024;
  const ALLOWED_HOSTS = opts.allowedHosts ?? [];
  const DNS_PROTECT = opts.enableDnsRebindingProtection ?? ALLOWED_HOSTS.length > 0;

  const transports: Record<string, StreamableHTTPServerTransport> = {};

  const authorized = (req: http.IncomingMessage): boolean =>
    !TOKEN || req.headers["authorization"] === `Bearer ${TOKEN}`;

  const newTransport = (): StreamableHTTPServerTransport => {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      enableDnsRebindingProtection: DNS_PROTECT,
      allowedHosts: ALLOWED_HOSTS,
      onsessioninitialized: (sid) => {
        transports[sid] = transport;
      },
    });
    transport.onclose = () => {
      if (transport.sessionId) delete transports[transport.sessionId];
    };
    return transport;
  };

  return http.createServer(async (req, res) => {
    try {
      const url = req.url ?? "/";
      if (url === "/health" || url === "/") {
        sendJson(res, 200, { ok: true, server: "crucible-mcp-server", mcp: MCP_PATH, auth: Boolean(TOKEN) });
        return;
      }
      if (!url.startsWith(MCP_PATH)) {
        sendJson(res, 404, { error: "not found" });
        return;
      }
      if (!authorized(req)) {
        sendJson(res, 401, { error: "unauthorized" });
        return;
      }

      const sessionId = req.headers["mcp-session-id"] as string | undefined;

      if (req.method === "POST") {
        let body: unknown;
        try {
          body = await readJsonBody(req, MAX_BODY_BYTES);
        } catch (err) {
          if (err instanceof BodyTooLarge) sendJson(res, 413, { error: "request body too large" });
          else sendJson(res, 400, { error: "invalid JSON body" });
          return;
        }

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
          transport = newTransport();
          const server = createServer();
          await server.connect(transport);
        }
        await transport.handleRequest(req, res, body);
        return;
      }

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
      sendJson(res, 500, { error: "internal error" });
    }
  });
}

// CLI entry: build options from env and listen.
if (import.meta.url === `file://${process.argv[1]}`) {
  const PORT = Number(process.env.CRUCIBLE_MCP_PORT ?? 8848);
  const path = process.env.CRUCIBLE_MCP_PATH ?? "/mcp";
  const token = process.env.CRUCIBLE_MCP_TOKEN ?? "";
  const allowedHosts = (process.env.CRUCIBLE_MCP_ALLOWED_HOSTS ?? `127.0.0.1:${PORT},localhost:${PORT}`)
    .split(",")
    .map((h) => h.trim())
    .filter(Boolean);
  const maxBodyBytes = Number(process.env.CRUCIBLE_MCP_MAX_BODY_BYTES ?? 4 * 1024 * 1024);
  const server = createHttpServer({ path, token, allowedHosts, maxBodyBytes });
  server.listen(PORT, () => {
    const auth = token ? "token-auth ON" : "token-auth OFF (set CRUCIBLE_MCP_TOKEN)";
    process.stderr.write(
      `crucible-mcp-server: Streamable HTTP on :${PORT}${path} · ${auth} · hosts=${allowedHosts.join(",")}\n`,
    );
  });
}
