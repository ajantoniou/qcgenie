#!/usr/bin/env node
import { buildStorageSummary, formatStorageSummary } from "../launch-storage.mjs";

const summary = process.env.UPLOADCHECK_STORAGE_PROBE === "hosted"
  ? await buildHostedStorageSummary()
  : buildStorageSummary();
console.log(formatStorageSummary(summary));
process.exit(summary.ok ? 0 : 1);

async function buildHostedStorageSummary() {
  const baseUrl = trimTrailingSlash(process.env.UPLOADCHECK_STORAGE_PROBE_BASE_URL || process.env.UPLOADCHECK_API_BASE_URL || "https://api.uploadcheck.app");
  const url = `${baseUrl}/v1/readiness`;
  try {
    const response = await fetch(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(8000)
    });
    const payload = await response.json();
    const persistenceOk = payload?.checks?.persistence?.ok === true;
    const storageOk = payload?.checks?.storage?.ok === true;
    return {
      ok: response.ok && persistenceOk && storageOk,
      hostedProof: {
        checked: true,
        ok: response.ok && persistenceOk && storageOk,
        url,
        httpStatus: response.status
      },
      persistence: {
        ok: persistenceOk,
        mode: payload?.checks?.persistence?.mode || "unknown",
        storePath: "hosted readiness proof",
        supabaseEnvPresent: Boolean(payload?.checks?.persistence?.supabaseEnvPresent),
        writableProbe: { checked: true, ok: persistenceOk, reason: persistenceOk ? null : "hosted_persistence_not_ready" }
      },
      storage: {
        ok: storageOk,
        mode: payload?.checks?.storage?.mode || "unknown",
        durableUploadPath: "hosted readiness proof",
        writableProbe: { checked: true, ok: storageOk, reason: storageOk ? null : "hosted_storage_not_ready" },
        objectStorage: {
          configured: Boolean(payload?.checks?.storage?.objectStorage?.configured),
          bucketConfigured: Boolean(payload?.checks?.storage?.objectStorage?.bucketConfigured),
          endpointConfigured: Boolean(payload?.checks?.storage?.objectStorage?.endpointConfigured),
          accessKeyConfigured: Boolean(payload?.checks?.storage?.objectStorage?.accessKeyConfigured),
          secretKeyConfigured: Boolean(payload?.checks?.storage?.objectStorage?.secretKeyConfigured),
          endpointHost: null,
          publicBaseHost: null,
          prefix: "uploads"
        }
      }
    };
  } catch (error) {
    return {
      ok: false,
      hostedProof: {
        checked: true,
        ok: false,
        url,
        httpStatus: null,
        reason: error instanceof Error ? error.message.slice(0, 160) : "unknown_hosted_probe_error"
      },
      persistence: {
        ok: false,
        mode: "hosted_readiness_unavailable",
        storePath: "hosted readiness proof",
        supabaseEnvPresent: false,
        writableProbe: { checked: true, ok: false, reason: "hosted_readiness_unavailable" }
      },
      storage: {
        ok: false,
        mode: "hosted_readiness_unavailable",
        durableUploadPath: "hosted readiness proof",
        writableProbe: { checked: true, ok: false, reason: "hosted_readiness_unavailable" },
        objectStorage: {
          configured: false,
          bucketConfigured: false,
          endpointConfigured: false,
          accessKeyConfigured: false,
          secretKeyConfigured: false,
          endpointHost: null,
          publicBaseHost: null,
          prefix: "uploads"
        }
      }
    };
  }
}

function trimTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}
