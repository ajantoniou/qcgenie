import { createReadStream, createWriteStream, existsSync, mkdirSync, statSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { createServer } from "node:http";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { JsonStore } from "./server-store.mjs";
import { cleanupInlineMedia, materializeInlineMedia } from "./inline-media.mjs";
import { applyCostGuardrail, estimateJobCost, resolvePlanEconomics, summarizeUsageMargins } from "./cost-model.mjs";
import { buildCheckoutUrl, normalizePlanId } from "./checkout-links.mjs";
import { buildReadinessReport } from "./readiness.mjs";
import { buildLaunchStatus } from "./launch-status.mjs";
import { buildLaunchHandoff } from "./launch-handoff.mjs";
import { LAUNCH_PROOF_CONTRACT_VERSION, buildRemoteLaunchEvidence } from "./launch-evidence.mjs";
import { getObjectStorageConfig, objectKeyForUpload, uploadFileToObjectStorage } from "./object-storage.mjs";

const port = Number(process.env.PORT || 10000);
const distDir = resolve("dist");
const uploadDir = process.env.UPLOADCHECK_UPLOAD_DIR || "/tmp/uploadcheck/uploads";
const durableStorageDir = process.env.UPLOADCHECK_DURABLE_STORAGE_DIR || null;
const uploadStorageDir = durableStorageDir || uploadDir;
const objectStorageConfig = getObjectStorageConfig();
const uploadStorageMode = durableStorageDir ? "durable_filesystem" : (objectStorageConfig.configured ? "object_storage" : "render_temp_storage");
const maxDurationMinutes = positiveNumberEnv("UPLOADCHECK_MAX_DURATION_MINUTES", 240);
const maxUploadMb = positiveNumberEnv("UPLOADCHECK_MAX_UPLOAD_MB", 2048);
const maxActiveJobs = positiveNumberEnv("UPLOADCHECK_MAX_ACTIVE_JOBS", 25);
const store = new JsonStore(process.env.UPLOADCHECK_STORE_PATH || "/tmp/uploadcheck/store.json", {
  secretEncryptionKey: process.env.UPLOADCHECK_SECRET_ENCRYPTION_KEY
});
const apiKey = process.env.UPLOADCHECK_API_KEY;
const apiKeyHash = process.env.UPLOADCHECK_API_KEY_SHA256;
const apiScopes = new Set((process.env.UPLOADCHECK_API_SCOPES || "jobs:write,jobs:read,reports:read,uploads:write,webhooks:write,api_keys:write,api_keys:read").split(","));
const corsOrigins = new Set((process.env.UPLOADCHECK_CORS_ORIGINS || "https://uploadcheck.app,https://www.uploadcheck.app,http://localhost:5173,http://127.0.0.1:5173").split(",").map((origin) => origin.trim()).filter(Boolean));

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml"
};

createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);
    if (applyCors(req, res)) return;

    if (url.pathname === "/healthz") return sendJson(res, 200, { ok: true, service: "uploadcheck" });
    if (req.method === "GET" && url.pathname === "/v1/readiness") return getReadiness(req, res);
    if (req.method === "GET" && url.pathname === "/v1/launch-status") return getLaunchStatus(req, res);
    if (req.method === "GET" && url.pathname === "/v1/launch-handoff") return getLaunchHandoff(req, res);
    if (req.method === "GET" && url.pathname === "/v1/launch-doctor") return getLaunchDoctor(req, res);
    if (req.method === "GET" && url.pathname === "/v1/launch-evidence") return getLaunchEvidence(req, res);
    if (req.method === "GET" && url.pathname === "/openapi.json") return serveStatic("/openapi.json", res);
    if (req.method === "GET" && /^\/checkout\/[^/]+$/.test(url.pathname)) return redirectCheckout(url, res);
    if (req.method === "POST" && url.pathname === "/v1/qc/estimate") return estimateQc(req, res);
    if (req.method === "POST" && url.pathname === "/v1/qc/jobs/drain") return drainQueuedJobs(req, res);
    if (req.method === "POST" && url.pathname === "/v1/qc/jobs") return createJob(req, res);
    if (req.method === "GET" && /^\/v1\/qc\/jobs\/[^/]+$/.test(url.pathname)) return getJob(req, url, res);
    if (req.method === "GET" && /^\/v1\/qc\/jobs\/[^/]+\/report$/.test(url.pathname)) return getReport(req, url, res);
    if (req.method === "GET" && /^\/v1\/qc\/jobs\/[^/]+\/events$/.test(url.pathname)) return getJobEvents(req, url, res);
    if (req.method === "GET" && /^\/v1\/qc\/jobs\/[^/]+\/artifacts$/.test(url.pathname)) return getJobArtifacts(req, url, res);
    if (req.method === "GET" && /^\/v1\/qc\/jobs\/[^/]+\/artifacts\/markers$/.test(url.pathname)) return getMarkerExport(req, url, res);
    if (req.method === "POST" && /^\/v1\/qc\/jobs\/[^/]+\/gate-verdict$/.test(url.pathname)) return ingestGateVerdict(req, url, res);
    if (req.method === "POST" && /^\/v1\/qc\/jobs\/[^/]+\/cancel$/.test(url.pathname)) return cancelJob(req, url, res);
    if (req.method === "POST" && url.pathname === "/v1/uploads") return createUpload(req, res);
    if (req.method === "PUT" && /^\/v1\/uploads\/[^/]+\/content$/.test(url.pathname)) return putUploadContent(req, url, res);
    if (req.method === "GET" && /^\/v1\/uploads\/[^/]+$/.test(url.pathname)) return getUpload(req, url, res);
    if (req.method === "GET" && url.pathname === "/v1/qc/jobs") return listJobs(req, res);
    if (req.method === "GET" && url.pathname === "/v1/usage") return getUsage(req, res);
    if (req.method === "GET" && url.pathname === "/v1/usage/margins") return getUsageMargins(req, res);
    if (req.method === "GET" && url.pathname === "/v1/abuse-events") return listAbuseEvents(req, url, res);
    if (req.method === "GET" && url.pathname === "/v1/spend-alerts") return listSpendAlerts(req, url, res);
    if (req.method === "POST" && url.pathname === "/v1/api-keys") return createApiKey(req, res);
    if (req.method === "GET" && url.pathname === "/v1/api-keys") return listApiKeys(req, url, res);
    if (req.method === "POST" && url.pathname === "/v1/checkout/provision-api-key") return provisionCheckoutApiKey(req, res);
    if (req.method === "POST" && url.pathname === "/v1/webhooks/lemonsqueezy") return receiveLemonSqueezyWebhook(req, res);
    if (req.method === "POST" && url.pathname === "/v1/webhooks") return createWebhook(req, res);
    if (req.method === "GET" && url.pathname === "/v1/webhooks/deliveries") return listWebhookDeliveries(req, res);
    if (req.method === "POST" && url.pathname === "/v1/webhooks/deliveries/drain") return drainWebhookDeliveries(req, res);
    if (req.method === "POST" && /^\/v1\/webhooks\/deliveries\/[^/]+\/retry$/.test(url.pathname)) return retryWebhookDelivery(req, url, res);
    if (req.method === "GET" && /^\/v1\/webhooks\/[^/]+\/delivery-preview$/.test(url.pathname)) return previewWebhookDelivery(req, url, res);

    return serveStatic(url.pathname, res);
  } catch (error) {
    return sendJson(res, 500, { error: "internal_error", message: error instanceof Error ? error.message : "Unknown error" });
  }
}).listen(port, () => {
  console.log(`UploadCheck.app web service listening on ${port}`);
});

async function estimateQc(req, res) {
  const auth = requireScope(req, "jobs:write");
  if (!auth.ok) return sendJson(res, auth.status, { error: auth.error });
  const body = await readJson(req);
  const minutes = Number(body.minutes ?? body.minutes_metered ?? body.minutesMetered ?? 0);
  const durationSeconds = Number(body.duration_seconds ?? body.durationSeconds ?? 0);
  const estimatedMinutes = minutes > 0 ? minutes : (durationSeconds > 0 ? Math.ceil(durationSeconds / 60) : 1);
  const guardrail = applyCostGuardrail({ ...body, minutes: estimatedMinutes });
  return sendJson(res, 200, {
    minutesEstimated: estimatedMinutes,
    costGuardrail: guardrail.costGuardrail,
    action: guardrail.action,
    effectiveChecks: guardrail.checks,
    requestedChecks: guardrail.requestedChecks,
    removedChecks: guardrail.removedChecks,
    aiReviewSeconds: guardrail.aiReviewSeconds,
    requestedAiReviewSeconds: guardrail.requestedAiReviewSeconds,
    marginSafe: guardrail.estimate.marginSafe,
    reason: guardrail.reason || null,
    costEstimate: guardrail.estimate,
    originalCostEstimate: guardrail.originalEstimate || null
  });
}

function getReadiness(req, res) {
  return sendJson(res, 200, buildReadinessReport({ host: req.headers.host || "" }));
}

function getLaunchStatus(req, res) {
  const readiness = buildReadinessReport({ host: req.headers.host || "" });
  return sendJson(res, 200, buildLaunchStatus(readiness, { generatedFrom: "live readiness" }));
}

function getLaunchHandoff(req, res) {
  const readiness = buildReadinessReport({ host: req.headers.host || "" });
  return sendJson(res, 200, buildLaunchHandoff(readiness, { generatedAt: readiness.generatedAt }));
}

function getLaunchDoctor(req, res) {
  const readiness = buildReadinessReport({ host: req.headers.host || "" });
  const handoff = buildLaunchHandoff(readiness, { generatedAt: readiness.generatedAt });
  return sendJson(res, 200, {
    ...handoff,
    name: "UploadCheck.app Launch Doctor",
    contractVersion: LAUNCH_PROOF_CONTRACT_VERSION,
    description: "Live Product Hunt blocker fix plan and normalized launch-doctor command coverage for UploadCheck.app agents and operators.",
    handoffUrl: "https://api.uploadcheck.app/v1/launch-handoff"
  });
}

function getLaunchEvidence(req, res) {
  const readiness = buildReadinessReport({ host: req.headers.host || "" });
  const handoff = buildLaunchHandoff(readiness, { generatedAt: readiness.generatedAt });
  const doctor = {
    ...handoff,
    name: "UploadCheck.app Launch Doctor",
    contractVersion: LAUNCH_PROOF_CONTRACT_VERSION,
    description: "Live Product Hunt blocker fix plan and normalized launch-doctor command coverage for UploadCheck.app agents and operators.",
    handoffUrl: "https://api.uploadcheck.app/v1/launch-handoff"
  };
  return sendJson(res, 200, buildRemoteLaunchEvidence(doctor, {
    generatedAt: readiness.generatedAt,
    source: "https://api.uploadcheck.app/v1/launch-doctor"
  }));
}

async function createJob(req, res) {
  const auth = requireScope(req, "jobs:write");
  if (!auth.ok) return sendJson(res, auth.status, { error: auth.error });
  const body = await readJson(req);
  applyAuthenticatedApiKeyDefaults(body, auth.apiKeyRecord);
  const uploadId = body.upload_id || body.uploadId || null;
  if (uploadId) {
    const access = authorizeUploadAccess(auth, uploadId);
    if (!access.ok) return sendJson(res, access.status, { error: access.error });
  }
  const remoteSidecars = collectRemoteSidecarUrls(body);
  if (remoteSidecars.error) return sendJson(res, 400, remoteSidecars.error);
  if (remoteSidecars.urls) body.sidecar_urls = remoteSidecars.urls;
  const inlineMedia = await materializeInlineMedia(body);
  const inlineManifest = await materializeInlineManifest(body);
  const inlineTranscript = await materializeInlineTranscript(body);
  const inlineWatchlist = await materializeInlineWatchlist(body);
  const inlineExpectedScript = await materializeInlineExpectedScript(body);
  const inlineChunkSidecars = await materializeInlineChunkSidecars(body);
  let remoteSidecarFiles = null;
  try {
    const declaredMinutes = estimateRequestedMinutes(body);
    const abuseLimit = checkJobAbuseLimits(body, { declaredMinutes });
    if (!abuseLimit.ok) {
      recordAbuseEventForRequest(abuseLimit, body, auth.apiKeyRecord);
      return sendJson(res, abuseLimit.status, abuseLimit.payload);
    }
    const guardrail = applyCostGuardrail(declaredMinutes ? { ...body, minutes: declaredMinutes } : body);
    if (!guardrail.ok) {
      return sendJson(res, 402, {
        error: "cost_guardrail_blocked",
        message: guardrail.reason,
        costGuardrail: guardrail.costGuardrail,
        costEstimate: guardrail.estimate
      });
    }
    body.ai_review_seconds = guardrail.aiReviewSeconds;
    body.requested_ai_review_seconds = guardrail.requestedAiReviewSeconds;
    body.requested_checks = guardrail.requestedChecks;
    body.removed_checks = guardrail.removedChecks;
    body.checks = guardrail.checks;
    body.cost_guardrail = guardrail.costGuardrail;
    body.cost_guardrail_action = guardrail.action;
    body.cost_guardrail_reason = guardrail.reason || null;
    body.ai_review_budget_seconds = guardrail.estimate.aiReviewBudgetSeconds;

    const usageLimit = checkUsageLimit(body);
    if (!usageLimit.ok) {
      recordAbuseEventForUsageLimit(usageLimit, body, auth.apiKeyRecord);
      return sendJson(res, 402, {
        error: "usage_limit_exceeded",
        message: usageLimit.reason,
        planId: usageLimit.planId,
        billingPeriod: usageLimit.billingPeriod,
        includedMinutes: usageLimit.includedMinutes,
        minutesUsed: usageLimit.minutesUsed,
        requestedMinutes: usageLimit.requestedMinutes,
        minutesRemaining: usageLimit.minutesRemaining,
        aiReviewBudgetSeconds: usageLimit.aiReviewBudgetSeconds,
        aiReviewSecondsUsed: usageLimit.aiReviewSecondsUsed,
        requestedAiReviewSeconds: usageLimit.requestedAiReviewSeconds,
        aiReviewSecondsRemaining: usageLimit.aiReviewSecondsRemaining,
        overageCapCents: usageLimit.overageCapCents,
        projectedOverageRevenueCents: usageLimit.projectedOverageRevenueCents,
        overageRateCentsPerMinute: usageLimit.overageRateCentsPerMinute
      });
    }

    if (inlineMedia) {
      body.source = inlineMedia.filePath;
      body.source_type = "upload";
      body.inline_media = {
        content_type: inlineMedia.contentType,
        bytes: inlineMedia.bytes,
        sha256: inlineMedia.sha256,
        ephemeral: true
      };
    }
    if (shouldQueueJob(body)) {
      if (inlineMedia || inlineManifest || inlineTranscript || inlineWatchlist || inlineExpectedScript || inlineChunkSidecars) {
        return sendJson(res, 400, {
          error: "async_ephemeral_inputs_unsupported",
          message: "Queued jobs cannot use inline media or inline sidecars because those temporary files are deleted after the request. Use signed upload, upload_id, YouTube, or HTTPS sidecar URLs for async processing."
        });
      }
    }
    const job = store.createJob(body);
    if (job.idempotentReplay) return sendJson(res, 200, withCostEstimate(job));
    if (shouldQueueJob(body)) {
      store.addJobEvent(job.jobId, "queued_for_worker", {
        requestedAsync: true,
        drainEndpoint: "/v1/qc/jobs/drain"
      });
      store.persist();
      return sendJson(res, 202, withCostEstimate(job));
    }
    remoteSidecarFiles = await materializeRemoteSidecars(remoteSidecars.urls);
    const completed = store.runDeterministicQc(job.jobId, {
      checks: body.checks || inlineMedia?.checks,
      manifestPath: inlineManifest?.filePath || remoteSidecarFiles?.manifestPath,
      transcriptPath: inlineTranscript?.filePath || remoteSidecarFiles?.transcriptPath,
      watchlistPath: inlineWatchlist?.filePath || remoteSidecarFiles?.watchlistPath,
      expectedScriptPath: inlineExpectedScript?.filePath || remoteSidecarFiles?.expectedScriptPath,
      sidecarDir: inlineChunkSidecars?.dirPath || remoteSidecarFiles?.sidecarDir
    });
    await maybeAlertOwnerForSpend(completed || job);
    store.createWebhookDeliveriesForJob(job.jobId, "job.completed");
    return sendJson(res, 202, withCostEstimate(completed || job));
  } finally {
    await cleanupInlineMedia(inlineMedia);
    await cleanupInlineManifest(inlineManifest);
    await cleanupInlineTranscript(inlineTranscript);
    await cleanupInlineWatchlist(inlineWatchlist);
    await cleanupInlineExpectedScript(inlineExpectedScript);
    await cleanupInlineChunkSidecars(inlineChunkSidecars);
    await cleanupRemoteSidecars(remoteSidecarFiles);
  }
}

async function drainQueuedJobs(req, res) {
  const auth = requireScope(req, "jobs:write");
  if (!auth.ok) return sendJson(res, auth.status, { error: auth.error });
  const body = await readJson(req);
  const limit = Math.min(Math.max(Number(body.limit || 5) || 5, 1), 25);
  const queued = store.listQueuedJobs({
    limit,
    workspaceId: auth.apiKeyRecord?.workspaceId || null
  });
  const results = [];

  for (const job of queued) {
    let remoteSidecarFiles = null;
    try {
      remoteSidecarFiles = await materializeRemoteSidecars(job.sidecarUrls);
      const completed = store.runDeterministicQc(job.jobId, {
        checks: job.checks,
        manifestPath: remoteSidecarFiles?.manifestPath,
        transcriptPath: remoteSidecarFiles?.transcriptPath,
        watchlistPath: remoteSidecarFiles?.watchlistPath,
        expectedScriptPath: remoteSidecarFiles?.expectedScriptPath,
        sidecarDir: remoteSidecarFiles?.sidecarDir
      });
      if (completed) store.createWebhookDeliveriesForJob(job.jobId, "job.completed");
      if (completed) await maybeAlertOwnerForSpend(completed);
      results.push(withCostEstimate(completed || job));
    } finally {
      await cleanupRemoteSidecars(remoteSidecarFiles);
    }
  }

  return sendJson(res, 200, {
    processed: results.length,
    jobs: results
  });
}

async function createApiKey(req, res) {
  const auth = requireScope(req, "api_keys:write");
  if (!auth.ok) return sendJson(res, auth.status, { error: auth.error });
  const body = await readJson(req);
  applyApiKeyProvisioningScope(body, auth.apiKeyRecord);
  const created = store.createApiKey(body);
  return sendJson(res, 201, {
    apiKey: created.apiKey,
    key: created.record,
    warning: "The apiKey is shown once. Store it privately; future API responses only show tokenPrefix."
  });
}

function listApiKeys(req, url, res) {
  const auth = requireScope(req, "api_keys:read");
  if (!auth.ok) return sendJson(res, auth.status, { error: auth.error });
  return sendJson(res, 200, {
    keys: store.listApiKeys({ workspaceId: workspaceFilterForAuth(auth, url) })
  });
}

async function provisionCheckoutApiKey(req, res) {
  const auth = requireScope(req, "api_keys:write");
  if (!auth.ok) return sendJson(res, auth.status, { error: auth.error });
  const body = await readJson(req);
  applyApiKeyProvisioningScope(body, auth.apiKeyRecord);
  const planId = normalizePlanId(body.plan_id || body.planId);
  if (!planId) return sendJson(res, 400, { error: "invalid_plan_id", allowedPlans: ["creator", "studio", "network"] });
  const ownerEmail = String(body.owner_email || body.ownerEmail || body.email || "").trim();
  if (!ownerEmail || !ownerEmail.includes("@")) return sendJson(res, 400, { error: "owner_email_required" });
  const checkoutCustomerId = stringOrNull(body.checkout_customer_id || body.checkoutCustomerId || body.customer_id || body.customerId);
  const checkoutSubscriptionId = stringOrNull(body.checkout_subscription_id || body.checkoutSubscriptionId || body.subscription_id || body.subscriptionId);
  const workspaceId = stringOrNull(body.workspace_id || body.workspaceId)
    || workspaceIdFromCheckout({ checkoutCustomerId, checkoutSubscriptionId, ownerEmail });
  const plan = resolvePlanEconomics({ plan_id: planId });
  const provisioningId = stringOrNull(body.provisioning_id || body.provisioningId)
    || ["checkout", planId, checkoutSubscriptionId || checkoutCustomerId || workspaceId].join(":");
  const created = store.createApiKey({
    name: body.name || `${capitalize(planId)} MCP key`,
    workspace_id: workspaceId,
    owner_email: ownerEmail,
    provisioning_id: provisioningId,
    checkout_customer_id: checkoutCustomerId,
    checkout_subscription_id: checkoutSubscriptionId,
    plan_id: planId,
    included_minutes: plan.includedMinutes,
    plan_price_cents: plan.planPriceCents,
    ai_review_budget_seconds: plan.aiReviewBudgetSeconds,
    overage_cap_cents: body.overage_cap_cents ?? body.overageCapCents ?? null,
    scopes: ["jobs:write", "jobs:read", "reports:read", "uploads:write"]
  });
  return sendJson(res, created.idempotentReplay ? 200 : 201, {
    apiKey: created.apiKey,
    key: created.record,
    idempotentReplay: Boolean(created.idempotentReplay),
    warning: created.apiKey
      ? "The apiKey is shown once. Store it privately as UPLOADCHECK_API_KEY for MCP/API clients."
      : "Existing provisioning record returned without bearer secret; use the originally issued apiKey."
  });
}

async function receiveLemonSqueezyWebhook(req, res) {
  const secret = process.env.UPLOADCHECK_LEMONSQUEEZY_WEBHOOK_SECRET || process.env.LEMONSQUEEZY_WEBHOOK_SECRET;
  if (!secret) return sendJson(res, 503, { error: "lemonsqueezy_webhook_secret_missing" });
  const rawBody = await readRawBody(req);
  if (!verifyLemonSqueezySignature(rawBody, req.headers["x-signature"], secret)) {
    return sendJson(res, 401, { error: "invalid_lemonsqueezy_signature" });
  }
  let payload;
  try {
    payload = rawBody.length ? JSON.parse(rawBody.toString("utf8")) : {};
  } catch {
    return sendJson(res, 400, { error: "invalid_json" });
  }

  const eventName = payload?.meta?.event_name || payload?.meta?.eventName || null;
  if (!isProvisioningCheckoutEvent(eventName)) {
    return sendJson(res, 200, { ok: true, ignored: true, eventName });
  }

  const provisioning = checkoutProvisioningFromLemonPayload(payload);
  if (!provisioning.plan_id || !provisioning.owner_email) {
    return sendJson(res, 202, {
      ok: false,
      ignored: true,
      eventName,
      reason: "missing_plan_or_owner_email"
    });
  }

  const planId = normalizePlanId(provisioning.plan_id);
  if (!planId) {
    return sendJson(res, 202, {
      ok: false,
      ignored: true,
      eventName,
      reason: "unsupported_plan"
    });
  }
  const plan = resolvePlanEconomics({ plan_id: planId });
  const created = store.createApiKey({
    name: `${capitalize(planId)} MCP key`,
    workspace_id: provisioning.workspace_id,
    owner_email: provisioning.owner_email,
    provisioning_id: provisioning.provisioning_id,
    checkout_customer_id: provisioning.checkout_customer_id,
    checkout_subscription_id: provisioning.checkout_subscription_id,
    plan_id: planId,
    included_minutes: plan.includedMinutes,
    plan_price_cents: plan.planPriceCents,
    ai_review_budget_seconds: plan.aiReviewBudgetSeconds,
    overage_cap_cents: provisioning.overage_cap_cents ?? null,
    scopes: ["jobs:write", "jobs:read", "reports:read", "uploads:write"]
  });

  return sendJson(res, created.idempotentReplay ? 200 : 201, {
    ok: true,
    eventName,
    apiKey: created.apiKey,
    key: created.record,
    idempotentReplay: Boolean(created.idempotentReplay),
    warning: created.apiKey
      ? "The apiKey is shown once. Store it privately as UPLOADCHECK_API_KEY for MCP/API clients."
      : "Existing provisioning record returned without bearer secret; use the originally issued apiKey."
  });
}

async function materializeInlineManifest(body = {}) {
  const raw = body.manifest_json ?? body.manifestJson ?? body.storybook_json ?? body.storybookJson ?? null;
  const b64 = body.manifest_base64 ?? body.manifestBase64 ?? null;
  if (raw == null && !b64) return null;

  let payload;
  if (b64) {
    payload = Buffer.from(String(b64), "base64").toString("utf8");
    JSON.parse(payload);
  } else if (typeof raw === "string") {
    JSON.parse(raw);
    payload = raw;
  } else {
    payload = JSON.stringify(raw);
  }
  const dir = await mkdtemp(join(tmpdir(), "uploadcheck-manifest-"));
  const filePath = join(dir, "manifest.json");
  await writeFile(filePath, payload);
  return { filePath, cleanupPath: dir };
}

async function cleanupInlineManifest(manifest) {
  if (!manifest?.cleanupPath) return;
  await rm(manifest.cleanupPath, { recursive: true, force: true });
}

async function materializeInlineTranscript(body = {}) {
  const raw = body.transcript_text ?? body.transcriptText ?? body.transcript_json ?? body.transcriptJson ?? null;
  const b64 = body.transcript_base64 ?? body.transcriptBase64 ?? null;
  if (raw == null && !b64) return null;

  let payload;
  let ext = ".txt";
  if (b64) {
    payload = Buffer.from(String(b64), "base64").toString("utf8");
  } else if (typeof raw === "string") {
    payload = raw;
  } else {
    payload = JSON.stringify(raw);
    ext = ".json";
  }
  const dir = await mkdtemp(join(tmpdir(), "uploadcheck-transcript-"));
  const filePath = join(dir, `transcript${ext}`);
  await writeFile(filePath, payload);
  return { filePath, cleanupPath: dir };
}

async function cleanupInlineTranscript(transcript) {
  if (!transcript?.cleanupPath) return;
  await rm(transcript.cleanupPath, { recursive: true, force: true });
}

async function materializeInlineWatchlist(body = {}) {
  const raw = body.watchlist_json ?? body.watchlistJson ?? body.pronunciation_watchlist ?? body.pronunciationWatchlist ?? null;
  const b64 = body.watchlist_base64 ?? body.watchlistBase64 ?? null;
  if (raw == null && !b64) return null;

  let payload;
  if (b64) {
    payload = Buffer.from(String(b64), "base64").toString("utf8");
    JSON.parse(payload);
  } else if (typeof raw === "string") {
    JSON.parse(raw);
    payload = raw;
  } else {
    payload = JSON.stringify(raw);
  }
  const dir = await mkdtemp(join(tmpdir(), "uploadcheck-watchlist-"));
  const filePath = join(dir, "watchlist.json");
  await writeFile(filePath, payload);
  return { filePath, cleanupPath: dir };
}

async function cleanupInlineWatchlist(watchlist) {
  if (!watchlist?.cleanupPath) return;
  await rm(watchlist.cleanupPath, { recursive: true, force: true });
}

async function materializeInlineExpectedScript(body = {}) {
  const raw = body.expected_script_text ?? body.expectedScriptText ?? body.script_text ?? body.scriptText ?? body.expected_script_json ?? body.expectedScriptJson ?? null;
  const b64 = body.expected_script_base64 ?? body.expectedScriptBase64 ?? body.script_base64 ?? body.scriptBase64 ?? null;
  if (raw == null && !b64) return null;

  let payload;
  let ext = ".txt";
  if (b64) {
    payload = Buffer.from(String(b64), "base64").toString("utf8");
  } else if (typeof raw === "string") {
    payload = raw;
  } else {
    payload = JSON.stringify(raw);
    ext = ".json";
  }
  const dir = await mkdtemp(join(tmpdir(), "uploadcheck-expected-script-"));
  const filePath = join(dir, `expected-script${ext}`);
  await writeFile(filePath, payload);
  return { filePath, cleanupPath: dir };
}

async function cleanupInlineExpectedScript(expectedScript) {
  if (!expectedScript?.cleanupPath) return;
  await rm(expectedScript.cleanupPath, { recursive: true, force: true });
}

async function materializeInlineChunkSidecars(body = {}) {
  const raw = body.chunk_sidecars_json ?? body.chunkSidecarsJson ?? body.chunk_sidecar_json ?? body.chunkSidecarJson ?? null;
  const b64 = body.chunk_sidecars_base64 ?? body.chunkSidecarsBase64 ?? body.chunk_sidecar_base64 ?? body.chunkSidecarBase64 ?? null;
  if (raw == null && !b64) return null;

  let entries = raw;
  if (b64) entries = JSON.parse(Buffer.from(String(b64), "base64").toString("utf8"));
  if (typeof entries === "string") entries = JSON.parse(entries);
  if (!Array.isArray(entries)) {
    entries = Object.entries(entries || {}).map(([relativePath, json]) => ({ relative_path: relativePath, json }));
  }
  const dir = await mkdtemp(join(tmpdir(), "uploadcheck-chunk-sidecars-"));
  for (const entry of entries) {
    const relativePath = safeRelativePath(entry.relative_path || entry.relativePath || entry.filename || entry.name || "chunk-sidecar.json");
    const payload = entry.json ?? entry.payload ?? entry.data ?? entry;
    const filePath = join(dir, relativePath);
    mkdirSync(dirname(filePath), { recursive: true });
    await writeFile(filePath, typeof payload === "string" ? payload : JSON.stringify(payload));
  }
  return { dirPath: dir, cleanupPath: dir };
}

async function cleanupInlineChunkSidecars(sidecars) {
  if (!sidecars?.cleanupPath) return;
  await rm(sidecars.cleanupPath, { recursive: true, force: true });
}

function collectRemoteSidecarUrls(body = {}) {
  const candidates = {
    manifestUrl: body.manifest_url ?? body.manifestUrl ?? body.storybook_url ?? body.storybookUrl,
    transcriptUrl: body.transcript_url ?? body.transcriptUrl,
    watchlistUrl: body.watchlist_url ?? body.watchlistUrl ?? body.pronunciation_watchlist_url ?? body.pronunciationWatchlistUrl,
    expectedScriptUrl: body.expected_script_url ?? body.expectedScriptUrl ?? body.script_url ?? body.scriptUrl,
    chunkSidecarsUrl: body.chunk_sidecars_url ?? body.chunkSidecarsUrl ?? body.chunk_sidecar_url ?? body.chunkSidecarUrl
  };
  const urls = {};
  for (const [key, value] of Object.entries(candidates)) {
    if (!value) continue;
    const url = validateRemoteSidecarUrl(value);
    if (!url.ok) {
      return {
        error: {
          error: "invalid_sidecar_url",
          field: key,
          message: url.message
        }
      };
    }
    urls[key] = url.href;
  }
  return { urls: Object.keys(urls).length ? urls : null };
}

function validateRemoteSidecarUrl(value) {
  try {
    const parsed = new URL(String(value));
    const loopbackHttp = parsed.protocol === "http:" && ["127.0.0.1", "localhost", "::1"].includes(parsed.hostname);
    if (parsed.protocol !== "https:" && !loopbackHttp) return { ok: false, message: "Remote sidecar URLs must use https, except local loopback URLs used by tests." };
    if (!parsed.hostname) return { ok: false, message: "Remote sidecar URL must include a hostname." };
    return { ok: true, href: parsed.href };
  } catch {
    return { ok: false, message: "Remote sidecar URL is not a valid URL." };
  }
}

async function materializeRemoteSidecars(urls = null) {
  if (!urls || !Object.keys(urls).length) return null;
  const dir = await mkdtemp(join(tmpdir(), "uploadcheck-remote-sidecars-"));
  const files = { cleanupPath: dir };
  try {
    if (urls.manifestUrl) {
      files.manifestPath = await fetchRemoteSidecarFile(urls.manifestUrl, join(dir, "manifest.json"), { expectJson: true });
    }
    if (urls.transcriptUrl) {
      files.transcriptPath = await fetchRemoteSidecarFile(urls.transcriptUrl, join(dir, inferTextSidecarFilename(urls.transcriptUrl, "transcript")));
    }
    if (urls.watchlistUrl) {
      files.watchlistPath = await fetchRemoteSidecarFile(urls.watchlistUrl, join(dir, "watchlist.json"), { expectJson: true });
    }
    if (urls.expectedScriptUrl) {
      files.expectedScriptPath = await fetchRemoteSidecarFile(urls.expectedScriptUrl, join(dir, inferTextSidecarFilename(urls.expectedScriptUrl, "expected-script")));
    }
    if (urls.chunkSidecarsUrl) {
      files.sidecarDir = await fetchRemoteChunkSidecars(urls.chunkSidecarsUrl, join(dir, "chunk-sidecars"));
    }
    return files;
  } catch (error) {
    await cleanupRemoteSidecars(files);
    throw error;
  }
}

async function fetchRemoteSidecarFile(url, filePath, options = {}) {
  const payload = await fetchRemoteSidecarText(url);
  if (options.expectJson) JSON.parse(payload);
  await writeFile(filePath, payload);
  return filePath;
}

async function fetchRemoteChunkSidecars(url, dir) {
  const payload = await fetchRemoteSidecarText(url);
  let entries = JSON.parse(payload);
  if (!Array.isArray(entries)) {
    entries = Object.entries(entries || {}).map(([relativePath, json]) => ({ relative_path: relativePath, json }));
  }
  mkdirSync(dir, { recursive: true });
  for (const entry of entries.slice(0, 200)) {
    const relativePath = safeRelativePath(entry.relative_path || entry.relativePath || entry.filename || entry.name || "chunk-sidecar.json");
    const data = entry.json ?? entry.payload ?? entry.data ?? entry;
    const filePath = join(dir, relativePath);
    mkdirSync(dirname(filePath), { recursive: true });
    await writeFile(filePath, typeof data === "string" ? data : JSON.stringify(data));
  }
  return dir;
}

async function fetchRemoteSidecarText(url) {
  const response = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new Error(`Remote sidecar fetch failed ${response.status}: ${url}`);
  const contentLength = Number(response.headers.get("content-length") || 0);
  const maxBytes = 2 * 1024 * 1024;
  if (contentLength > maxBytes) throw new Error(`Remote sidecar exceeds 2 MB limit: ${url}`);
  const text = await response.text();
  if (Buffer.byteLength(text, "utf8") > maxBytes) throw new Error(`Remote sidecar exceeds 2 MB limit: ${url}`);
  return text;
}

function inferTextSidecarFilename(url, base) {
  try {
    const ext = extname(new URL(url).pathname).toLowerCase();
    return ext === ".json" ? `${base}.json` : `${base}.txt`;
  } catch {
    return `${base}.txt`;
  }
}

async function cleanupRemoteSidecars(sidecars) {
  if (!sidecars?.cleanupPath) return;
  await rm(sidecars.cleanupPath, { recursive: true, force: true });
}

function safeRelativePath(value) {
  const parts = String(value || "chunk-sidecar.json")
    .replace(/\\/g, "/")
    .split("/")
    .filter((part) => part && part !== "." && part !== "..")
    .map((part) => part.replace(/[^a-zA-Z0-9._-]+/g, "_"));
  return parts.length ? join(...parts) : basename("chunk-sidecar.json");
}

function redirectCheckout(url, res) {
  const rawPlan = url.pathname.split("/").at(-1);
  const plan = normalizePlanId(rawPlan);
  if (!plan) return sendJson(res, 404, { error: "unknown_plan", plan: rawPlan });

  const checkoutUrl = buildCheckoutUrl(plan);
  if (!checkoutUrl) {
    return sendJson(res, 503, {
      error: "checkout_not_configured",
      plan,
      requiredEnv: [
        `UPLOADCHECK_${plan.toUpperCase()}_CHECKOUT_URL`,
        "or UPLOADCHECK_LEMONSQUEEZY_STORE_SLUG plus UPLOADCHECK_<PLAN>_VARIANT_ID"
      ]
    });
  }

  res.writeHead(302, { Location: checkoutUrl });
  res.end();
}

function getJob(req, url, res) {
  const auth = requireScope(req, "jobs:read");
  if (!auth.ok) return sendJson(res, auth.status, { error: auth.error });
  const jobId = url.pathname.split("/").at(-1);
  const access = authorizeJobAccess(auth, jobId);
  if (!access.ok) return sendJson(res, access.status, { error: access.error });
  return sendJson(res, 200, withCostEstimate(store.getJob(jobId) || completedJob(jobId)));
}

function getReport(req, url, res) {
  const auth = requireScope(req, "reports:read");
  if (!auth.ok) return sendJson(res, auth.status, { error: auth.error });
  const jobId = url.pathname.split("/").at(-2);
  const access = authorizeJobAccess(auth, jobId);
  if (!access.ok) return sendJson(res, access.status, { error: access.error });
  const realJob = store.getJob(jobId);
  const job = realJob || completedJob(jobId);
  const fallbackMinutes = Math.max(1, Math.ceil(job.minutesMetered || 19));
  const usage = realJob
    ? store.recordCompletedUsage(jobId)
    : store.appendUsage(jobId, fallbackMinutes, undefined, estimateCostForJob(job, fallbackMinutes));
  const costEstimate = estimateCostForJob(job, usage?.roundedMinutes ?? (realJob ? Math.max(0, Math.ceil(Number(job.minutesMetered || 0))) : fallbackMinutes));
  const flags = store.listFlags(jobId);
  const artifacts = store.listArtifacts(jobId);
  return sendJson(res, 200, {
    jobId,
    verdict: job.verdict || "WATCH",
    usage,
    costEstimate,
    providerUsage: job.providerUsage || [],
    flags: flags.length ? flags : (realJob ? [] : [defaultFlag(jobId)]),
    artifacts: artifacts.length ? artifacts : (realJob ? [] : defaultArtifacts(jobId))
  });
}

function getJobEvents(req, url, res) {
  const auth = requireScope(req, "jobs:read");
  if (!auth.ok) return sendJson(res, auth.status, { error: auth.error });
  const jobId = url.pathname.split("/").at(-2);
  const access = authorizeJobAccess(auth, jobId);
  if (!access.ok) return sendJson(res, access.status, { error: access.error });
  return sendJson(res, 200, { events: store.listJobEvents(jobId) });
}

function getJobArtifacts(req, url, res) {
  const auth = requireScope(req, "reports:read");
  if (!auth.ok) return sendJson(res, auth.status, { error: auth.error });
  const jobId = url.pathname.split("/").at(-2);
  const access = authorizeJobAccess(auth, jobId);
  if (!access.ok) return sendJson(res, access.status, { error: access.error });
  const artifacts = store.listArtifacts(jobId);
  return sendJson(res, 200, { artifacts: artifacts.length ? artifacts : defaultArtifacts(jobId) });
}

function getMarkerExport(req, url, res) {
  const auth = requireScope(req, "reports:read");
  if (!auth.ok) return sendJson(res, auth.status, { error: auth.error });
  const jobId = url.pathname.split("/").at(-3);
  const access = authorizeJobAccess(auth, jobId);
  if (!access.ok) return sendJson(res, access.status, { error: access.error });
  const csv = store.buildMarkerCsv(jobId);
  res.writeHead(200, {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="${jobId}-qc-markers.csv"`
  });
  res.end(csv);
}

function listAbuseEvents(req, url, res) {
  const auth = requireScope(req, "api_keys:read");
  if (!auth.ok) return sendJson(res, auth.status, { error: auth.error });
  return sendJson(res, 200, {
    abuseEvents: store.listAbuseEvents({
      workspaceId: workspaceFilterForAuth(auth, url),
      limit: url.searchParams.get("limit")
    })
  });
}

function listSpendAlerts(req, url, res) {
  const auth = requireScope(req, "api_keys:read");
  if (!auth.ok) return sendJson(res, auth.status, { error: auth.error });
  return sendJson(res, 200, {
    spendAlerts: store.listSpendAlerts({
      workspaceId: workspaceFilterForAuth(auth, url),
      limit: url.searchParams.get("limit")
    })
  });
}

async function ingestGateVerdict(req, url, res) {
  const auth = requireScope(req, "jobs:write");
  if (!auth.ok) return sendJson(res, auth.status, { error: auth.error });
  const jobId = url.pathname.split("/").at(-2);
  const access = authorizeJobAccess(auth, jobId);
  if (!access.ok) return sendJson(res, access.status, { error: access.error });
  const body = await readJson(req);
  const result = store.ingestGateVerdict(jobId, body);
  if (!result) return sendJson(res, 404, { error: "job_not_found" });
  await maybeAlertOwnerForSpend(result.job);
  store.createWebhookDeliveriesForJob(jobId, "job.completed");
  return sendJson(res, 200, {
    jobId,
    verdict: result.job.verdict,
    blocked: result.blocked,
    skipped: result.skipped,
    importedFlags: result.importedFlags.length,
    reportUrl: result.job.reportUrl
  });
}

function cancelJob(req, url, res) {
  const auth = requireScope(req, "jobs:write");
  if (!auth.ok) return sendJson(res, auth.status, { error: auth.error });
  const jobId = url.pathname.split("/").at(-2);
  const access = authorizeJobAccess(auth, jobId);
  if (!access.ok) return sendJson(res, access.status, { error: access.error });
  const job = store.cancelJob(jobId) || { ...completedJob(jobId), status: "cancelled" };
  return sendJson(res, 200, job);
}

async function createUpload(req, res) {
  const auth = requireScope(req, "uploads:write");
  if (!auth.ok) return sendJson(res, auth.status, { error: auth.error });
  const body = await readJson(req);
  applyAuthenticatedApiKeyDefaults(body, auth.apiKeyRecord);
  const sizeBytes = Number(body.size_bytes ?? body.sizeBytes ?? 0);
  if (Number.isFinite(sizeBytes) && sizeBytes > maxUploadMb * 1024 * 1024) {
    const payload = {
      error: "upload_size_limit_exceeded",
      message: `Upload reservation exceeds ${maxUploadMb} MB limit.`,
      maxUploadMb,
      requestedBytes: sizeBytes
    };
    recordAbuseEventForRequest({ status: 413, payload }, body, auth.apiKeyRecord);
    return sendJson(res, 413, payload);
  }
  return sendJson(res, 201, store.createUpload(body, { baseUrl: requestBaseUrl(req) }));
}

async function putUploadContent(req, url, res) {
  const uploadId = url.pathname.split("/").at(-2);
  const upload = store.getUpload(uploadId);
  if (!upload) return sendJson(res, 404, { error: "upload_not_found" });
  if (url.searchParams.get("token") !== upload.uploadToken) return sendJson(res, 403, { error: "invalid_upload_token" });
  if (new Date(upload.expiresAt).getTime() < Date.now()) return sendJson(res, 410, { error: "upload_url_expired" });

  const expected = Number(upload.sizeBytes || 0);
  const contentLength = Number(req.headers["content-length"] || 0);
  if (expected && contentLength && contentLength > expected) return sendJson(res, 413, { error: "upload_too_large" });
  if (contentLength && contentLength > maxUploadMb * 1024 * 1024) {
    const payload = {
      error: "upload_size_limit_exceeded",
      message: `Upload content exceeds ${maxUploadMb} MB limit.`,
      maxUploadMb,
      requestedBytes: contentLength
    };
    recordAbuseEventForRequest({ status: 413, payload }, { upload_id: uploadId, size_bytes: contentLength }, null);
    return sendJson(res, 413, payload);
  }

  mkdirSync(uploadStorageDir, { recursive: true });
  const safeName = String(upload.filename || "upload.mp4").replace(/[^a-zA-Z0-9._-]+/g, "_");
  const contentPath = join(uploadStorageDir, `${upload.uploadId}-${safeName}`);
  const hash = createHash("sha256");
  let bytesReceived = 0;
  const meter = new Transform({
    transform(chunk, encoding, callback) {
      bytesReceived += chunk.length;
      hash.update(chunk);
      callback(null, chunk);
    }
  });
  await pipeline(req, meter, createWriteStream(contentPath));
  let objectStorage = null;
  if (objectStorageConfig.configured) {
    objectStorage = await uploadFileToObjectStorage(contentPath, {
      key: objectKeyForUpload(upload),
      contentType: upload.contentType,
      sha256: hash.copy().digest("hex")
    });
  }
  const stored = store.markUploadStored(uploadId, {
    contentPath,
    storageMode: objectStorage?.storageMode || uploadStorageMode,
    objectKey: objectStorage?.objectKey,
    objectUrl: objectStorage?.objectUrl,
    bytesReceived,
    sha256: hash.digest("hex")
  });
  return sendJson(res, 200, {
    uploadId,
    status: stored.status,
    storageMode: stored.storageMode,
    bytesReceived: stored.bytesReceived,
    sha256: stored.sha256,
    objectKey: stored.objectKey || undefined,
    objectUrl: stored.objectUrl || undefined
  });
}

function getUpload(req, url, res) {
  const auth = requireScope(req, "uploads:write");
  if (!auth.ok) return sendJson(res, auth.status, { error: auth.error });
  const uploadId = url.pathname.split("/").at(-1);
  const access = authorizeUploadAccess(auth, uploadId);
  if (!access.ok) return sendJson(res, access.status, { error: access.error });
  return sendJson(res, 200, access.upload);
}

function requestBaseUrl(req) {
  const proto = req.headers["x-forwarded-proto"] || "http";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  return `${proto}://${host}`;
}

function listJobs(req, res) {
  const auth = requireScope(req, "jobs:read");
  if (!auth.ok) return sendJson(res, auth.status, { error: auth.error });
  const url = new URL(req.url || "/", `http://${req.headers.host}`);
  return sendJson(res, 200, {
    jobs: store.listJobs({
      limit: url.searchParams.get("limit") || 20,
      status: url.searchParams.get("status"),
      sourceUrl: url.searchParams.get("source_url")
    })
      .filter((job) => canAccessJob(auth, job))
      .map((job) => publicJob(job))
  });
}

function getUsage(req, res) {
  const auth = requireScope(req, "jobs:read");
  if (!auth.ok) return sendJson(res, auth.status, { error: auth.error });
  return sendJson(res, 200, { usageLedger: filterUsageLedgerForAuth(store.state.usageLedger, auth).slice(-50).reverse() });
}

function getUsageMargins(req, res) {
  const auth = requireScope(req, "jobs:read");
  if (!auth.ok) return sendJson(res, auth.status, { error: auth.error });
  const url = new URL(req.url || "/", `http://${req.headers.host}`);
  const billingPeriod = url.searchParams.get("billing_period") || url.searchParams.get("billingPeriod") || null;
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 500) || 500, 1), 5000);
  const entries = filterUsageLedgerForAuth(store.state.usageLedger, auth)
    .filter((entry) => !billingPeriod || entry.billingPeriod === billingPeriod)
    .slice(-limit);
  return sendJson(res, 200, {
    billingPeriod,
    summary: summarizeUsageMargins(entries),
    usageLedger: entries.slice(-50).reverse()
  });
}

function checkJobAbuseLimits(body = {}, { declaredMinutes = 0 } = {}) {
  if (declaredMinutes && declaredMinutes > maxDurationMinutes) {
    return {
      ok: false,
      status: 413,
      payload: {
        error: "duration_limit_exceeded",
        message: `Declared media duration exceeds ${maxDurationMinutes} minute limit.`,
        maxDurationMinutes,
        requestedMinutes: declaredMinutes
      }
    };
  }
  const requestedBytes = Number(
    body.size_bytes ??
    body.sizeBytes ??
    body.media_bytes ??
    body.mediaBytes ??
    body.inline_media?.bytes ??
    0
  );
  if (Number.isFinite(requestedBytes) && requestedBytes > maxUploadMb * 1024 * 1024) {
    return {
      ok: false,
      status: 413,
      payload: {
        error: "upload_size_limit_exceeded",
        message: `Declared media size exceeds ${maxUploadMb} MB limit.`,
        maxUploadMb,
        requestedBytes
      }
    };
  }
  const workspaceId = body.workspace_id || body.workspaceId || null;
  const activeJobs = store.listJobs({ limit: 100 })
    .filter((job) => !workspaceId || job.workspaceId === workspaceId)
    .filter((job) => ["queued", "ingesting", "metadata_probe", "deterministic_qc", "agent_review", "reporting"].includes(job.status)).length;
  if (activeJobs >= maxActiveJobs) {
    return {
      ok: false,
      status: 429,
      payload: {
        error: "active_job_limit_exceeded",
        message: `Active job count has reached the ${maxActiveJobs} job limit.`,
        maxActiveJobs,
        activeJobs
      }
    };
  }
  return { ok: true };
}

function recordAbuseEventForRequest(result, body = {}, apiKeyRecord = null) {
  const payload = result?.payload || {};
  store.recordAbuseEvent({
    type: payload.error,
    error: payload.error,
    status: result?.status,
    workspaceId: body.workspace_id || body.workspaceId || apiKeyRecord?.workspaceId || null,
    ownerEmail: body.owner_email || body.ownerEmail || apiKeyRecord?.ownerEmail || null,
    apiKeyId: body.api_key_id || body.apiKeyId || apiKeyRecord?.keyId || null,
    source: body.source || body.youtube_url || body.signed_url || body.upload_id || body.uploadId || null,
    sourceType: body.source_type || body.sourceType || null,
    requestedMinutes: payload.requestedMinutes,
    requestedBytes: payload.requestedBytes,
    maxDurationMinutes: payload.maxDurationMinutes,
    maxUploadMb: payload.maxUploadMb,
    maxActiveJobs: payload.maxActiveJobs,
    activeJobs: payload.activeJobs
  });
}

function recordAbuseEventForUsageLimit(result, body = {}, apiKeyRecord = null) {
  store.recordAbuseEvent({
    type: "usage_limit_exceeded",
    error: "usage_limit_exceeded",
    status: 402,
    workspaceId: body.workspace_id || body.workspaceId || apiKeyRecord?.workspaceId || null,
    ownerEmail: body.owner_email || body.ownerEmail || apiKeyRecord?.ownerEmail || null,
    apiKeyId: body.api_key_id || body.apiKeyId || apiKeyRecord?.keyId || null,
    source: body.source || body.youtube_url || body.signed_url || body.upload_id || body.uploadId || null,
    sourceType: body.source_type || body.sourceType || null,
    planId: result.planId || body.plan_id || body.planId || null,
    billingPeriod: result.billingPeriod || null,
    includedMinutes: result.includedMinutes,
    minutesUsed: result.minutesUsed,
    requestedMinutes: result.requestedMinutes,
    minutesRemaining: result.minutesRemaining,
    requestedAiReviewSeconds: result.requestedAiReviewSeconds,
    aiReviewSecondsUsed: result.aiReviewSecondsUsed,
    aiReviewSecondsRemaining: result.aiReviewSecondsRemaining,
    overageCapCents: result.overageCapCents,
    projectedOverageRevenueCents: result.projectedOverageRevenueCents,
    overageRateCentsPerMinute: result.overageRateCentsPerMinute
  });
}

async function createWebhook(req, res) {
  const auth = requireScope(req, "webhooks:write");
  if (!auth.ok) return sendJson(res, auth.status, { error: auth.error });
  const body = await readJson(req);
  applyAuthenticatedApiKeyDefaults(body, auth.apiKeyRecord);
  return sendJson(res, 201, store.createWebhook(body));
}

function previewWebhookDelivery(req, url, res) {
  const auth = requireScope(req, "webhooks:write");
  if (!auth.ok) return sendJson(res, auth.status, { error: auth.error });
  const webhookId = url.pathname.split("/").at(-2);
  const access = authorizeWebhookAccess(auth, webhookId);
  if (!access.ok) return sendJson(res, access.status, { error: access.error });
  return sendJson(res, 200, store.createWebhookDelivery(webhookId, "job.completed", "job_demo"));
}

function listWebhookDeliveries(req, res) {
  const auth = requireScope(req, "webhooks:write");
  if (!auth.ok) return sendJson(res, auth.status, { error: auth.error });
  const url = new URL(req.url || "/", `http://${req.headers.host}`);
  return sendJson(res, 200, {
    deliveries: store.listWebhookDeliveries({
      limit: url.searchParams.get("limit") || 20,
      status: url.searchParams.get("status"),
      webhookId: url.searchParams.get("webhook_id"),
      workspaceId: auth.apiKeyRecord?.workspaceId || null
    })
  });
}

async function retryWebhookDelivery(req, url, res) {
  const auth = requireScope(req, "webhooks:write");
  if (!auth.ok) return sendJson(res, auth.status, { error: auth.error });
  const deliveryId = url.pathname.split("/").at(-2);
  const access = authorizeWebhookDeliveryAccess(auth, deliveryId);
  if (!access.ok) return sendJson(res, access.status, { error: access.error });
  const delivery = access.delivery;
  const result = await sendWebhookDelivery(delivery);
  return sendJson(res, 200, store.markWebhookDeliveryAttempt(deliveryId, result));
}

async function drainWebhookDeliveries(req, res) {
  const auth = requireScope(req, "webhooks:write");
  if (!auth.ok) return sendJson(res, auth.status, { error: auth.error });
  const body = await readJson(req);
  const deliveries = store.listDueWebhookDeliveries({
    limit: body.limit || 10,
    workspaceId: auth.apiKeyRecord?.workspaceId || null
  });
  const results = [];

  for (const delivery of deliveries) {
    const result = await sendWebhookDelivery(delivery);
    results.push(store.markWebhookDeliveryAttempt(delivery.deliveryId, result));
  }

  return sendJson(res, 200, {
    processed: results.length,
    results
  });
}

async function sendWebhookDelivery(delivery) {
  try {
    const response = await fetch(delivery.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        [delivery.signatureHeader]: delivery.signature,
        "x-uploadcheck-delivery-id": delivery.deliveryId,
        "x-uploadcheck-event": delivery.eventType
      },
      body: JSON.stringify(delivery.payload)
    });
    return { ok: response.ok, responseStatus: response.status, error: response.ok ? null : `HTTP ${response.status}` };
  } catch (error) {
    return { ok: false, responseStatus: null, error: error instanceof Error ? error.message : "webhook_delivery_error" };
  }
}

function completedJob(jobId) {
  return {
    jobId,
    status: "completed",
    progressPct: 100,
    verdict: "WATCH",
    minutesMetered: 19,
    source: "https://youtube.com/watch?v=creator-cut",
    sourceType: "youtube",
    statusUrl: `/v1/qc/jobs/${jobId}`,
    reportUrl: `/v1/qc/jobs/${jobId}/report`
  };
}

function defaultFlag(jobId) {
  return {
    flagId: `flg_${jobId}`,
    jobId,
    gate: "caption",
    severity: "warn",
    timestamp: "00:09:12",
    summary: "Caption sits near the Shorts UI safe area.",
    evidenceSource: "transcript",
    transcriptEvidence: "the payment failed twice"
  };
}

function defaultArtifacts(jobId) {
  return [
    { artifactType: "json_report", url: `/v1/qc/jobs/${jobId}/report`, metadata: { format: "json" } },
    { artifactType: "marker_export", url: `/v1/qc/jobs/${jobId}/artifacts/markers`, metadata: { format: "premiere_csv" } }
  ];
}

async function serveStatic(pathname, res) {
  const safePath = pathname === "/" ? "/index.html" : pathname;
  const filePath = join(distDir, safePath);
  const resolved = resolve(filePath);
  let target = join(distDir, "index.html");
  if (resolved.startsWith(distDir) && existsSync(resolved)) {
    const stat = statSync(resolved);
    target = stat.isDirectory() ? join(resolved, "index.html") : resolved;
  } else if (isPublicArtifactPath(safePath)) {
    return sendJson(res, 404, { error: "artifact_not_found", path: safePath });
  }
  if (!existsSync(target)) target = join(distDir, "index.html");
  res.writeHead(200, { "Content-Type": mimeTypes[extname(target)] || "application/octet-stream" });
  createReadStream(target).pipe(res);
}

function isPublicArtifactPath(pathname) {
  return /\.(json|txt|xml|webmanifest|mp4|svg)$/i.test(pathname);
}

async function readJson(req) {
  const raw = await readRawBody(req);
  const text = raw.toString("utf8");
  return text ? JSON.parse(text) : {};
}

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

function verifyLemonSqueezySignature(rawBody, signatureHeader, secret) {
  const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;
  if (!signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const expectedBuffer = Buffer.from(expected, "utf8");
  const signatureBuffer = Buffer.from(String(signature), "utf8");
  return expectedBuffer.length === signatureBuffer.length && timingSafeEqual(expectedBuffer, signatureBuffer);
}

function isProvisioningCheckoutEvent(eventName) {
  return new Set(["subscription_created", "subscription_updated", "order_created"]).has(String(eventName || ""));
}

function checkoutProvisioningFromLemonPayload(payload = {}) {
  const data = payload.data || {};
  const attrs = data.attributes || {};
  const meta = payload.meta || {};
  const custom = attrs.custom_data || attrs.customData || meta.custom_data || meta.customData || {};
  const planId = normalizePlanId(
    custom.uploadcheck_plan_id
    || custom.plan_id
    || custom.planId
    || attrs.variant_name
    || attrs.variantName
    || attrs.product_name
    || attrs.productName
    || attrs.first_subscription_item?.variant_name
    || attrs.firstSubscriptionItem?.variantName
  );
  const ownerEmail = stringOrNull(
    custom.owner_email
    || custom.ownerEmail
    || attrs.user_email
    || attrs.userEmail
    || attrs.customer_email
    || attrs.customerEmail
  );
  const checkoutCustomerId = stringOrNull(
    custom.checkout_customer_id
    || custom.checkoutCustomerId
    || attrs.customer_id
    || attrs.customerId
    || attrs.customer?.id
    || relationshipId(data.relationships?.customer)
  );
  const checkoutSubscriptionId = stringOrNull(
    custom.checkout_subscription_id
    || custom.checkoutSubscriptionId
    || data.id
    || attrs.subscription_id
    || attrs.subscriptionId
    || relationshipId(data.relationships?.subscription)
  );
  const workspaceId = stringOrNull(custom.workspace_id || custom.workspaceId)
    || workspaceIdFromCheckout({ checkoutCustomerId, checkoutSubscriptionId, ownerEmail });
  const provisioningId = stringOrNull(custom.provisioning_id || custom.provisioningId)
    || ["lemonsqueezy", planId || "unknown", checkoutSubscriptionId || checkoutCustomerId || workspaceId].join(":");
  const overageCapCents = numberOrNull(custom.overage_cap_cents ?? custom.overageCapCents);
  return {
    plan_id: planId,
    owner_email: ownerEmail,
    workspace_id: workspaceId,
    provisioning_id: provisioningId,
    checkout_customer_id: checkoutCustomerId,
    checkout_subscription_id: checkoutSubscriptionId,
    overage_cap_cents: overageCapCents
  };
}

function relationshipId(relationship) {
  const value = relationship?.data;
  if (Array.isArray(value)) return value[0]?.id || null;
  return value?.id || null;
}

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(payload, null, 2));
}

function applyCors(req, res) {
  const origin = req.headers.origin;
  if (origin && corsOrigins.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Headers", "authorization, content-type");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS");
  }
  if (req.method !== "OPTIONS") return false;
  res.writeHead(origin && corsOrigins.has(origin) ? 204 : 403);
  res.end();
  return true;
}

function withCostEstimate(job) {
  if (!job) return job;
  const safeJob = publicJob(job);
  return {
    ...safeJob,
    costEstimate: estimateCostForJob(job, job.minutesMetered || 0)
  };
}

function publicJob(job) {
  if (!job) return job;
  const safe = { ...job };
  delete safe.sidecarUrls;
  if (shouldRedactSource(safe)) {
    delete safe.source;
    safe.sourceRedacted = true;
  }
  return safe;
}

function shouldRedactSource(job) {
  return job.sourceType === "upload" || job.uploadId || job.mediaIngress?.mode === "inline_ephemeral" || job.mediaIngress?.mode === "signed_upload";
}

function estimateCostForJob(job, minutesMetered) {
  return estimateJobCost({
    minutesMetered,
    aiReviewSeconds: job.aiReviewSeconds || 0,
    checks: job.checks,
    providerUsage: job.providerUsage,
    planId: job.planId,
    planPriceCents: job.planPriceCents,
    includedMinutes: job.includedMinutes,
    aiReviewBudgetSeconds: job.aiReviewBudgetSeconds
  });
}

function checkUsageLimit(body = {}) {
  const planId = String(body.plan_id || body.planId || "").toLowerCase();
  if (!planId) return { ok: true };
  const requestedMinutes = estimateRequestedMinutes(body);
  const plan = resolvePlanEconomics(body);
  if (!plan.includedMinutes && !plan.aiReviewBudgetSeconds) return { ok: true };
  const usage = store.summarizePlanUsage({
    planId,
    workspaceId: body.workspace_id || body.workspaceId || null,
    billingPeriod: body.billing_period || body.billingPeriod,
    includedMinutes: plan.includedMinutes
  });
  const requestedAiReviewSeconds = Math.max(0, Number(body.ai_review_seconds ?? body.aiReviewSeconds ?? 0) || 0);
  const overageRateCentsPerMinute = overageRateForPlan(planId);
  const overageCapCents = Math.max(0, Number(body.overage_cap_cents ?? body.overageCapCents ?? 0) || 0);
  const projectedMinutesUsed = usage.minutesUsed + requestedMinutes;
  const projectedOverageMinutes = Math.max(0, projectedMinutesUsed - plan.includedMinutes);
  const projectedOverageRevenueCents = projectedOverageMinutes * overageRateCentsPerMinute;
  const minuteLimitOk = !requestedMinutes
    || !plan.includedMinutes
    || projectedMinutesUsed <= plan.includedMinutes
    || (overageCapCents > 0 && projectedOverageRevenueCents <= overageCapCents);
  const aiLimitOk = !requestedAiReviewSeconds || usage.aiReviewSecondsUsed + requestedAiReviewSeconds <= plan.aiReviewBudgetSeconds;
  if (minuteLimitOk && aiLimitOk) {
    return {
      ok: true,
      planId,
      billingPeriod: usage.billingPeriod,
      includedMinutes: plan.includedMinutes,
      minutesUsed: usage.minutesUsed,
      requestedMinutes,
      minutesRemaining: plan.includedMinutes ? plan.includedMinutes - usage.minutesUsed : null,
      overageCapCents,
      projectedOverageRevenueCents,
      overageRateCentsPerMinute,
      aiReviewBudgetSeconds: plan.aiReviewBudgetSeconds,
      aiReviewSecondsUsed: usage.aiReviewSecondsUsed,
      requestedAiReviewSeconds,
      aiReviewSecondsRemaining: Math.max(0, plan.aiReviewBudgetSeconds - usage.aiReviewSecondsUsed)
    };
  }
  if (!aiLimitOk) {
    return {
      ok: false,
      planId,
      billingPeriod: usage.billingPeriod,
      includedMinutes: plan.includedMinutes,
      minutesUsed: usage.minutesUsed,
      requestedMinutes,
      minutesRemaining: plan.includedMinutes ? Math.max(0, plan.includedMinutes - usage.minutesUsed) : null,
      aiReviewBudgetSeconds: plan.aiReviewBudgetSeconds,
      aiReviewSecondsUsed: usage.aiReviewSecondsUsed,
      requestedAiReviewSeconds,
      aiReviewSecondsRemaining: Math.max(0, plan.aiReviewBudgetSeconds - usage.aiReviewSecondsUsed),
      overageCapCents,
      projectedOverageRevenueCents,
      overageRateCentsPerMinute,
      reason: `Plan ${planId} has ${usage.aiReviewSecondsUsed}/${plan.aiReviewBudgetSeconds} AI-review seconds used for ${usage.billingPeriod}; this ${requestedAiReviewSeconds} second request exceeds the included AI-review allowance.`
    };
  }
  return {
    ok: false,
    planId,
    billingPeriod: usage.billingPeriod,
    includedMinutes: plan.includedMinutes,
    minutesUsed: usage.minutesUsed,
    requestedMinutes,
    minutesRemaining: Math.max(0, plan.includedMinutes - usage.minutesUsed),
    overageCapCents,
    projectedOverageRevenueCents,
    overageRateCentsPerMinute,
    aiReviewBudgetSeconds: plan.aiReviewBudgetSeconds,
    aiReviewSecondsUsed: usage.aiReviewSecondsUsed,
    requestedAiReviewSeconds,
    aiReviewSecondsRemaining: Math.max(0, plan.aiReviewBudgetSeconds - usage.aiReviewSecondsUsed),
    reason: overageCapCents > 0
      ? `Plan ${planId} has ${usage.minutesUsed}/${plan.includedMinutes} minutes used for ${usage.billingPeriod}; this ${requestedMinutes} minute job would exceed the approved overage cap of ${(overageCapCents / 100).toFixed(2)} USD.`
      : `Plan ${planId} has ${usage.minutesUsed}/${plan.includedMinutes} minutes used for ${usage.billingPeriod}; this ${requestedMinutes} minute job exceeds the included allowance and no overage cap is approved.`
  };
}

function applyAuthenticatedApiKeyDefaults(body, apiKeyRecord = null) {
  if (!apiKeyRecord) return body;
  body.workspace_id = apiKeyRecord.workspaceId;
  body.workspaceId = apiKeyRecord.workspaceId;
  body.owner_email = apiKeyRecord.ownerEmail;
  body.ownerEmail = apiKeyRecord.ownerEmail;
  body.api_key_id = apiKeyRecord.keyId;
  body.apiKeyId = apiKeyRecord.keyId;
  body.plan_id = apiKeyRecord.planId;
  body.planId = apiKeyRecord.planId;
  body.included_minutes = apiKeyRecord.includedMinutes;
  body.includedMinutes = apiKeyRecord.includedMinutes;
  body.plan_price_cents = apiKeyRecord.planPriceCents;
  body.planPriceCents = apiKeyRecord.planPriceCents;
  body.overage_cap_cents = apiKeyRecord.overageCapCents;
  body.overageCapCents = apiKeyRecord.overageCapCents;
  body.checkout_customer_id = apiKeyRecord.checkoutCustomerId;
  body.checkoutCustomerId = apiKeyRecord.checkoutCustomerId;
  body.checkout_subscription_id = apiKeyRecord.checkoutSubscriptionId;
  body.checkoutSubscriptionId = apiKeyRecord.checkoutSubscriptionId;
  return body;
}

function applyApiKeyProvisioningScope(body, apiKeyRecord = null) {
  if (!apiKeyRecord) return body;
  body.workspace_id = apiKeyRecord.workspaceId;
  body.workspaceId = apiKeyRecord.workspaceId;
  body.owner_email = apiKeyRecord.ownerEmail;
  body.ownerEmail = apiKeyRecord.ownerEmail;
  body.plan_id = apiKeyRecord.planId;
  body.planId = apiKeyRecord.planId;
  body.included_minutes = apiKeyRecord.includedMinutes;
  body.includedMinutes = apiKeyRecord.includedMinutes;
  body.plan_price_cents = apiKeyRecord.planPriceCents;
  body.planPriceCents = apiKeyRecord.planPriceCents;
  body.overage_cap_cents = apiKeyRecord.overageCapCents;
  body.overageCapCents = apiKeyRecord.overageCapCents;
  return body;
}

function authorizeJobAccess(auth, jobId) {
  if (!auth.apiKeyRecord) return { ok: true };
  const job = store.getJob(jobId);
  if (!job) return { ok: false, status: 404, error: "job_not_found" };
  if (!canAccessJob(auth, job)) return { ok: false, status: 404, error: "job_not_found" };
  return { ok: true };
}

function canAccessJob(auth, job) {
  if (!auth.apiKeyRecord) return true;
  return job?.workspaceId && job.workspaceId === auth.apiKeyRecord.workspaceId;
}

function authorizeUploadAccess(auth, uploadId) {
  if (!auth.apiKeyRecord) {
    const upload = store.getUpload(uploadId);
    return upload ? { ok: true, upload } : { ok: false, status: 404, error: "upload_not_found" };
  }
  const upload = store.getUpload(uploadId);
  if (!upload) return { ok: false, status: 404, error: "upload_not_found" };
  if (!canAccessUpload(auth, upload)) return { ok: false, status: 404, error: "upload_not_found" };
  return { ok: true, upload };
}

function canAccessUpload(auth, upload) {
  if (!auth.apiKeyRecord) return true;
  return upload?.workspaceId && upload.workspaceId === auth.apiKeyRecord.workspaceId;
}

function authorizeWebhookAccess(auth, webhookId) {
  if (!auth.apiKeyRecord) {
    const webhook = store.getWebhook(webhookId);
    return webhook ? { ok: true, webhook } : { ok: false, status: 404, error: "webhook_not_found" };
  }
  const webhook = store.getWebhook(webhookId);
  if (!webhook) return { ok: false, status: 404, error: "webhook_not_found" };
  if (!canAccessWebhook(auth, webhook)) return { ok: false, status: 404, error: "webhook_not_found" };
  return { ok: true, webhook };
}

function canAccessWebhook(auth, webhook) {
  if (!auth.apiKeyRecord) return true;
  return webhook?.workspaceId && webhook.workspaceId === auth.apiKeyRecord.workspaceId;
}

function authorizeWebhookDeliveryAccess(auth, deliveryId) {
  if (!auth.apiKeyRecord) {
    const delivery = store.getWebhookDelivery(deliveryId);
    return delivery ? { ok: true, delivery } : { ok: false, status: 404, error: "delivery_not_found" };
  }
  const delivery = store.getWebhookDelivery(deliveryId);
  if (!delivery) return { ok: false, status: 404, error: "delivery_not_found" };
  if (!canAccessWebhookDelivery(auth, delivery)) return { ok: false, status: 404, error: "delivery_not_found" };
  return { ok: true, delivery };
}

function canAccessWebhookDelivery(auth, delivery) {
  if (!auth.apiKeyRecord) return true;
  return delivery?.workspaceId && delivery.workspaceId === auth.apiKeyRecord.workspaceId;
}

function filterUsageLedgerForAuth(entries, auth) {
  if (!auth.apiKeyRecord) return entries;
  return entries.filter((entry) => entry.workspaceId === auth.apiKeyRecord.workspaceId);
}

function workspaceFilterForAuth(auth, url) {
  if (auth.apiKeyRecord) return auth.apiKeyRecord.workspaceId;
  return url.searchParams.get("workspace_id") || url.searchParams.get("workspaceId");
}

async function maybeAlertOwnerForSpend(job) {
  if (!job?.jobId || !job.planId || !job.planPriceCents || !job.includedMinutes) return null;
  const ownerEmail = job.ownerEmail || process.env.UPLOADCHECK_OWNER_ALERT_EMAIL || process.env.RESEND_OWNER_ALERT_EMAIL || null;
  if (!ownerEmail) return null;
  const usage = store.summarizePlanUsage({
    planId: job.planId,
    workspaceId: job.workspaceId || null,
    includedMinutes: job.includedMinutes
  });
  if (!usage.includedMinutes || usage.minutesUsed <= usage.includedMinutes) return null;
  const overageMinutes = usage.minutesUsed - usage.includedMinutes;
  const cogsPerMinuteCents = Number(job.costSnapshot?.deterministicCogsCentsPerMinute ?? 0.0833);
  const overageCostCents = overageMinutes * cogsPerMinuteCents;
  const overageRateCentsPerMinute = overageRateForPlan(job.planId);
  const overageRevenueCents = overageMinutes * overageRateCentsPerMinute;
  const costEstimate = estimateCostForJob(job, job.minutesMetered || 0);
  const observedTotalCogsCents = Number(costEstimate.observedTotalCogsCents || costEstimate.estimatedCogsCents || 0);
  const shouldAlert = overageRevenueCents >= job.planPriceCents;
  if (!shouldAlert) return null;

  const alert = store.recordSpendAlert({
    type: "overage_spend_exceeded_subscription",
    workspaceId: job.workspaceId,
    ownerEmail,
    planId: job.planId,
    billingPeriod: usage.billingPeriod,
    minutesUsed: usage.minutesUsed,
    includedMinutes: usage.includedMinutes,
    planPriceCents: job.planPriceCents,
    observedTotalCogsCents,
    overageCostCents,
    overageRevenueCents,
    overageRateCentsPerMinute,
    status: "pending"
  });
  if (alert.idempotentReplay) return alert;

  const sent = await sendOwnerSpendAlert({ alert, job, usage });
  alert.status = sent.ok ? "sent" : "failed";
  alert.provider = sent.provider || "resend";
  alert.providerMessageId = sent.id || null;
  alert.error = sent.error || null;
  store.persist();
  return alert;
}

async function sendOwnerSpendAlert({ alert, job, usage }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.UPLOADCHECK_ALERT_FROM_EMAIL || process.env.RESEND_FROM_EMAIL || "UploadCheck <alerts@uploadcheck.app>";
  const resendApiUrl = process.env.UPLOADCHECK_RESEND_API_URL || process.env.RESEND_API_URL || "https://api.resend.com/emails";
  if (!apiKey) return { ok: false, provider: "resend", error: "RESEND_API_KEY missing" };
  try {
    const response = await fetch(resendApiUrl, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        from,
        to: [alert.ownerEmail],
        subject: `UploadCheck overage spend alert: ${alert.planId}`,
        text: [
          `Workspace ${alert.workspaceId || "default"} exceeded the overage spend threshold for ${alert.billingPeriod}.`,
          `Plan: ${alert.planId}`,
          `Included minutes: ${usage.includedMinutes}`,
          `Minutes used: ${usage.minutesUsed}`,
          `Plan price: ${(alert.planPriceCents / 100).toFixed(2)} USD`,
          `Billable extra-minute spend: ${(alert.overageRevenueCents / 100).toFixed(2)} USD`,
          `Overage rate: ${(alert.overageRateCentsPerMinute / 100).toFixed(2)} USD/min`,
          `Estimated overage COGS: ${(alert.overageCostCents / 100).toFixed(4)} USD`,
          `Observed total COGS: ${(alert.observedTotalCogsCents / 100).toFixed(4)} USD`,
          `Trigger job: ${job.jobId}`
        ].join("\n")
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return { ok: false, provider: "resend", error: JSON.stringify(payload).slice(0, 300) };
    return { ok: true, provider: "resend", id: payload.id || null };
  } catch (error) {
    return { ok: false, provider: "resend", error: error instanceof Error ? error.message : String(error) };
  }
}

function overageRateForPlan(planId) {
  const rates = {
    creator: 12,
    studio: 9,
    network: 6
  };
  return rates[String(planId || "").toLowerCase()] || 12;
}

function estimateRequestedMinutes(body = {}) {
  const explicit = Number(body.minutes_metered ?? body.minutesMetered ?? body.minutes);
  if (Number.isFinite(explicit) && explicit > 0) return Math.ceil(explicit);
  const durationSeconds = Number(body.duration_seconds ?? body.durationSeconds);
  if (Number.isFinite(durationSeconds) && durationSeconds > 0) return Math.ceil(durationSeconds / 60);
  return 0;
}

function stringOrNull(value) {
  const text = String(value || "").trim();
  return text ? text : null;
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function workspaceIdFromCheckout({ checkoutCustomerId, checkoutSubscriptionId, ownerEmail }) {
  const source = checkoutSubscriptionId || checkoutCustomerId || ownerEmail || "workspace";
  return `ws_${String(source).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 64) || "checkout"}`;
}

function capitalize(value) {
  const text = String(value || "");
  return text ? text[0].toUpperCase() + text.slice(1) : text;
}

function shouldQueueJob(body = {}) {
  return body.process_async === true || body.processAsync === true || body.async === true || process.env.UPLOADCHECK_DEFAULT_ASYNC_JOBS === "1";
}

function positiveNumberEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function requireScope(req, requiredScope) {
  return requireScopeFromHeaders(req.headers, requiredScope);
}

function requireScopeFromHeaders(headers, requiredScope) {
  const authorization = headers?.authorization;
  if (!apiKey && !apiKeyHash && !store.state.apiKeys?.length) return { ok: true };
  if (!authorization?.startsWith("Bearer ")) return { ok: false, status: 401, error: "missing_api_key" };
  const token = authorization.slice("Bearer ".length).trim();
  const validPlaintext = apiKey ? token === apiKey : false;
  const validHash = apiKeyHash ? createHash("sha256").update(token).digest("hex") === apiKeyHash : false;
  const storedKey = (!validPlaintext && !validHash) ? store.findApiKeyByToken(token) : null;
  if (!validPlaintext && !validHash && !storedKey) return { ok: false, status: 401, error: "invalid_api_key" };
  const scopes = storedKey ? new Set(storedKey.scopes || []) : apiScopes;
  if (!scopes.has(requiredScope)) return { ok: false, status: 403, error: "insufficient_scope" };
  return { ok: true, apiKeyRecord: storedKey || null };
}
