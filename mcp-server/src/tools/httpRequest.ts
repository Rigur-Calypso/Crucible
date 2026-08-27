/**
 * http_request — the approval-gated action that actually EXECUTES against a live arena target.
 *
 * Where `connect` only proves TCP reachability, `http_request` sends a real HTTP request (e.g.
 * `POST /login` with a SQL-injection payload) to the allowlisted target and returns the response —
 * so the agent can confirm exploitability and capture the flag.
 *
 * Same security guarantees as `connect`, both in code:
 *   1. Policy (Layer 2): destination must pass `evaluateDestination` — arena subnet, allowed port,
 *      fail-closed. A denied destination never touches the network.
 *   2. Anti-rebinding: the socket connects to the PINNED resolved IP; the original hostname is sent
 *      only as the `Host` header.
 * The response body is capped so a hostile/large response can't exhaust memory.
 *
 * Mark this tool approval-required on the agent (alongside `connect`) — it is a live-target action.
 */

import http from "node:http";
import { evaluateDestination } from "../policy/networkPolicy.ts";

export interface HttpRequestInput {
  host: string;
  port: number;
  method?: string;
  path?: string;
  body?: string;
  content_type?: string;
}

export interface HttpRequestResult {
  ok: boolean;
  blocked?: boolean;
  status?: number;
  body?: string;
  truncated?: boolean;
  target?: string;
  reason: string;
}

/** Injectable transport so tests can exercise the tool without real infrastructure. */
export type HttpFetcher = (args: {
  ip: string;
  port: number;
  host: string;
  method: string;
  path: string;
  body?: string;
  contentType?: string;
  timeoutMs: number;
  maxBytes: number;
}) => Promise<{ status: number; body: string; truncated: boolean }>;

export const defaultFetcher: HttpFetcher = (a) =>
  new Promise((resolve, reject) => {
    const headers: Record<string, string> = { Host: a.host, Accept: "*/*" };
    if (a.body !== undefined) {
      headers["Content-Type"] = a.contentType ?? "application/x-www-form-urlencoded";
      headers["Content-Length"] = String(Buffer.byteLength(a.body));
    }
    const req = http.request(
      { host: a.ip, port: a.port, method: a.method, path: a.path, headers, timeout: a.timeoutMs },
      (res) => {
        const chunks: Buffer[] = [];
        let total = 0;
        let truncated = false;
        res.on("data", (c: Buffer) => {
          if (truncated) return;
          if (total + c.length > a.maxBytes) {
            chunks.push(c.subarray(0, a.maxBytes - total));
            truncated = true;
            res.destroy();
          } else {
            chunks.push(c);
            total += c.length;
          }
        });
        res.on("end", () =>
          resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8"), truncated }),
        );
        res.on("close", () =>
          resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8"), truncated }),
        );
      },
    );
    req.on("timeout", () => req.destroy(new Error(`request timed out after ${a.timeoutMs}ms`)));
    req.on("error", reject);
    if (a.body !== undefined) req.write(a.body);
    req.end();
  });

export async function httpRequest(
  input: HttpRequestInput,
  fetcher: HttpFetcher = defaultFetcher,
  timeoutMs = 5000,
  maxBytes = 64 * 1024,
): Promise<HttpRequestResult> {
  const decision = await evaluateDestination(input.host, input.port);
  if (!decision.allowed || decision.resolvedIp === undefined) {
    return { ok: false, blocked: true, reason: decision.reason };
  }
  const method = (input.method ?? "GET").toUpperCase();
  const path = input.path ?? "/";
  const target = `${decision.resolvedIp}:${input.port}`;
  try {
    const res = await fetcher({
      ip: decision.resolvedIp,
      port: input.port,
      host: input.host,
      method,
      path,
      body: input.body,
      contentType: input.content_type,
      timeoutMs,
      maxBytes,
    });
    return {
      ok: true,
      status: res.status,
      body: res.body,
      truncated: res.truncated,
      target,
      reason: `HTTP ${res.status} from ${target}${path}`,
    };
  } catch (err) {
    return {
      ok: false,
      target,
      reason: `policy allowed but request failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
