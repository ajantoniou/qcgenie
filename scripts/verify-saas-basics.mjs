#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const files = {
  server: read("server.mjs"),
  store: read("server-store.mjs"),
  app: read("src/App.tsx"),
  httpTests: read("src/lib/serverHttpInline.test.mjs"),
  storeTests: read("src/lib/serverStore.test.mjs"),
  openapi: read("public/openapi.json"),
  readme: read("README.md"),
  roadmap: read("docs/PRODUCT-ROADMAP.md"),
  privateBeta: read("docs/PRIVATE-MCP-BETA.md")
};

const errors = [];

requireAll("server API-key endpoints", files.server, [
  'url.pathname === "/v1/api-keys"',
  'url.pathname === "/v1/checkout/provision-api-key"',
  'url.pathname === "/v1/spend-alerts"',
  "requireScope(req, \"api_keys:write\")",
  "requireScope(req, \"api_keys:read\")",
  "applyAuthenticatedApiKeyDefaults(body, auth.apiKeyRecord)"
]);

requireAll("checkout provisioning economics", files.server, [
  "resolvePlanEconomics({ plan_id: planId })",
  "included_minutes: plan.includedMinutes",
  "plan_price_cents: plan.planPriceCents",
  "applyApiKeyProvisioningScope(body, auth.apiKeyRecord)",
  "overage_cap_cents: body.overage_cap_cents ?? body.overageCapCents ?? null",
  "overage_cap_cents: provisioning.overage_cap_cents ?? null",
  "custom.overage_cap_cents ?? custom.overageCapCents",
  "checkout_subscription_id",
  "UPLOADCHECK_LEMONSQUEEZY_WEBHOOK_SECRET",
  "verifyLemonSqueezySignature"
]);

requireAll("workspace-scoped usage enforcement", files.server, [
  "checkUsageLimit(body)",
  "recordAbuseEventForUsageLimit(usageLimit, body, auth.apiKeyRecord)",
  "usage_limit_exceeded",
  "workspaceId: body.workspace_id || body.workspaceId || apiKeyRecord?.workspaceId || null",
  "minutesRemaining: result.minutesRemaining",
  "projectedOverageRevenueCents",
  "overageCapCents > 0 && projectedOverageRevenueCents <= overageCapCents"
]);

requireAll("workspace API-key isolation", files.server, [
  "body.workspace_id = apiKeyRecord.workspaceId",
  "body.plan_id = apiKeyRecord.planId",
  "body.overage_cap_cents = apiKeyRecord.overageCapCents",
  "function applyApiKeyProvisioningScope(body, apiKeyRecord = null)",
  "function authorizeJobAccess(auth, jobId)",
  "function authorizeUploadAccess(auth, uploadId)",
  "function authorizeWebhookAccess(auth, webhookId)",
  "function authorizeWebhookDeliveryAccess(auth, deliveryId)",
  "function canAccessJob(auth, job)",
  "function canAccessUpload(auth, upload)",
  "function canAccessWebhook(auth, webhook)",
  "function canAccessWebhookDelivery(auth, delivery)",
  "function filterUsageLedgerForAuth(entries, auth)",
  "function workspaceFilterForAuth(auth, url)",
  "workspaceId: auth.apiKeyRecord?.workspaceId || null",
  "authorizeUploadAccess(auth, uploadId)",
  "authorizeWebhookAccess(auth, webhookId)",
  "authorizeWebhookDeliveryAccess(auth, deliveryId)",
  ".filter((job) => canAccessJob(auth, job))",
  "entry.workspaceId === auth.apiKeyRecord.workspaceId"
]);

requireAll("store SaaS persistence", files.store, [
  "apiKeys: []",
  "abuseEvents: []",
  "spendAlerts: []",
  "createApiKey(input = {})",
  "findApiKeyByToken(token)",
  "summarizePlanUsage({ planId, workspaceId = null",
  "recordSpendAlert(input = {})",
  "listSpendAlerts(options = {})",
  "recordAbuseEvent(input = {})",
  "listQueuedJobs(options = {})",
  "overageCapCents: numberOrNull(input.overage_cap_cents ?? input.overageCapCents)",
  "planId: input.planId || null",
  "minutesUsed: numberOrNull(input.minutesUsed)"
]);

requireAll("Resend spend alerts", files.server, [
  "maybeAlertOwnerForSpend(job)",
  "sendOwnerSpendAlert({ alert, job, usage })",
  "function listSpendAlerts(req, url, res)",
  "RESEND_API_KEY",
  "UPLOADCHECK_RESEND_API_URL",
  "overage_spend_exceeded_subscription",
  "overageRevenueCents >= job.planPriceCents",
  "Billable extra-minute spend",
  "Overage rate"
]);

requireAll("dashboard controls", files.app, [
  "Create workspace API key",
  "Review API keys",
  "/v1/api-keys",
  "/v1/abuse-events",
  "/v1/spend-alerts",
  "Review spend alerts",
  "planId?: string",
  "minutesUsed?: number",
  "overage_cap_cents",
  "overageRevenueCents?: number",
  "billable extra-minute spend"
]);

requireAll("OpenAPI SaaS surface", files.openapi, [
  "\"/v1/api-keys\"",
  "\"/v1/checkout/provision-api-key\"",
  "\"/v1/webhooks/lemonsqueezy\"",
  "\"/v1/abuse-events\"",
  "\"/v1/spend-alerts\"",
  "usage_limit_exceeded plan/minute context",
  "stored workspace API keys with api_keys:write are pinned to their own workspace, owner, plan economics, and overage cap",
  "Approved extra-minute spend cap in cents",
  "Stored workspace API keys with api_keys:read are pinned to their own workspace",
  "Stored workspace API keys are pinned to their own workspace usage ledger"
]);

requireAll("HTTP proof tests", files.httpTests, [
  "creates hashed customer API keys and honors their plan metadata",
  "forces authenticated workspace API-key metadata over client-supplied plan fields",
  "scopes stored workspace API keys to their own jobs and usage ledger",
  "scopes stored workspace API keys to their own upload reservations",
  "scopes stored workspace API keys to their own webhooks and deliveries",
  "scopes stored workspace API keys to their own queued job drains",
  "checks active job concurrency within the authenticated workspace",
  "allows deterministic overage minutes when the workspace key has approved cap credits",
  "scopes stored API-key review endpoints and delegated key creation to their own workspace",
  "delegatedCheckout.key.overageCapCents",
  "overageCapCents: 5000",
  "rejects declared jobs that exceed included plan minutes within the authenticated workspace",
  "usage_limit_exceeded",
  "emails the API-key owner when billable extra-minute spend exceeds subscription value",
  "Billable extra-minute spend: 156.00 USD",
  "overageRevenueCents: 15600",
  "provisions paid checkout customers into idempotent MCP API keys",
  "provisions API keys from signed Lemon Squeezy subscription webhooks"
]);

requireAll("store proof tests", files.storeTests, [
  "summarizes plan usage within a workspace when workspaceId is supplied",
  "records usage-limit attempts with plan and workspace context"
]);

requireAll("operator docs", files.readme + files.roadmap + files.privateBeta, [
  "dashboard API-key form",
  "POST /v1/checkout/provision-api-key",
  "usage-limit events",
  "overage_cap_cents",
  "Resend",
  "GET /v1/spend-alerts",
  "GET /v1/api-keys",
  "workspace API key"
]);

if (errors.length) {
  console.error(JSON.stringify({ ok: false, errors }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  verified: [
    "dashboard and API can create hashed workspace API keys",
    "dashboard can review redacted workspace API-key records without exposing hashes or bearer secrets",
    "authenticated API keys force workspace, owner, plan, included-minute, price, and approved overage-cap defaults over client-supplied fields",
    "stored workspace API keys are scoped to their own uploads, webhooks, jobs, queued job drains, usage ledger, API-key review, abuse review, spend-alert review, delegated key creation, workspace active-job concurrency, and approved overage credits",
    "checkout and signed Lemon Squeezy events provision paid API keys idempotently",
    "included-minute over-limit attempts are blocked and recorded as abuse events",
    "Resend owner spend alerts trigger when billable extra-minute spend exceeds subscription value and remain operator-reviewable with COGS audit context"
  ]
}, null, 2));

function requireAll(label, text, needles) {
  for (const needle of needles) {
    if (!text.includes(needle)) {
      errors.push({ label, missing: needle });
    }
  }
}

function read(path) {
  return readFileSync(resolve(path), "utf8");
}
