#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildApiKeyMaterial } from "../api-auth.mjs";
import { buildCheckoutUrl } from "../checkout-links.mjs";
import { getObjectStorageConfig } from "../object-storage.mjs";
import { generateSecretEncryptionKey, validateSecretEncryptionKey } from "../secrets.mjs";

const API_BASE = "https://api.render.com/v1";
const WEB_SERVICE_ID = process.env.UPLOADCHECK_RENDER_WEB_SERVICE_ID || "srv-d8hk200jo6nc73er93u0";
const API_SERVICE_ID = process.env.UPLOADCHECK_RENDER_API_SERVICE_ID || "srv-d8hk74svikkc73cu6atg";

const FIXED_API_ENV = {
  NODE_ENV: "production",
  UPLOADCHECK_API_SCOPES: "jobs:write,jobs:read,reports:read,uploads:write,webhooks:write",
  UPLOADCHECK_STORE_PATH: "/mnt/uploadcheck/store.json",
  UPLOADCHECK_INLINE_MEDIA_MAX_MB: "128",
  UPLOADCHECK_DURABLE_STORAGE_DIR: "/mnt/uploadcheck/uploads"
};

const SECRET_ENV_KEYS = [
  "UPLOADCHECK_API_KEY",
  "UPLOADCHECK_API_KEY_SHA256",
  "UPLOADCHECK_CREATOR_CHECKOUT_URL",
  "UPLOADCHECK_STUDIO_CHECKOUT_URL",
  "UPLOADCHECK_NETWORK_CHECKOUT_URL",
  "UPLOADCHECK_LEMONSQUEEZY_STORE_SLUG",
  "UPLOADCHECK_CREATOR_VARIANT_ID",
  "UPLOADCHECK_STUDIO_VARIANT_ID",
  "UPLOADCHECK_NETWORK_VARIANT_ID",
  "UPLOADCHECK_SECRET_ENCRYPTION_KEY",
  "UPLOADCHECK_DEMO_CLIP_URL",
  "UPLOADCHECK_STORAGE_ACCESS_KEY_ID",
  "UPLOADCHECK_STORAGE_SECRET_ACCESS_KEY"
];

const REQUIRED_SECRET_GROUPS = [
  { label: "UPLOADCHECK_API_KEY or UPLOADCHECK_API_KEY_SHA256", keys: ["UPLOADCHECK_API_KEY", "UPLOADCHECK_API_KEY_SHA256"] },
  { label: "UPLOADCHECK_SECRET_ENCRYPTION_KEY", keys: ["UPLOADCHECK_SECRET_ENCRYPTION_KEY"] }
];

const OPTIONAL_API_ENV_KEYS = [
  "UPLOADCHECK_STORAGE_BUCKET",
  "UPLOADCHECK_STORAGE_ENDPOINT",
  "UPLOADCHECK_STORAGE_REGION",
  "UPLOADCHECK_STORAGE_PREFIX",
  "UPLOADCHECK_STORAGE_PUBLIC_BASE_URL"
];

const DOMAIN_PLAN = [
  { serviceId: WEB_SERVICE_ID, name: "uploadcheck.app" },
  { serviceId: WEB_SERVICE_ID, name: "www.uploadcheck.app" },
  { serviceId: API_SERVICE_ID, name: "api.uploadcheck.app" }
];

export function buildRenderLaunchPlan(env = process.env) {
  const envVars = Object.entries(FIXED_API_ENV).map(([key, value]) => ({ serviceId: API_SERVICE_ID, key, value, secret: false }));
  for (const key of OPTIONAL_API_ENV_KEYS) {
    const value = env[key];
    if (isFilledEnvValue(value)) envVars.push({ serviceId: API_SERVICE_ID, key, value, secret: false });
  }
  for (const key of SECRET_ENV_KEYS) {
    const value = env[key];
    if (isFilledEnvValue(value)) envVars.push({ serviceId: API_SERVICE_ID, key, value, secret: true });
  }
  const missingSecretInputs = REQUIRED_SECRET_GROUPS
    .filter((group) => !group.keys.some((key) => isFilledEnvValue(env[key])))
    .map((group) => group.label);
  for (const plan of ["creator", "studio", "network"]) {
    if (!hasResolvableCheckout(plan, env)) {
      missingSecretInputs.push(`UPLOADCHECK_${plan.toUpperCase()}_CHECKOUT_URL or UPLOADCHECK_LEMONSQUEEZY_STORE_SLUG plus UPLOADCHECK_${plan.toUpperCase()}_VARIANT_ID`);
    }
  }
  return {
    webServiceId: WEB_SERVICE_ID,
    apiServiceId: API_SERVICE_ID,
    domains: DOMAIN_PLAN,
    envVars,
    missingSecretInputs,
    placeholderInputs: [...OPTIONAL_API_ENV_KEYS, ...SECRET_ENV_KEYS, "RENDER_API_KEY"]
      .filter((key) => isPlaceholderEnvValue(env[key]))
  };
}

export function summarizePlan(plan) {
  return {
    webServiceId: plan.webServiceId,
    apiServiceId: plan.apiServiceId,
    domains: plan.domains.map((domain) => domain.name),
    envVars: plan.envVars.map((item) => ({ key: item.key, value: item.secret ? "<provided-secret>" : item.value })),
    missingSecretInputs: plan.missingSecretInputs,
    placeholderInputs: plan.placeholderInputs || []
  };
}

export function validateRenderLaunchEnv(env = process.env) {
  const plan = buildRenderLaunchPlan(env);
  const errors = [];
  const warnings = [];

  for (const key of plan.placeholderInputs || []) {
    errors.push({ key, reason: "placeholder_value", detail: "Replace the generated env-template placeholder before running render:apply." });
  }

  if (!isFilledEnvValue(env.RENDER_API_KEY)) {
    errors.push({ key: "RENDER_API_KEY", reason: "missing", detail: "Set a real Render API key before render:audit or render:apply." });
  }

  validateApiAuth(env, errors, warnings);
  validateCheckout(env, errors);
  validateSecret(env, errors);
  validateDurablePaths(env, errors);
  validateOptionalObjectStorage(env, errors);

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    plan: summarizePlan(plan)
  };
}

export function parseEnvFile(text) {
  const env = {};
  const lines = String(text || "").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(trimmed);
    if (!match) continue;
    env[match[1]] = parseEnvValue(match[2]);
  }
  return env;
}

export function validateRenderLaunchEnvFile(path, baseEnv = process.env) {
  if (!path) {
    return {
      ok: false,
      errors: [{ key: "env_file", reason: "missing_path", detail: "Pass a filled env file path, for example /tmp/uploadcheck-render-launch.env." }],
      warnings: [],
      plan: summarizePlan(buildRenderLaunchPlan(baseEnv))
    };
  }
  try {
    const fileEnv = parseEnvFile(readFileSync(resolve(path), "utf8"));
    return validateRenderLaunchEnv({ ...baseEnv, ...fileEnv });
  } catch (error) {
    return {
      ok: false,
      errors: [{
        key: "env_file",
        reason: "read_failed",
        detail: error instanceof Error ? error.message : "Could not read env file."
      }],
      warnings: [],
      plan: summarizePlan(buildRenderLaunchPlan(baseEnv))
    };
  }
}

export function buildEnvTemplate() {
  return buildEnvTemplateFromValues({
    apiKeySha256: "<generated_sha256>",
    secretEncryptionKey: "<generated_secret_encryption_key>"
  });
}

export function buildBootstrapEnvTemplate({ apiKeySha256, secretEncryptionKey }) {
  return buildEnvTemplateFromValues({ apiKeySha256, secretEncryptionKey });
}

function buildEnvTemplateFromValues({ apiKeySha256, secretEncryptionKey }) {
  const lines = [
    "# UploadCheck Render launch env template",
    "# Fill these locally, then run: set -a; source /path/to/filled.env; set +a; npm run render:plan && npm run render:validate-env && npm run render:apply",
    "# Do not commit a filled copy.",
    "",
    "# Required for npm run render:audit and npm run render:apply",
    "RENDER_API_KEY=\"<render_api_key>\"",
    "",
    "# API auth: prefer setting only the generated SHA-256 hash on Render.",
    "# Generate with: npm run --silent api-key:generate",
    `UPLOADCHECK_API_KEY_SHA256=${JSON.stringify(apiKeySha256)}`,
    "# Keep UPLOADCHECK_API_KEY private for clients; only set it on Render for bootstrap/testing.",
    "# UPLOADCHECK_API_KEY=\"<generated_bearer_token>\"",
    "# After Render deploy, use the private bearer token locally to probe hosted media ingress:",
    "# UPLOADCHECK_MEDIA_INGRESS_BASE_URL=\"https://qcgenie-api.onrender.com\" UPLOADCHECK_API_KEY=\"<generated_bearer_token>\" npm run media-ingress:verify",
    "",
    "# Checkout URLs: required for Product Hunt readiness.",
    "UPLOADCHECK_CREATOR_CHECKOUT_URL=\"https://...\"",
    "UPLOADCHECK_STUDIO_CHECKOUT_URL=\"https://...\"",
    "UPLOADCHECK_NETWORK_CHECKOUT_URL=\"https://...\"",
    "# Alternative checkout setup: comment out direct URLs above and set Lemon Squeezy store + variants.",
    "# UPLOADCHECK_LEMONSQUEEZY_STORE_SLUG=\"<lemonsqueezy_store_slug>\"",
    "# UPLOADCHECK_CREATOR_VARIANT_ID=\"<creator_variant_id>\"",
    "# UPLOADCHECK_STUDIO_VARIANT_ID=\"<studio_variant_id>\"",
    "# UPLOADCHECK_NETWORK_VARIANT_ID=\"<network_variant_id>\"",
    "",
    "# Webhook secret encryption: required before hosted webhooks are production-ready.",
    "# Generate with: npm run --silent secret:generate",
    `UPLOADCHECK_SECRET_ENCRYPTION_KEY=${JSON.stringify(secretEncryptionKey)}`,
    "",
    "# Optional public demo URL if the bundled demo clip is not shipped.",
    "# UPLOADCHECK_DEMO_CLIP_URL=\"https://...\"",
    "",
    "# Optional object storage retention. Mounted Render disk is the default durable path.",
    "# UPLOADCHECK_STORAGE_BUCKET=\"uploadcheck-artifacts\"",
    "# UPLOADCHECK_STORAGE_ENDPOINT=\"https://...\"",
    "# UPLOADCHECK_STORAGE_REGION=\"auto\"",
    "# UPLOADCHECK_STORAGE_PREFIX=\"uploads/\"",
    "# UPLOADCHECK_STORAGE_PUBLIC_BASE_URL=\"https://...\"",
    "# UPLOADCHECK_STORAGE_ACCESS_KEY_ID=\"<object_storage_access_key>\"",
    "# UPLOADCHECK_STORAGE_SECRET_ACCESS_KEY=\"<object_storage_secret_key>\"",
    "",
    "# Fixed durable settings applied by render:apply; included here for audit visibility.",
    ...Object.entries(FIXED_API_ENV).map(([key, value]) => `${key}=${JSON.stringify(value)}`),
    ""
  ];
  return lines.join("\n");
}

async function main() {
  const command = process.argv[2] || "audit";
  const plan = buildRenderLaunchPlan();
  if (command === "env-template") {
    console.log(buildEnvTemplate());
    return;
  }
  if (command === "bootstrap-env") {
    const material = buildApiKeyMaterial();
    const secretEncryptionKey = generateSecretEncryptionKey();
    console.error("# Store this bearer token in your password manager. It is for clients, not Render.");
    console.error(`UPLOADCHECK_API_KEY=${material.apiKey}`);
    console.log(buildBootstrapEnvTemplate({ apiKeySha256: material.sha256, secretEncryptionKey }));
    return;
  }
  if (command === "plan") {
    console.log(JSON.stringify(summarizePlan(plan), null, 2));
    return;
  }
  if (command === "validate-env") {
    const validation = validateRenderLaunchEnv();
    console.log(JSON.stringify(validation, null, 2));
    process.exit(validation.ok ? 0 : 1);
  }
  if (command === "validate-env-file") {
    const validation = validateRenderLaunchEnvFile(process.argv[3]);
    console.log(JSON.stringify(validation, null, 2));
    process.exit(validation.ok ? 0 : 1);
  }
  const token = process.env.RENDER_API_KEY;
  if (!isFilledEnvValue(token)) {
    console.error("Set a real RENDER_API_KEY before running Render launch operations.");
    process.exit(2);
  }
  if (command === "audit") {
    console.log(JSON.stringify(await auditRenderLaunch(token, plan), null, 2));
    return;
  }
  if (command === "apply") {
    const validation = validateRenderLaunchEnv();
    if (!validation.ok) {
      console.error("Render launch env validation failed. Run npm run render:validate-env and fix the reported inputs before render:apply.");
      console.error(JSON.stringify({ errors: validation.errors, warnings: validation.warnings }, null, 2));
      process.exit(2);
    }
    console.log(JSON.stringify(await applyRenderLaunch(token, plan), null, 2));
    return;
  }
  throw new Error("Usage: render-launch-ops.mjs [env-template|bootstrap-env|plan|validate-env|validate-env-file FILE|audit|apply]");
}

function parseEnvValue(rawValue) {
  const trimmed = String(rawValue || "").trim();
  if (!trimmed) return "";
  if ((trimmed.startsWith("\"") && trimmed.endsWith("\"")) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    const inner = trimmed.slice(1, -1);
    return trimmed.startsWith("\"")
      ? inner.replace(/\\n/g, "\n").replace(/\\"/g, "\"").replace(/\\\\/g, "\\")
      : inner;
  }
  const hashIndex = trimmed.search(/\s#/);
  return (hashIndex >= 0 ? trimmed.slice(0, hashIndex) : trimmed).trim();
}

function isFilledEnvValue(value) {
  return Boolean(value && !isPlaceholderEnvValue(value));
}

function isPlaceholderEnvValue(value) {
  if (!value) return false;
  const trimmed = String(value).trim();
  return trimmed === "..." || trimmed === "https://..." || /^<[^>]+>$/.test(trimmed);
}

function validateApiAuth(env, errors, warnings) {
  const hash = env.UPLOADCHECK_API_KEY_SHA256 || "";
  const plaintext = env.UPLOADCHECK_API_KEY || "";
  if (!hash && !plaintext) {
    errors.push({ key: "UPLOADCHECK_API_KEY_SHA256", reason: "missing", detail: "Generate API key material with npm run --silent api-key:generate and set the SHA-256 hash on Render." });
    return;
  }
  if (hash && !/^[0-9a-f]{64}$/i.test(hash)) {
    errors.push({ key: "UPLOADCHECK_API_KEY_SHA256", reason: "invalid_sha256", detail: "Expected a 64-character hex SHA-256 hash." });
  }
  if (plaintext) {
    warnings.push({ key: "UPLOADCHECK_API_KEY", reason: "plaintext_bootstrap", detail: "Prefer UPLOADCHECK_API_KEY_SHA256 on Render and keep the bearer token private for clients." });
  }
}

function validateCheckout(env, errors) {
  for (const plan of ["creator", "studio", "network"]) {
    const url = buildCheckoutUrl(plan, env);
    if (!url) {
      errors.push({ key: `UPLOADCHECK_${plan.toUpperCase()}_CHECKOUT_URL`, reason: "missing", detail: `Set a direct ${plan} checkout URL or Lemon Squeezy store slug plus variant id.` });
      continue;
    }
    if (!isHttpsUrl(url)) {
      errors.push({ key: `UPLOADCHECK_${plan.toUpperCase()}_CHECKOUT_URL`, reason: "invalid_url", detail: `${plan} checkout must resolve to an https URL.` });
    }
  }
}

function hasResolvableCheckout(plan, env) {
  const url = buildCheckoutUrl(plan, env);
  return isFilledEnvValue(url) && isHttpsUrl(url);
}

function validateSecret(env, errors) {
  const value = env.UPLOADCHECK_SECRET_ENCRYPTION_KEY || env.QCGENIE_SECRET_ENCRYPTION_KEY || "";
  const validation = validateSecretEncryptionKey(value);
  if (!validation.ok) {
    errors.push({ key: "UPLOADCHECK_SECRET_ENCRYPTION_KEY", reason: validation.reason, detail: "Generate a strong key with npm run --silent secret:generate." });
  }
}

function validateDurablePaths(env, errors) {
  const storePath = env.UPLOADCHECK_STORE_PATH || FIXED_API_ENV.UPLOADCHECK_STORE_PATH;
  const uploadPath = env.UPLOADCHECK_DURABLE_STORAGE_DIR || FIXED_API_ENV.UPLOADCHECK_DURABLE_STORAGE_DIR;
  if (!isDurableRenderPath(storePath)) {
    errors.push({ key: "UPLOADCHECK_STORE_PATH", reason: "not_durable", detail: "Use a mounted Render disk path such as /mnt/uploadcheck/store.json." });
  }
  if (!isDurableRenderPath(uploadPath)) {
    errors.push({ key: "UPLOADCHECK_DURABLE_STORAGE_DIR", reason: "not_durable", detail: "Use a mounted Render disk path such as /mnt/uploadcheck/uploads." });
  }
}

function validateOptionalObjectStorage(env, errors) {
  const keys = [
    "UPLOADCHECK_STORAGE_BUCKET",
    "UPLOADCHECK_STORAGE_ENDPOINT",
    "UPLOADCHECK_STORAGE_ACCESS_KEY_ID",
    "UPLOADCHECK_STORAGE_SECRET_ACCESS_KEY"
  ];
  if (!keys.some((key) => isFilledEnvValue(env[key]))) return;
  const config = getObjectStorageConfig(env);
  for (const key of keys) {
    if (!isFilledEnvValue(env[key])) {
      errors.push({ key, reason: "missing_object_storage_field", detail: "Object storage is optional, but if configured it needs bucket, endpoint, access key, and secret key." });
    }
  }
  if (config.endpoint && !isHttpsUrl(config.endpoint)) {
    errors.push({ key: "UPLOADCHECK_STORAGE_ENDPOINT", reason: "invalid_url", detail: "Object storage endpoint must be an https URL." });
  }
  if (env.UPLOADCHECK_STORAGE_PUBLIC_BASE_URL && !isHttpsUrl(env.UPLOADCHECK_STORAGE_PUBLIC_BASE_URL)) {
    errors.push({ key: "UPLOADCHECK_STORAGE_PUBLIC_BASE_URL", reason: "invalid_url", detail: "Public storage base URL must be https when set." });
  }
}

function isDurableRenderPath(value) {
  const normalized = resolve(String(value || ""));
  return normalized.startsWith("/mnt/");
}

function isHttpsUrl(value) {
  try {
    const parsed = new URL(String(value));
    return parsed.protocol === "https:" && Boolean(parsed.hostname);
  } catch {
    return false;
  }
}

export async function auditRenderLaunch(token, plan = buildRenderLaunchPlan()) {
  const [apiEnv, webDomains, apiDomains] = await Promise.all([
    listEnvVars(token, plan.apiServiceId),
    listCustomDomains(token, plan.webServiceId),
    listCustomDomains(token, plan.apiServiceId)
  ]);
  const envByKey = new Map(apiEnv.map((entry) => [entry.envVar?.key, entry.envVar]));
  return {
    domains: {
      web: domainStatus(plan.domains.filter((domain) => domain.serviceId === plan.webServiceId), webDomains),
      api: domainStatus(plan.domains.filter((domain) => domain.serviceId === plan.apiServiceId), apiDomains)
    },
    env: plan.envVars.map((item) => {
      const current = envByKey.get(item.key);
      return {
        key: item.key,
        configured: Boolean(current),
        expected: item.secret ? "<secret>" : item.value,
        matchesExpected: item.secret ? Boolean(current) : current?.value === item.value
      };
    }),
    missingSecretInputs: plan.missingSecretInputs
  };
}

export async function applyRenderLaunch(token, plan = buildRenderLaunchPlan()) {
  const domainResults = [];
  for (const domain of plan.domains) {
    domainResults.push(await addCustomDomain(token, domain.serviceId, domain.name));
  }
  const envResults = [];
  for (const item of plan.envVars) {
    envResults.push(await putEnvVar(token, item.serviceId, item.key, item.value));
  }
  const deploys = await Promise.all([
    triggerDeploy(token, plan.webServiceId),
    triggerDeploy(token, plan.apiServiceId)
  ]);
  return {
    domains: domainResults,
    env: envResults.map((result) => ({ key: result.key, ok: result.ok, status: result.status })),
    deploys,
    missingSecretInputs: plan.missingSecretInputs
  };
}

function domainStatus(expected, actual) {
  return expected.map((domain) => {
    const found = actual.find((item) => item.name === domain.name);
    return { name: domain.name, configured: Boolean(found), verificationStatus: found?.verificationStatus || null };
  });
}

async function listEnvVars(token, serviceId) {
  return renderFetch(token, `/services/${serviceId}/env-vars`);
}

async function listCustomDomains(token, serviceId) {
  return renderFetch(token, `/services/${serviceId}/custom-domains`);
}

async function putEnvVar(token, serviceId, key, value) {
  const response = await renderFetch(token, `/services/${serviceId}/env-vars/${encodeURIComponent(key)}`, {
    method: "PUT",
    body: { value },
    raw: true
  });
  return { key, ok: response.ok, status: response.status };
}

async function addCustomDomain(token, serviceId, name) {
  const response = await renderFetch(token, `/services/${serviceId}/custom-domains`, {
    method: "POST",
    body: { name },
    raw: true
  });
  return { name, ok: response.ok || response.status === 409, status: response.status };
}

async function triggerDeploy(token, serviceId) {
  const response = await renderFetch(token, `/services/${serviceId}/deploys`, {
    method: "POST",
    body: {},
    raw: true
  });
  return { serviceId, ok: response.ok, status: response.status };
}

async function renderFetch(token, path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: options.method || "GET",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      authorization: `Bearer ${token}`
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  if (options.raw) return response;
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(`Render API ${response.status}: ${text}`);
  return payload;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
