import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { CHECKOUT_PLANS, resolveCheckout } from "./checkout-links.mjs";
import { LAUNCH_PROOF_CONTRACT_VERSION } from "./launch-evidence.mjs";
import { validateSecretEncryptionKey } from "./secrets.mjs";
import { getObjectStorageConfig } from "./object-storage.mjs";
import { hostForUrl, isSecureCheckoutUrl, redactCheckoutUrl } from "./launch-checkout.mjs";

export function buildReadinessReport({ env = process.env, host = "", now = new Date().toISOString() } = {}) {
  const checkout = Object.fromEntries(
    CHECKOUT_PLANS.map((plan) => [plan, checkoutReadinessForPlan(plan, env)])
  );
  const checkoutConfigured = CHECKOUT_PLANS.every((plan) => checkout[plan].ok);
  const checkoutWebhookSecretConfigured = Boolean(env.UPLOADCHECK_LEMONSQUEEZY_WEBHOOK_SECRET || env.LEMONSQUEEZY_WEBHOOK_SECRET);
  const customDomainActive = isUploadCheckHost(host);
  const secretEncryptionKey = env.UPLOADCHECK_SECRET_ENCRYPTION_KEY || "";
  const secretEncryptionValidation = validateSecretEncryptionKey(secretEncryptionKey);
  const secretEncryptionConfigured = secretEncryptionValidation.ok;
  const apiAuthConfigured = Boolean(env.UPLOADCHECK_API_KEY || env.UPLOADCHECK_API_KEY_SHA256);
  const supabaseEnvPresent = Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);
  const storePath = env.UPLOADCHECK_STORE_PATH || "/tmp/uploadcheck/store.json";
  const durableJsonStoreConfigured = isDurableStorePath(storePath);
  const persistenceConfigured = durableJsonStoreConfigured;
  const durableFilesystemConfigured = Boolean(env.UPLOADCHECK_DURABLE_STORAGE_DIR);
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
    renderMediaIngress: {
      ok: true,
      modes: {
        inlineEphemeral: {
          ok: true,
          accepts: ["media_base64", "video_base64", "audio_base64", "data_url"],
          contentTypes: ["video/mp4", "video/quicktime", "video/webm", "audio/mpeg", "audio/wav", "audio/webm", "image/jpeg", "image/png", "image/webp"],
          defaultMaxMb: 128,
          storageMode: "render_temp_storage",
          asyncSupported: false
        },
        signedUpload: {
          ok: true,
          endpoint: "POST /v1/uploads + PUT signedPutUrl + POST /v1/qc/jobs upload_id",
          maxUploadMbEnv: "UPLOADCHECK_MAX_UPLOAD_MB",
          storageMode: "durable_filesystem_or_object_storage_when_configured"
        }
      },
      detail: "Small video/audio/image payloads can be sent inline as base64 and evaluated synchronously from temporary Render storage; larger files use signed upload before job creation."
    },
    checkout: {
      ok: checkoutConfigured,
      plans: checkout
    },
    checkoutWebhook: {
      ok: checkoutWebhookSecretConfigured,
      provider: "lemonsqueezy",
      signatureHeader: "X-Signature",
      detail: checkoutWebhookSecretConfigured
        ? "Signed Lemon Squeezy checkout webhooks can provision paid MCP/API keys."
        : "Set UPLOADCHECK_LEMONSQUEEZY_WEBHOOK_SECRET so signed checkout webhooks can provision paid MCP/API keys."
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
      mode: durableJsonStoreConfigured ? "durable_json_store" : "json_store",
      supabaseEnvPresent,
      detail: supabaseEnvPresent
        ? "Supabase env is present, but the current server still uses JsonStore; configure mounted-disk persistence until the Supabase store adapter ships."
        : (durableJsonStoreConfigured ? "JSON store path is outside temp storage and suitable for mounted-disk persistence." : "JSON store is active in temp storage; production persistence still needs mounted-disk store path.")
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
      ok: checkoutConfigured && checkoutWebhookSecretConfigured && customDomainActive && secretEncryptionConfigured && apiAuthConfigured && persistenceConfigured && durableStorageConfigured && demoClipConfigured,
      required: ["checkout", "checkoutWebhook", "customDomain", "secretEncryption", "apiAuth", "persistence", "storage", "demoClip"]
    }
  };

  return {
    service: "uploadcheck",
    contractVersion: LAUNCH_PROOF_CONTRACT_VERSION,
    generatedAt: now,
    readyForProductHunt: checks.productHunt.ok,
    checks
  };
}

function checkoutReadinessForPlan(plan, env) {
  const resolved = resolveCheckout(plan, env);
  const secure = isSecureCheckoutUrl(resolved.url);
  return {
    ok: resolved.configured && secure,
    configured: resolved.configured,
    secure,
    reason: checkoutReason(resolved, secure),
    source: resolved.source,
    sourceKey: resolved.sourceKey,
    host: hostForUrl(resolved.url),
    redactedUrl: redactCheckoutUrl(resolved.url)
  };
}

function checkoutReason(resolved, secure) {
  if (!resolved.configured) return "missing";
  if (!hostForUrl(resolved.url)) return "invalid_url";
  if (!secure) return "checkout_url_must_be_https";
  return "ready";
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
