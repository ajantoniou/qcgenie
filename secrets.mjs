import { randomBytes } from "node:crypto";

export function generateSecretEncryptionKey() {
  return randomBytes(32).toString("base64url");
}

export function validateSecretEncryptionKey(value) {
  const raw = String(value || "").trim();
  if (!raw) return { ok: false, reason: "missing" };
  if (/\s/.test(raw)) return { ok: false, reason: "invalid_format" };

  const decodedBytes = decodedLength(raw);
  if (decodedBytes >= 32) return { ok: true, reason: "strong" };
  if (raw.length >= 32) return { ok: true, reason: "strong" };

  return { ok: false, reason: "too_short" };
}

function decodedLength(value) {
  if (/^[0-9a-f]+$/i.test(value) && value.length % 2 === 0) {
    return value.length / 2;
  }

  if (/^[A-Za-z0-9_-]+$/.test(value)) {
    try {
      return Buffer.from(value, "base64url").length;
    } catch {
      return 0;
    }
  }

  if (/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    try {
      return Buffer.from(value, "base64").length;
    } catch {
      return 0;
    }
  }

  return 0;
}
