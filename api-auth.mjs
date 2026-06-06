import { createHash, randomBytes } from "node:crypto";

export function generateApiKey(bytes = 32) {
  return `uck_${randomBytes(bytes).toString("base64url")}`;
}

export function hashApiKey(apiKey) {
  return createHash("sha256").update(String(apiKey || "")).digest("hex");
}

export function buildApiKeyMaterial(apiKey = generateApiKey()) {
  return {
    apiKey,
    sha256: hashApiKey(apiKey)
  };
}
