#!/usr/bin/env node
/**
 * trueforge-setup.mjs — wire the Crucible into a running TrueForge (standalone) harness:
 *   1. register the Crucible MCP server as a remote connector (URL),
 *   2. (optional) configure a model provider from an env-supplied API key,
 *   3. create the `crucible-agent` with the approval gate on `connect` and the sandbox enabled.
 *
 * No secrets are stored in the repo: the model API key is read from the environment only.
 *
 * Prereqs: TrueForge running (`npx @truefoundry/trueforge`) and the arena+MCP up
 * (`docker compose -f arena/docker-compose.yml up -d --build --wait`).
 *
 * Usage:
 *   node scripts/trueforge-setup.mjs                      # connector + agent (no model key)
 *   TF_MODEL_API_KEY=sk-... node scripts/trueforge-setup.mjs   # also configure the model
 *
 * Env (all optional except the key, if you want a runnable agent):
 *   TRUEFORGE_URL   default http://localhost:8790
 *   MCP_URL         default http://127.0.0.1:8848/mcp   (the containerized MCP server)
 *   MODEL_PROVIDER  default openai        (openai|anthropic|google-gemini|fireworks|...)
 *   MODEL_ID        default gpt-5.5       (upstream model id sent to the provider)
 *   MODEL_NAME      default gpt-5-5       (local name; the agent uses <provider>/<MODEL_NAME>)
 *   TF_MODEL_API_KEY  your provider API key (never committed; unset = skip provider + agent-run)
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

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SYSTEM_PROMPT = readFileSync(path.resolve(HERE, "../agent/system-prompt.md"), "utf8")
  .split(/^---$/m)
  .slice(2)
  .join("---")
  .trim();

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
      "Crucible arena tools: list_challenges, get_challenge, fetch_file, submit_flag, connect (approval-gated).",
  };
  const existing = await api("GET", "/settings/mcp-servers/crucible");
  if (existing.status === 200) {
    // Already registered; update the collection (PUT is list-level in TrueForge).
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
  const manifest = {
    type: PROVIDER,
    auth: {
      api_key: KEY,
      models: [
        {
          model_id: MODEL_ID,
          name: MODEL_NAME,
          properties: { context_length: 128000, max_output_tokens: 16000 },
        },
      ],
    },
  };
  const r = await api("POST", "/settings/model-providers", { manifest });
  console.log(`model provider (${PROVIDER}) -> ${r.status}`);
  if (r.status >= 400) console.log("  ", JSON.stringify(r.json));
  return r.status < 400;
}

async function createAgent(modelReady) {
  const agent = {
    name: "crucible-agent",
    manifest: {
      model: { name: `${PROVIDER}/${MODEL_NAME}` },
      instructions: SYSTEM_PROMPT,
      mcp_servers: [
        {
          name: "crucible",
          enable_tools: ["@all"],
          // The "License to Hack" gate: only `connect` (the live-target action) needs approval.
          require_approval_for_tools: ["connect"],
        },
      ],
      config: { sandbox: { enabled: true } },
    },
  };
  const existing = await api("GET", "/agents/crucible-agent");
  const verb = existing.status === 200 ? "PUT" : "POST";
  const pathname = existing.status === 200 ? "/agents/crucible-agent" : "/agents";
  const r = await api(verb, pathname, verb === "POST" ? agent : agent.manifest);
  console.log(`agent ${verb} -> ${r.status}`);
  if (r.status >= 400) {
    console.log("  ", JSON.stringify(r.json));
    if (!modelReady) {
      console.log(
        "  (expected without a model — set TF_MODEL_API_KEY, re-run, then the agent is runnable.)",
      );
    }
  } else {
    console.log("  agent 'crucible-agent' ready. Open the TrueForge chat UI and give it:");
    console.log(
      '  "Investigate web-01 and determine whether authentication can be bypassed. Ask me before executing against the target."',
    );
  }
}

async function main() {
  console.log(`TrueForge: ${TF}  ·  MCP: ${MCP_URL}`);
  await upsertConnector();
  const modelReady = await configureModel();
  await createAgent(modelReady);
}

main().catch((e) => {
  console.error("setup failed:", e);
  process.exit(1);
});
