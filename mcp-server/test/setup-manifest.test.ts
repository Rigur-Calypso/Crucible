/**
 * Unit tests for the setup script's pure helpers (scripts/trueforge-setup.mjs): the model-provider
 * manifest builder (native vs OpenAI-compatible/custom) and the MODEL_BASE_URL validation. These
 * exercise the custom-provider (Groq) path without touching the live TrueForge API.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
// @ts-expect-error — importing the .mjs setup script for its exported pure helpers
import { buildModelManifest, assertModelBaseUrl } from "../../scripts/trueforge-setup.mjs";

test("native provider manifest omits base_url and nests only api_key under auth", () => {
  const m = buildModelManifest({
    provider: "google-gemini",
    key: "test-key",
    modelId: "gemini-3.5-flash-lite",
    modelName: "gemini-3-5-flash-lite",
  });
  assert.equal(m.type, "google-gemini");
  assert.equal(m.base_url, undefined);
  assert.equal(m.auth.api_key, "test-key");
  assert.equal(m.models[0].model_id, "gemini-3.5-flash-lite");
  assert.equal(m.models[0].name, "gemini-3-5-flash-lite");
});

test("OpenAI-compatible (Groq) manifest is type=custom with name + base_url", () => {
  const m = buildModelManifest({
    provider: "groq",
    key: "test-key",
    modelId: "openai/gpt-oss-120b",
    modelName: "gpt-oss-120b",
    baseUrl: "https://api.groq.com/openai/v1",
  });
  assert.equal(m.type, "custom");
  assert.equal(m.name, "groq"); // custom provider name → agent FQN is groq/<modelName>
  assert.equal(m.base_url, "https://api.groq.com/openai/v1");
  assert.equal(m.auth.api_key, "test-key");
  assert.equal(m.models[0].model_id, "openai/gpt-oss-120b");
});

test("assertModelBaseUrl accepts https and rejects http / malformed", () => {
  assert.doesNotThrow(() => assertModelBaseUrl("https://api.groq.com/openai/v1"));
  assert.throws(() => assertModelBaseUrl("http://api.groq.com/openai/v1"), /https/);
  assert.throws(() => assertModelBaseUrl("http://127.0.0.1:11434/v1"), /https/);
  assert.throws(() => assertModelBaseUrl("not a url"), /not a valid URL/);
});
