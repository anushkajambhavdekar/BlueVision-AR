import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import dotenv from "dotenv";
import { persistGeminiConfig } from "../src/geminiConfig.js";

test("persists Gemini settings locally while preserving other config values", (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "3dverse-gemini-config-"));
  const configPath = path.join(directory, ".env.local");
  context.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.writeFileSync(configPath, "LOCAL_SETTING=preserve-me\n");

  persistGeminiConfig(configPath, "test-gemini-key-that-is-not-real", "gemini-test-model");
  const parsed = dotenv.parse(fs.readFileSync(configPath));

  assert.equal(parsed.GEMINI_API_KEY, "test-gemini-key-that-is-not-real");
  assert.equal(parsed.GEMINI_MODEL, "gemini-test-model");
  assert.equal(parsed.LOCAL_SETTING, "preserve-me");
  assert.equal(fs.existsSync(`${configPath}.tmp`), false);
});
