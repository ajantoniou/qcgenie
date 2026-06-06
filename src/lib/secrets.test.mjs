import { describe, expect, it } from "vitest";
import { generateSecretEncryptionKey, validateSecretEncryptionKey } from "../../secrets.mjs";

describe("secret encryption key helpers", () => {
  it("generates a strong base64url encryption key", () => {
    const key = generateSecretEncryptionKey();

    expect(key).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(validateSecretEncryptionKey(key)).toEqual({ ok: true, reason: "strong" });
  });

  it("rejects missing or short keys", () => {
    expect(validateSecretEncryptionKey("")).toEqual({ ok: false, reason: "missing" });
    expect(validateSecretEncryptionKey("secret")).toEqual({ ok: false, reason: "too_short" });
  });

  it("rejects noisy copied command output with whitespace", () => {
    expect(validateSecretEncryptionKey("> uploadcheck-app@1.0.0 secret:generate\nabc")).toEqual({ ok: false, reason: "invalid_format" });
  });

  it("accepts 32-byte hex keys", () => {
    expect(validateSecretEncryptionKey("a".repeat(64))).toEqual({ ok: true, reason: "strong" });
  });
});
