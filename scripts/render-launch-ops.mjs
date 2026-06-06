#!/usr/bin/env node
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

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
  "UPLOADCHECK_SECRET_ENCRYPTION_KEY",
  "UPLOADCHECK_DEMO_CLIP_URL",
  "UPLOADCHECK_STORAGE_ACCESS_KEY_ID",
  "UPLOADCHECK_STORAGE_SECRET_ACCESS_KEY"
];

const REQUIRED_SECRET_GROUPS = [
  { label: "UPLOADCHECK_API_KEY or UPLOADCHECK_API_KEY_SHA256", keys: ["UPLOADCHECK_API_KEY", "UPLOADCHECK_API_KEY_SHA256"] },
  { label: "UPLOADCHECK_CREATOR_CHECKOUT_URL", keys: ["UPLOADCHECK_CREATOR_CHECKOUT_URL"] },
  { label: "UPLOADCHECK_STUDIO_CHECKOUT_URL", keys: ["UPLOADCHECK_STUDIO_CHECKOUT_URL"] },
  { label: "UPLOADCHECK_NETWORK_CHECKOUT_URL", keys: ["UPLOADCHECK_NETWORK_CHECKOUT_URL"] },
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
    if (value) envVars.push({ serviceId: API_SERVICE_ID, key, value, secret: false });
  }
  for (const key of SECRET_ENV_KEYS) {
    const value = env[key];
    if (value) envVars.push({ serviceId: API_SERVICE_ID, key, value, secret: true });
  }
  return {
    webServiceId: WEB_SERVICE_ID,
    apiServiceId: API_SERVICE_ID,
    domains: DOMAIN_PLAN,
    envVars,
    missingSecretInputs: REQUIRED_SECRET_GROUPS
      .filter((group) => !group.keys.some((key) => env[key]))
      .map((group) => group.label)
  };
}

export function summarizePlan(plan) {
  return {
    webServiceId: plan.webServiceId,
    apiServiceId: plan.apiServiceId,
    domains: plan.domains.map((domain) => domain.name),
    envVars: plan.envVars.map((item) => ({ key: item.key, value: item.secret ? "<provided-secret>" : item.value })),
    missingSecretInputs: plan.missingSecretInputs
  };
}

export function buildEnvTemplate() {
  const lines = [
    "# UploadCheck Render launch env template",
    "# Fill these locally, then run: set -a; source /path/to/filled.env; set +a; npm run render:plan && npm run render:apply",
    "# Do not commit a filled copy.",
    "",
    "# Required for npm run render:audit and npm run render:apply",
    "RENDER_API_KEY=\"<render_api_key>\"",
    "",
    "# API auth: prefer setting only the generated SHA-256 hash on Render.",
    "# Generate with: npm run --silent api-key:generate",
    "UPLOADCHECK_API_KEY_SHA256=\"<generated_sha256>\"",
    "# Keep UPLOADCHECK_API_KEY private for clients; only set it on Render for bootstrap/testing.",
    "# UPLOADCHECK_API_KEY=\"<generated_bearer_token>\"",
    "",
    "# Checkout URLs: required for Product Hunt readiness.",
    "UPLOADCHECK_CREATOR_CHECKOUT_URL=\"https://...\"",
    "UPLOADCHECK_STUDIO_CHECKOUT_URL=\"https://...\"",
    "UPLOADCHECK_NETWORK_CHECKOUT_URL=\"https://...\"",
    "",
    "# Webhook secret encryption: required before hosted webhooks are production-ready.",
    "# Generate with: npm run --silent secret:generate",
    "UPLOADCHECK_SECRET_ENCRYPTION_KEY=\"<generated_secret_encryption_key>\"",
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
  if (command === "plan") {
    console.log(JSON.stringify(summarizePlan(plan), null, 2));
    return;
  }
  const token = process.env.RENDER_API_KEY;
  if (!token) {
    console.error("Set RENDER_API_KEY before running Render launch operations.");
    process.exit(2);
  }
  if (command === "audit") {
    console.log(JSON.stringify(await auditRenderLaunch(token, plan), null, 2));
    return;
  }
  if (command === "apply") {
    console.log(JSON.stringify(await applyRenderLaunch(token, plan), null, 2));
    return;
  }
  throw new Error("Usage: render-launch-ops.mjs [env-template|plan|audit|apply]");
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
