import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { buildCheckoutUrl } from "./checkout-links.mjs";

const PLANS = ["creator", "studio", "network"];

export function buildReadinessReport({ env = process.env, host = "", now = new Date().toISOString() } = {}) {
  const checkout = Object.fromEntries(
    PLANS.map((plan) => [plan, { configured: Boolean(buildCheckoutUrl(plan, env)) }])
  );
  const checkoutConfigured = PLANS.every((plan) => checkout[plan].configured);
  const customDomainActive = isUploadCheckHost(host);
  const secretEncryptionConfigured = Boolean(env.UPLOADCHECK_SECRET_ENCRYPTION_KEY || env.QCGENIE_SECRET_ENCRYPTION_KEY);
  const apiAuthConfigured = Boolean(env.UPLOADCHECK_API_KEY || env.QCGENIE_API_KEY || env.UPLOADCHECK_API_KEY_SHA256 || env.QCGENIE_API_KEY_SHA256);
  const supabaseConfigured = Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);
  const durableStorageConfigured = Boolean(env.UPLOADCHECK_STORAGE_BUCKET || env.UPLOADCHECK_S3_BUCKET || env.UPLOADCHECK_R2_BUCKET);
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
      detail: secretEncryptionConfigured ? "Webhook signing secrets can be encrypted at rest." : "Set UPLOADCHECK_SECRET_ENCRYPTION_KEY before production webhooks."
    },
    apiAuth: {
      ok: apiAuthConfigured,
      detail: apiAuthConfigured ? "Bearer API key enforcement is configured." : "Set UPLOADCHECK_API_KEY or UPLOADCHECK_API_KEY_SHA256 before public API use."
    },
    persistence: {
      ok: supabaseConfigured,
      mode: supabaseConfigured ? "supabase_configured" : "json_store",
      detail: supabaseConfigured ? "Supabase env is present." : "JSON store is active; production Supabase persistence is still pending."
    },
    storage: {
      ok: durableStorageConfigured,
      mode: durableStorageConfigured ? "durable_object_storage_configured" : "render_temp_storage",
      detail: durableStorageConfigured ? "Durable media/artifact storage env is present." : "Inline media uses temp files; large durable retention still needs object storage."
    },
    demoClip: {
      ok: demoClipConfigured,
      detail: demoClipConfigured ? "Public demo clip is configured or bundled." : "Set UPLOADCHECK_DEMO_CLIP_URL or ship public/demo/uploadcheck-product-hunt-demo.mp4 before Product Hunt launch."
    },
    productHunt: {
      ok: checkoutConfigured && customDomainActive && secretEncryptionConfigured && supabaseConfigured && durableStorageConfigured && demoClipConfigured,
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
