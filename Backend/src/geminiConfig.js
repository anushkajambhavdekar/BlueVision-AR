import fs from "node:fs";
import dotenv from "dotenv";

export function persistGeminiConfig(localSecretsFile, apiKey, model) {
  const savedConfig = fs.existsSync(localSecretsFile)
    ? dotenv.parse(fs.readFileSync(localSecretsFile))
    : {};
  savedConfig.GEMINI_API_KEY = apiKey;
  savedConfig.GEMINI_MODEL = model;
  const contents = Object.entries(savedConfig)
    .map(([name, value]) => `${name}=${JSON.stringify(value)}`)
    .join("\n") + "\n";
  const temporaryFile = `${localSecretsFile}.tmp`;
  fs.writeFileSync(temporaryFile, contents, { mode: 0o600 });
  fs.renameSync(temporaryFile, localSecretsFile);
}
