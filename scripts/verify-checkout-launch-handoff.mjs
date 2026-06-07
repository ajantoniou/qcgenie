#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { CHECKOUT_PLANS } from "../checkout-links.mjs";
import { buildEnvTemplate } from "./render-launch-ops.mjs";

const files = {
  deployment: "docs/DEPLOYMENT-CUTOVER.md",
  readinessActions: "readiness-actions.mjs",
  readiness: "readiness.mjs",
  renderYaml: "render.yaml",
  openapi: "public/openapi.json",
  roadmap: "docs/PRODUCT-ROADMAP.md",
  readme: "README.md",
  privateBeta: "docs/PRIVATE-MCP-BETA.md"
};

const errors = [];
const docs = Object.fromEntries(Object.entries(files).map(([key, path]) => [key, read(path)]));
const envTemplate = buildEnvTemplate();
const openapi = JSON.parse(docs.openapi);

for (const plan of CHECKOUT_PLANS) {
  const upper = plan.toUpperCase();
  requireEverywhere(`direct ${plan} checkout URL`, `UPLOADCHECK_${upper}_CHECKOUT_URL`, [
    files.deployment,
    files.readinessActions,
    files.renderYaml,
    "render-env-template"
  ]);
  requireEverywhere(`Lemon Squeezy ${plan} variant`, `UPLOADCHECK_${upper}_VARIANT_ID`, [
    files.deployment,
    files.readinessActions,
    "render-env-template"
  ]);
}

for (const marker of [
  "UPLOADCHECK_LEMONSQUEEZY_STORE_SLUG",
  "UPLOADCHECK_LEMONSQUEEZY_STORE_URL",
  "UPLOADCHECK_LEMONSQUEEZY_WEBHOOK_SECRET",
  "npm run launch:checkout-discover",
  "UPLOADCHECK_CHECKOUT_PROBE=1 npm run launch:checkout",
  "POST /v1/webhooks/lemonsqueezy",
  "X-Signature",
  "HMAC-SHA256",
  "POST /v1/checkout/provision-api-key"
]) {
  requireAny(marker, [
    files.deployment,
    files.readme,
    files.privateBeta,
    files.openapi,
    "render-env-template"
  ]);
}

requireIncludes(files.deployment, docs.deployment, [
  "Output shows only host and redacted checkout URL shape",
  "never direct checkout paths or Lemon Squeezy variant IDs",
  "signed checkout events can provision MCP/API keys",
  "render:validate-env-file -- /tmp/uploadcheck-render-launch.env",
  "`render:apply` refuses to run when validation fails",
  "hosted launch doctor/evidence verifiers also require `saas-basics:verify`, `mcp-install:verify`, `private-mcp-beta:verify`, `private-mcp-beta:evidence`, `anthropic-directory:verify`, and `product-agent:verify`",
  "npm run live-mcp-install:verify",
  "npm run live-public-artifacts:verify",
  "UPLOADCHECK_LIVE_WEB_BASE_URL=https://qcgenie-web.onrender.com npm run live-web-artifacts:verify",
  "hosted `/mcp-install.json`"
]);

requireIncludes(files.readiness, docs.readiness, [
  "checkoutWebhook",
  "Set UPLOADCHECK_LEMONSQUEEZY_WEBHOOK_SECRET",
  "signed checkout webhooks can provision paid MCP/API keys"
]);

requireIncludes(files.readinessActions, docs.readinessActions, [
  "checkout-webhook",
  "Set Lemon Squeezy webhook signing secret",
  "npm run render:validate-env",
  "UPLOADCHECK_CHECKOUT_PROBE=1 npm run launch:checkout"
]);

if (!openapi.paths?.["/v1/webhooks/lemonsqueezy"]?.post) {
  errors.push({ file: files.openapi, reason: "missing_lemonsqueezy_webhook_path" });
}
if (!openapi.paths?.["/v1/checkout/provision-api-key"]?.post) {
  errors.push({ file: files.openapi, reason: "missing_checkout_provision_path" });
}
const webhookDescription = JSON.stringify(openapi.paths?.["/v1/webhooks/lemonsqueezy"] || {});
if (!webhookDescription.includes("UPLOADCHECK_LEMONSQUEEZY_WEBHOOK_SECRET") || !webhookDescription.includes("X-Signature")) {
  errors.push({ file: files.openapi, reason: "webhook_docs_missing_signature_contract" });
}

requireIncludes(files.roadmap, docs.roadmap, [
  "live readiness now proves checkout, custom domain, secret encryption, durable JSON persistence, durable upload storage, and demo clip readiness",
  "public download/listing is still not ready because npm publish, hosted `/mcp-install.json` redeploy proof, hosted launch-doctor/evidence freshness, and external Claude Code/Codex/Cursor beta evidence remain outstanding",
  "redeploy the current API/static artifacts to Render"
]);

for (const forbidden of [
  "checkout.example/creator-secret",
  "checkout.example/studio-secret",
  "checkout.example/network-secret",
  "<creator_variant_id> is safe to expose",
  "webhook signing secret is optional"
]) {
  for (const [label, text] of Object.entries({ ...docs, "render-env-template": envTemplate })) {
    if (text.includes(forbidden)) errors.push({ file: label, reason: "forbidden_checkout_handoff_text", forbidden });
  }
}

if (errors.length) {
  console.error(JSON.stringify({ ok: false, errors }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  plans: CHECKOUT_PLANS,
  proofCommands: [
    "npm run render:validate-env-file -- /tmp/uploadcheck-render-launch.env",
    "npm run render:validate-env",
    "npm run render:apply",
    "UPLOADCHECK_CHECKOUT_PROBE=1 npm run launch:checkout",
    "npm run live-mcp-install:verify",
    "npm run live-public-artifacts:verify",
    "npm run readiness:check"
  ],
  requiredExternalInputs: [
    "Render redeploy of current API/static artifacts",
    "npm publish and registry install proof",
    "external Claude/Codex/Cursor beta evidence with workspace API keys"
  ]
}, null, 2));

function read(path) {
  return readFileSync(resolve(path), "utf8");
}

function requireIncludes(file, text, markers) {
  for (const marker of markers) {
    if (!text.includes(marker)) errors.push({ file, reason: "missing_marker", marker });
  }
}

function requireEverywhere(label, marker, locations) {
  for (const location of locations) {
    const text = location === "render-env-template" ? envTemplate : read(location);
    if (!text.includes(marker)) errors.push({ label, file: location, reason: "missing_marker", marker });
  }
}

function requireAny(marker, locations) {
  const found = locations.some((location) => {
    const text = location === "render-env-template" ? envTemplate : read(location);
    return text.includes(marker);
  });
  if (!found) errors.push({ reason: "missing_marker_everywhere", marker, locations });
}
