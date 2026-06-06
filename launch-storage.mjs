import { resolve } from "node:path";
import { dirname, join } from "node:path";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { getObjectStorageConfig } from "./object-storage.mjs";

export function buildStorageSummary(env = process.env, options = {}) {
  const storePath = env.UPLOADCHECK_STORE_PATH || env.QCGENIE_STORE_PATH || "/tmp/uploadcheck/store.json";
  const durableUploadPath = env.UPLOADCHECK_DURABLE_STORAGE_DIR || env.QCGENIE_DURABLE_STORAGE_DIR || "";
  const objectStorage = getObjectStorageConfig(env);
  const supabaseEnvPresent = Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);
  const probeEnabled = options.probeFilesystem === true || env.UPLOADCHECK_STORAGE_PROBE === "1";
  const persistenceDurable = isDurablePath(storePath, options.durablePathPrefixes);
  const persistenceProbe = probeEnabled && persistenceDurable
    ? probeWritableDir(dirname(storePath), "store")
    : { checked: false, ok: null, reason: null };
  const storageProbe = probeEnabled && durableUploadPath
    ? probeWritableDir(durableUploadPath, "uploads")
    : { checked: false, ok: null, reason: null };
  const persistence = {
    ok: persistenceDurable && (persistenceProbe.ok !== false),
    mode: persistenceDurable ? "durable_json_store" : "json_store",
    storePath,
    supabaseEnvPresent,
    writableProbe: persistenceProbe
  };
  const storage = {
    ok: (Boolean(durableUploadPath) && storageProbe.ok !== false) || objectStorage.configured,
    mode: durableUploadPath ? "durable_filesystem" : (objectStorage.configured ? "object_storage_configured" : "render_temp_storage"),
    durableUploadPath: durableUploadPath || null,
    writableProbe: storageProbe,
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
  lines.push(`  writableProbe: ${formatProbe(summary.persistence.writableProbe)}`);
  if (summary.persistence.supabaseEnvPresent) {
    lines.push("  supabaseStatus: env_present_but_json_store_adapter_active");
  }
  lines.push("");
  lines.push(`${summary.storage.ok ? "PASS" : "BLOCK"} storage (${summary.storage.mode})`);
  lines.push(`  durableUploadPath: ${summary.storage.durableUploadPath || "missing"}`);
  lines.push(`  writableProbe: ${formatProbe(summary.storage.writableProbe)}`);
  lines.push(`  objectStorage: ${summary.storage.objectStorage.configured ? "configured" : "not_configured"}`);
  lines.push(`  objectStorageFields: bucket=${status(summary.storage.objectStorage.bucketConfigured)} endpoint=${status(summary.storage.objectStorage.endpointConfigured)} accessKey=${status(summary.storage.objectStorage.accessKeyConfigured)} secretKey=${status(summary.storage.objectStorage.secretKeyConfigured)}`);
  if (summary.storage.objectStorage.endpointHost) lines.push(`  objectStorageEndpointHost: ${summary.storage.objectStorage.endpointHost}`);
  if (summary.storage.objectStorage.publicBaseHost) lines.push(`  objectStoragePublicBaseHost: ${summary.storage.objectStorage.publicBaseHost}`);
  lines.push(`  objectStoragePrefix: ${summary.storage.objectStorage.prefix || "uploads"}`);
  return lines.join("\n");
}

function isDurablePath(value, prefixes = ["/mnt/", "/data/"]) {
  const normalized = resolve(String(value || ""));
  return prefixes.some((prefix) => normalized.startsWith(resolve(prefix) + "/") || normalized === resolve(prefix));
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

function probeWritableDir(dir, label) {
  const targetDir = resolve(String(dir || ""));
  const file = join(targetDir, `.uploadcheck-${label}-probe-${process.pid}-${Date.now()}`);
  try {
    mkdirSync(targetDir, { recursive: true });
    writeFileSync(file, "uploadcheck-storage-probe");
    rmSync(file, { force: true });
    return { checked: true, ok: true, reason: null };
  } catch (error) {
    return {
      checked: true,
      ok: false,
      reason: error instanceof Error ? error.message.slice(0, 160) : "unknown_probe_error"
    };
  }
}

function formatProbe(probe) {
  if (!probe?.checked) return "not_checked";
  if (probe.ok) return "pass";
  return `fail (${probe.reason || "unknown"})`;
}
