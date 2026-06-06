import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { buildApiKeyMaterial, generateApiKey, hashApiKey } from "../../api-auth.mjs";

describe("API auth helpers", () => {
  it("generates UploadCheck bearer keys and SHA-256 hashes", () => {
    const apiKey = generateApiKey();
    const material = buildApiKeyMaterial(apiKey);

    expect(apiKey).toMatch(/^uck_[A-Za-z0-9_-]{40,}$/);
    expect(material).toEqual({
      apiKey,
      sha256: hashApiKey(apiKey)
    });
    expect(material.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("prints Render-safe hash material without npm wrapper noise", () => {
    const output = execFileSync("node", ["scripts/generate-api-key.mjs", "--key=uck_test_key"], {
      encoding: "utf8"
    });

    expect(output).toContain("UPLOADCHECK_API_KEY=uck_test_key");
    expect(output).toContain(`UPLOADCHECK_API_KEY_SHA256=${hashApiKey("uck_test_key")}`);
    expect(output).not.toContain("> uploadcheck-app");
  });
});
