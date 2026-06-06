import { resolve } from "node:path";
import { getObjectStorageConfig } from "./object-storage.mjs";

export function buildStorageSummary(env = process.env) {
  const storePath = env.UPLOADCHECK_STORE_PATH || env.QCGENIE_STORE_PATH || "/tmp/uploadcheck/store.json";
  const durableUploadPath = env.UPLOADCHECK_DURABLE_STORAGE_DIR || env.QCGENIE_DURABLE_STORAGE_DIR || "";
  const objectStorage = getObjectStorageConfig(env);
  const supabaseEnvPresent = Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);
  const persistence = {
    ok: isDurablePath(storePath),
    mode: isDurablePath(storePath) ? "durable_json_store" : "json_store",
    storePath,
    supabaseEnvPresent
  };
  const storage = {
    ok: Boolean(durableUploadPath) || objectStorage.configured,
    mode: durableUploadPath ? "durable_filesystem" : (objectStorage.configured ? "object_storage_configured" : "render_temp_storage"),
    durableUploadPath: durableUploadPath || null,
    objectStorage: {
      configured: objectStorage.configured,
      bucketConfigured: Boolean(objectStorage.bucket),
      endpointConfigured: Boolean(objectStorage.endpoint),
      accessKeyConfigured: Boolean(objectStorage.accessKeyId),
      secretKeyConfigured: Boolean(objectStorage.secretAccessKey),
      endpointHost: hostForUrl(objectStorage.endpoint),
      publicBaseHost: hostForUrl(objectStorage.publicBaseUrl),
      prefix: objectStorage.prefix
    }
  };
  return {
    ok: persistence.ok && storage.ok,
    persistence,
    storage
  };
}

export function formatStorageSummary(summary = buildStorageSummary()) {
  const lines = [];
  lines.push(`UploadCheck persistence/storage config: ${summary.ok ? "READY" : "NOT READY"}`);
  lines.push("");
  lines.push(`${summary.persistence.ok ? "PASS" : "BLOCK"} persistence (${summary.persistence.mode})`);
  lines.push(`  storePath: ${summary.persistence.storePath}`);
  lines.push(`  supabaseEnvPresent: ${summary.persistence.supabaseEnvPresent ? "yes" : "no"}`);
  if (summary.persistence.supabaseEnvPresent) {
    lines.push("  supabaseStatus: env_present_but_json_store_adapter_active");
  }
  lines.push("");
  lines.push(`${summary.storage.ok ? "PASS" : "BLOCK"} storage (${summary.storage.mode})`);
  lines.push(`  durableUploadPath: ${summary.storage.durableUploadPath || "missing"}`);
  lines.push(`  objectStorage: ${summary.storage.objectStorage.configured ? "configured" : "not_configured"}`);
  lines.push(`  objectStorageFields: bucket=${status(summary.storage.objectStorage.bucketConfigured)} endpoint=${status(summary.storage.objectStorage.endpointConfigured)} accessKey=${status(summary.storage.objectStorage.accessKeyConfigured)} secretKey=${status(summary.storage.objectStorage.secretKeyConfigured)}`);
  if (summary.storage.objectStorage.endpointHost) lines.push(`  objectStorageEndpointHost: ${summary.storage.objectStorage.endpointHost}`);
  if (summary.storage.objectStorage.publicBaseHost) lines.push(`  objectStoragePublicBaseHost: ${summary.storage.objectStorage.publicBaseHost}`);
  lines.push(`  objectStoragePrefix: ${summary.storage.objectStorage.prefix || "uploads"}`);
  return lines.join("\n");
}

function isDurablePath(value) {
  const normalized = resolve(String(value || ""));
  return normalized.startsWith("/mnt/") || normalized.startsWith("/data/");
}

function hostForUrl(url) {
  if (!url) return null;
  try {
    return new URL(String(url)).host;
  } catch {
    return null;
  }
}

function status(value) {
  return value ? "yes" : "no";
}
