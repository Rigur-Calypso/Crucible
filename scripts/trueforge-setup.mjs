#!/usr/bin/env node
/**
 * trueforge-setup.mjs — wire the Crucible into a running TrueForge (standalone) harness:
 *   1. register the Crucible MCP server as a remote connector (URL + optional header auth),
 *   2. (optional) configure a model provider from an env-supplied API key,
 *   3. create the `crucible-agent` with the approval gate on `connect` (only when a model exists).
 *
 * No secrets are stored in the repo: the model API key and the MCP token are read from env only.
 * Network destinations are constrained to loopback (this host / the arena is reached through the
 * containerized MCP, not from here).
 *
 * Prereqs: TrueForge running (`npx @truefoundry/trueforge`) and the arena+MCP up
 * (`CRUCIBLE_MCP_TOKEN=... docker compose -f arena/docker-compose.yml up -d --build --wait`).
 *
 * Usage:
 *   node scripts/trueforge-setup.mjs                          # connector only (no model, no agent)
 *   TF_MODEL_API_KEY=sk-... node scripts/trueforge-setup.mjs  # + model provider + runnable agent
 *
 * Env (see .env.example):
 *   TRUEFORGE_URL (default http://localhost:8790) · MCP_URL (default http://127.0.0.1:8848/mcp)
 *   MODEL_PROVIDER (native type, or any name if MODEL_BASE_URL is set) · MODEL_ID · MODEL_NAME
 *   MODEL_BASE_URL (set for OpenAI-compatible providers e.g. Groq → registered as `custom`)
 *   TF_MODEL_API_KEY (provider key; unset ⇒ skip provider + agent) · CRUCIBLE_MCP_TOKEN (MCP auth)
 *   CRUCIBLE_ENABLE_SANDBOX ("true" to enable the agent sandbox; default off — see note below)
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const TF = process.env.TRUEFORGE_URL ?? "http://localhost:8790";
const API = `${TF}/api/v1`;
const MCP_URL = process.env.MCP_URL ?? "http://127.0.0.1:8848/mcp";
const PROVIDER = process.env.MODEL_PROVIDER ?? "openai";
const MODEL_ID = process.env.MODEL_ID ?? "gpt-5.5";
const MODEL_NAME = process.env.MODEL_NAME ?? "gpt-5-5";
const KEY = process.env.TF_MODEL_API_KEY;
const MCP_TOKEN = process.env.CRUCIBLE_MCP_TOKEN ?? "";
// The agent sandbox is OFF by default: in standalone mode TrueForge does not expose a sandbox
// egress allowlist, so agent-written code could reach outside the arena and bypass `connect`.
// Enable it (CRUCIBLE_ENABLE_SANDBOX=true) only against the self-owned arena. See SECURITY_MODEL §3a.
const ENABLE_SANDBOX = process.env.CRUCIBLE_ENABLE_SANDBOX === "true";

const LOOPBACK = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
function assertLoopback(label, value) {
  let host;
  try {
    host = new URL(value).hostname.replace(/^\[|\]$/g, "");
  } catch {
    throw new Error(`${label} is not a valid URL: ${value}`);
  }
  if (!LOOPBACK.has(host)) {
    throw new Error(
      `${label} must point at loopback (localhost/127.0.0.1/::1), refusing external host "${host}".`,
    );
  }
}

/**
 * The model provider endpoint (Groq/OpenAI/etc.) is intentionally an EXTERNAL cloud API — it is
 * NOT an arena target and is never subject to the arena allowlist. But it must be https so the API
 * key and prompts are never sent in plaintext or smuggled to internal infra over http.
 */
export function assertModelBaseUrl(value) {
  let u;
  try {
    u = new URL(value);
  } catch {
    throw new Error(`MODEL_BASE_URL is not a valid URL: ${value}`);
  }
  if (u.protocol !== "https:") {
    throw new Error(
      `MODEL_BASE_URL must be an https:// endpoint (got "${u.protocol}//"). The model provider is ` +
        `an external cloud API; never send the key over plaintext or to internal infra.`,
    );
  }
}

/**
 * Pure builder for the TrueForge model-provider manifest. OpenAI-compatible providers (baseUrl set)
 * register as `custom` (type/name/base_url/auth/models); native providers omit base_url. Exported
 * so the shape is unit-testable without touching the live API.
 */
export function buildModelManifest({ provider, key, modelId, modelName, baseUrl }) {
  const models = [
    { model_id: modelId, name: modelName, properties: { context_length: 128000, max_output_tokens: 16000 } },
  ];
  return baseUrl
    ? { type: "custom", name: provider, base_url: baseUrl, auth: { api_key: key }, models }
    : { type: provider, auth: { api_key: key }, models };
}

const HERE = path.dirname(fileURLToPath(import.meta.url));
function loadSystemPrompt() {
  const raw = readFileSync(path.resolve(HERE, "../agent/system-prompt.md"), "utf8");
  // The file has a single `---` line separating the paste-note header from the prompt body.
  const parts = raw.split(/^---$/m);
  const body = (parts.length > 1 ? parts.slice(1).join("---") : parts[0]).trim();
  if (!body) throw new Error("system prompt parsed empty — check agent/system-prompt.md structure");
  return body;
}
const SYSTEM_PROMPT = loadSystemPrompt();

async function api(method, pathname, body) {
  const res = await fetch(API + pathname, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    json = text;
  }
  return { status: res.status, json };
}

async function upsertConnector() {
  const manifest = {
    type: "remote",
    name: "crucible",
    url: MCP_URL,
    description:
      "Crucible arena tools: list_challenges, get_challenge, fetch_file, submit_flag, connect + http_request (approval-gated).",
  };
  if (MCP_TOKEN) {
    manifest.auth = { type: "header", headers: { Authorization: `Bearer ${MCP_TOKEN}` } };
  } else {
    console.warn("WARNING: CRUCIBLE_MCP_TOKEN unset — MCP endpoint is unauthenticated (dev only).");
  }
  const existing = await api("GET", "/settings/mcp-servers/crucible");
  if (existing.status === 200) {
    const r = await api("PUT", "/settings/mcp-servers", { manifest });
    console.log(`connector already registered; PUT update -> ${r.status}`);
  } else {
    const r = await api("POST", "/settings/mcp-servers", { manifest });
    console.log(`connector POST -> ${r.status}`);
  }
  const tools = await api("GET", "/mcp-servers/crucible/tools");
  const names = Array.isArray(tools.json) ? tools.json.map((t) => t.name) : tools.json;
  console.log("  tools visible to TrueForge:", names);
}

async function configureModel() {
  if (!KEY) {
    console.log("model provider: SKIPPED (set TF_MODEL_API_KEY to configure a runnable model).");
    return false;
  }
  // OpenAI-compatible providers (e.g. Groq) aren't native types — register them as `custom`
  // with a base_url. Set MODEL_BASE_URL to switch into that mode; PROVIDER becomes the custom
  // provider's name, so the agent references `${PROVIDER}/${MODEL_NAME}`.
  const BASE_URL = process.env.MODEL_BASE_URL;
  if (BASE_URL) assertModelBaseUrl(BASE_URL);
  const manifest = buildModelManifest({
    provider: PROVIDER,
    key: KEY,
    modelId: MODEL_ID,
    modelName: MODEL_NAME,
    baseUrl: BASE_URL,
  });
  let r = await api("POST", "/settings/model-providers", { manifest });
  // If the provider already exists, update it instead.
  if (r.status === 409) {
    r = await api("PUT", "/settings/model-providers", { manifest });
    console.log(`model provider (${PROVIDER}) already existed; PUT update -> ${r.status}`);
  } else {
    console.log(`model provider (${PROVIDER}) -> ${r.status}`);
  }
  if (r.status >= 400) console.log("  ", JSON.stringify(r.json));
  return r.status < 400;
}

async function createAgent() {
  const manifest = {
    model: { name: `${PROVIDER}/${MODEL_NAME}` },
    instructions: SYSTEM_PROMPT,
    mcp_servers: [
      {
        name: "crucible",
        enable_tools: ["@all"],
        // The "License to Hack" gate: the live-target actions (connect + http_request) need approval.
        require_approval_for_tools: ["connect", "http_request"],
      },
    ],
    config: {
      sandbox: { enabled: ENABLE_SANDBOX },
      // Trim per-request context: the Crucible workflow doesn't need generative UI, the
      // ask-user tool, or dynamic subagents. Disabling them keeps requests small (important on
      // token-per-minute-limited tiers, e.g. Groq free) and the agent focused on the tools + gate.
      generative_ui: { enabled: false },
      ask_user_questions: { enabled: false },
      dynamic_sub_agents: { enabled: false },
    },
  };
  // TrueForge GET /agents/:name returns 404; list all and find by name instead.
  const listRes = await api("GET", "/agents");
  const agents = Array.isArray(listRes.json?.data) ? listRes.json.data : [];
  const existing = agents.find((a) => a.name === "crucible-agent");
  const r = existing
    ? await api("PUT", `/agents/${existing.id}`, { manifest })
    : await api("POST", "/agents", { name: "crucible-agent", manifest });
  console.log(`agent ${existing ? "PUT" : "POST"} -> ${r.status}`);
  if (r.status >= 400) {
    console.log("  ", JSON.stringify(r.json));
  } else {
    console.log(`  agent 'crucible-agent' ready (sandbox ${ENABLE_SANDBOX ? "ON" : "OFF"}).`);
    console.log("  Open the TrueForge chat UI and give it:");
    console.log(
      '  "Investigate web-01 and determine whether authentication can be bypassed. Ask me before executing against the target."',
    );
  }
}

async function main() {
  assertLoopback("TRUEFORGE_URL", TF);
  assertLoopback("MCP_URL", MCP_URL);
  console.log(`TrueForge: ${TF}  ·  MCP: ${MCP_URL}`);
  await upsertConnector();
  const modelReady = await configureModel();
  if (!modelReady) {
    console.log(
      "agent: SKIPPED — no model configured. Set TF_MODEL_API_KEY and re-run to create a runnable agent.",
    );
    return;
  }
  await createAgent();
}

// Run only when invoked directly (not when imported by tests).
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error("setup failed:", e.message ?? e);
    process.exit(1);
  });
}
