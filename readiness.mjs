import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { buildCheckoutUrl } from "./checkout-links.mjs";
import { validateSecretEncryptionKey } from "./secrets.mjs";
import { getObjectStorageConfig } from "./object-storage.mjs";

const PLANS = ["creator", "studio", "network"];

export function buildReadinessReport({ env = process.env, host = "", now = new Date().toISOString() } = {}) {
  const checkout = Object.fromEntries(
    PLANS.map((plan) => [plan, { configured: Boolean(buildCheckoutUrl(plan, env)) }])
  );
  const checkoutConfigured = PLANS.every((plan) => checkout[plan].configured);
  const customDomainActive = isUploadCheckHost(host);
  const secretEncryptionKey = env.UPLOADCHECK_SECRET_ENCRYPTION_KEY || env.QCGENIE_SECRET_ENCRYPTION_KEY || "";
  const secretEncryptionValidation = validateSecretEncryptionKey(secretEncryptionKey);
  const secretEncryptionConfigured = secretEncryptionValidation.ok;
  const apiAuthConfigured = Boolean(env.UPLOADCHECK_API_KEY || env.QCGENIE_API_KEY || env.UPLOADCHECK_API_KEY_SHA256 || env.QCGENIE_API_KEY_SHA256);
  const supabaseConfigured = Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);
  const storePath = env.UPLOADCHECK_STORE_PATH || env.QCGENIE_STORE_PATH || "/tmp/uploadcheck/store.json";
  const durableJsonStoreConfigured = isDurableStorePath(storePath);
  const persistenceConfigured = supabaseConfigured || durableJsonStoreConfigured;
  const durableFilesystemConfigured = Boolean(env.UPLOADCHECK_DURABLE_STORAGE_DIR || env.QCGENIE_DURABLE_STORAGE_DIR);
  const objectStorage = getObjectStorageConfig(env);
  const objectStorageConfigured = objectStorage.configured;
  const durableStorageConfigured = durableFilesystemConfigured || objectStorageConfigured;
  const bundledDemoClipPath = env.UPLOADCHECK_BUNDLED_DEMO_CLIP_PATH || resolve("dist/demo/uploadcheck-product-hunt-demo.mp4");
  const demoClipConfigured = Boolean(env.UPLOADCHECK_DEMO_CLIP_URL || env.UPLOADCHECK_PUBLIC_DEMO_URL || existsSync(bundledDemoClipPath));

  const checks = {
    api: {
      ok: true,
      detail: "API process is responding."
    },
    agentPreflight: {
      ok: true,
      detail: "Cost preflight endpoint and MCP tool are part of the shipped contract."
    },
    checkout: {
      ok: checkoutConfigured,
      plans: checkout
    },
    customDomain: {
      ok: customDomainActive,
      host: host || null,
      expected: ["api.uploadcheck.app", "uploadcheck.app"]
    },
    secretEncryption: {
      ok: secretEncryptionConfigured,
      reason: secretEncryptionValidation.reason,
      detail: secretEncryptionConfigured ? "Webhook signing secrets can be encrypted at rest with a strong key." : "Set a strong UPLOADCHECK_SECRET_ENCRYPTION_KEY before production webhooks. Generate one with npm run --silent secret:generate."
    },
    apiAuth: {
      ok: apiAuthConfigured,
      detail: apiAuthConfigured ? "Bearer API key enforcement is configured." : "Set UPLOADCHECK_API_KEY or UPLOADCHECK_API_KEY_SHA256 before public API use."
    },
    persistence: {
      ok: persistenceConfigured,
      mode: supabaseConfigured ? "supabase_configured" : (durableJsonStoreConfigured ? "durable_json_store" : "json_store"),
      detail: supabaseConfigured
        ? "Supabase env is present."
        : (durableJsonStoreConfigured ? "JSON store path is outside temp storage and suitable for mounted-disk persistence." : "JSON store is active in temp storage; production persistence still needs Supabase or mounted-disk store path.")
    },
    storage: {
      ok: durableStorageConfigured,
      mode: durableFilesystemConfigured ? "durable_filesystem" : (objectStorageConfigured ? "object_storage_configured" : "render_temp_storage"),
      detail: durableFilesystemConfigured
        ? "Durable filesystem storage is configured for uploaded media."
        : (objectStorageConfigured ? "S3-compatible object storage adapter is configured for uploaded media retention." : "Inline media uses temp files; large durable retention still needs mounted or object storage."),
      objectStorage: {
        configured: objectStorage.configured,
        bucketConfigured: Boolean(objectStorage.bucket),
        endpointConfigured: Boolean(objectStorage.endpoint),
        accessKeyConfigured: Boolean(objectStorage.accessKeyId),
        secretKeyConfigured: Boolean(objectStorage.secretAccessKey)
      }
    },
    demoClip: {
      ok: demoClipConfigured,
      detail: demoClipConfigured ? "Public demo clip is configured or bundled." : "Set UPLOADCHECK_DEMO_CLIP_URL or ship public/demo/uploadcheck-product-hunt-demo.mp4 before Product Hunt launch."
    },
    productHunt: {
      ok: checkoutConfigured && customDomainActive && secretEncryptionConfigured && persistenceConfigured && durableStorageConfigured && demoClipConfigured,
      required: ["checkout", "customDomain", "secretEncryption", "persistence", "storage", "demoClip"]
    }
  };

  return {
    service: "uploadcheck",
    generatedAt: now,
    readyForProductHunt: checks.productHunt.ok,
    checks
  };
}

function isUploadCheckHost(host) {
  const normalized = String(host || "").toLowerCase().split(":")[0];
  return normalized === "uploadcheck.app" || normalized === "api.uploadcheck.app" || normalized.endsWith(".uploadcheck.app");
}

function isDurableStorePath(storePath) {
  const normalized = resolve(String(storePath || "/tmp/uploadcheck/store.json"));
  return !(
    normalized.startsWith("/tmp/") ||
    normalized.startsWith("/var/tmp/") ||
    normalized.startsWith("/private/tmp/") ||
    normalized.startsWith("/var/folders/")
  );
}
