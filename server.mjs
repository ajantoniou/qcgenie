import { createReadStream, createWriteStream, existsSync, mkdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { JsonStore } from "./server-store.mjs";
import { cleanupInlineMedia, materializeInlineMedia } from "./inline-media.mjs";
import { estimateJobCost } from "./cost-model.mjs";

const port = Number(process.env.PORT || 10000);
const distDir = resolve("dist");
const uploadDir = process.env.UPLOADCHECK_UPLOAD_DIR || process.env.QCGENIE_UPLOAD_DIR || "/tmp/uploadcheck/uploads";
const store = new JsonStore(process.env.UPLOADCHECK_STORE_PATH || process.env.QCGENIE_STORE_PATH || "/tmp/uploadcheck/store.json", {
  secretEncryptionKey: process.env.UPLOADCHECK_SECRET_ENCRYPTION_KEY || process.env.QCGENIE_SECRET_ENCRYPTION_KEY
});
const apiKey = process.env.UPLOADCHECK_API_KEY || process.env.QCGENIE_API_KEY;
const apiKeyHash = process.env.UPLOADCHECK_API_KEY_SHA256 || process.env.QCGENIE_API_KEY_SHA256;
const apiScopes = new Set((process.env.UPLOADCHECK_API_SCOPES || process.env.QCGENIE_API_SCOPES || "jobs:write,jobs:read,reports:read,uploads:write,webhooks:write").split(","));

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml"
};

createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);

    if (url.pathname === "/healthz") return sendJson(res, 200, { ok: true, service: "uploadcheck" });
    if (req.method === "GET" && url.pathname === "/openapi.json") return serveStatic("/openapi.json", res);
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

async function createJob(req, res) {
  const auth = requireScope(req, "jobs:write");
  if (!auth.ok) return sendJson(res, auth.status, { error: auth.error });
  const body = await readJson(req);
  const inlineMedia = await materializeInlineMedia(body);
  try {
    if (inlineMedia) {
      body.source = inlineMedia.filePath;
      body.source_type = "upload";
      body.inline_media = {
        content_type: inlineMedia.contentType,
        bytes: inlineMedia.bytes,
        ephemeral: true
      };
    }
    const job = store.createJob(body);
    if (job.idempotentReplay) return sendJson(res, 200, withCostEstimate(job));
    const completed = store.runDeterministicQc(job.jobId, { checks: body.checks || inlineMedia?.checks });
    store.createWebhookDeliveriesForJob(job.jobId, "job.completed");
    return sendJson(res, 202, withCostEstimate(completed || job));
  } finally {
    await cleanupInlineMedia(inlineMedia);
  }
}

function getJob(req, url, res) {
  const auth = requireScope(req, "jobs:read");
  if (!auth.ok) return sendJson(res, auth.status, { error: auth.error });
  const jobId = url.pathname.split("/").at(-1);
  return sendJson(res, 200, withCostEstimate(store.getJob(jobId) || completedJob(jobId)));
}

function getReport(req, url, res) {
  const auth = requireScope(req, "reports:read");
  if (!auth.ok) return sendJson(res, auth.status, { error: auth.error });
  const jobId = url.pathname.split("/").at(-2);
  const job = store.getJob(jobId) || completedJob(jobId);
  const roundedMinutes = Math.max(1, Math.ceil(job.minutesMetered || 19));
  const usage = store.appendUsage(jobId, roundedMinutes);
  const flags = store.listFlags(jobId);
  const artifacts = store.listArtifacts(jobId);
  return sendJson(res, 200, {
    jobId,
    verdict: job.verdict || "WATCH",
    usage,
    costEstimate: estimateJobCost({ minutesMetered: roundedMinutes }),
    flags: flags.length ? flags : [defaultFlag(jobId)],
    artifacts: artifacts.length ? artifacts : defaultArtifacts(jobId)
  });
}

function getJobEvents(req, url, res) {
  const auth = requireScope(req, "jobs:read");
  if (!auth.ok) return sendJson(res, auth.status, { error: auth.error });
  const jobId = url.pathname.split("/").at(-2);
  return sendJson(res, 200, { events: store.listJobEvents(jobId) });
}

function getJobArtifacts(req, url, res) {
  const auth = requireScope(req, "reports:read");
  if (!auth.ok) return sendJson(res, auth.status, { error: auth.error });
  const jobId = url.pathname.split("/").at(-2);
  const artifacts = store.listArtifacts(jobId);
  return sendJson(res, 200, { artifacts: artifacts.length ? artifacts : defaultArtifacts(jobId) });
}

function getMarkerExport(req, url, res) {
  const auth = requireScope(req, "reports:read");
  if (!auth.ok) return sendJson(res, auth.status, { error: auth.error });
  const jobId = url.pathname.split("/").at(-3);
  const csv = store.buildMarkerCsv(jobId);
  res.writeHead(200, {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="${jobId}-qc-markers.csv"`
  });
  res.end(csv);
}

async function ingestGateVerdict(req, url, res) {
  const auth = requireScope(req, "jobs:write");
  if (!auth.ok) return sendJson(res, auth.status, { error: auth.error });
  const jobId = url.pathname.split("/").at(-2);
  const body = await readJson(req);
  const result = store.ingestGateVerdict(jobId, body);
  if (!result) return sendJson(res, 404, { error: "job_not_found" });
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
  const job = store.cancelJob(jobId) || { ...completedJob(jobId), status: "cancelled" };
  return sendJson(res, 200, job);
}

async function createUpload(req, res) {
  const auth = requireScope(req, "uploads:write");
  if (!auth.ok) return sendJson(res, auth.status, { error: auth.error });
  const body = await readJson(req);
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

  mkdirSync(uploadDir, { recursive: true });
  const safeName = String(upload.filename || "upload.mp4").replace(/[^a-zA-Z0-9._-]+/g, "_");
  const contentPath = join(uploadDir, `${upload.uploadId}-${safeName}`);
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
  const stored = store.markUploadStored(uploadId, {
    contentPath,
    bytesReceived,
    sha256: hash.digest("hex")
  });
  return sendJson(res, 200, {
    uploadId,
    status: stored.status,
    bytesReceived: stored.bytesReceived,
    sha256: stored.sha256
  });
}

function getUpload(req, url, res) {
  const auth = requireScope(req, "uploads:write");
  if (!auth.ok) return sendJson(res, auth.status, { error: auth.error });
  const uploadId = url.pathname.split("/").at(-1);
  const upload = store.getUpload(uploadId);
  if (!upload) return sendJson(res, 404, { error: "upload_not_found" });
  return sendJson(res, 200, upload);
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
  });
}

function getUsage(req, res) {
  const auth = requireScope(req, "jobs:read");
  if (!auth.ok) return sendJson(res, auth.status, { error: auth.error });
  return sendJson(res, 200, { usageLedger: store.state.usageLedger.slice(-50).reverse() });
}

async function createWebhook(req, res) {
  const auth = requireScope(req, "webhooks:write");
  if (!auth.ok) return sendJson(res, auth.status, { error: auth.error });
  const body = await readJson(req);
  return sendJson(res, 201, store.createWebhook(body));
}

function previewWebhookDelivery(req, url, res) {
  const auth = requireScope(req, "webhooks:write");
  if (!auth.ok) return sendJson(res, auth.status, { error: auth.error });
  const webhookId = url.pathname.split("/").at(-2);
  if (!store.getWebhook(webhookId)) return sendJson(res, 404, { error: "webhook_not_found" });
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
      webhookId: url.searchParams.get("webhook_id")
    })
  });
}

async function retryWebhookDelivery(req, url, res) {
  const auth = requireScope(req, "webhooks:write");
  if (!auth.ok) return sendJson(res, auth.status, { error: auth.error });
  const deliveryId = url.pathname.split("/").at(-2);
  const delivery = store.getWebhookDelivery(deliveryId);
  if (!delivery) return sendJson(res, 404, { error: "delivery_not_found" });
  const result = await sendWebhookDelivery(delivery);
  return sendJson(res, 200, store.markWebhookDeliveryAttempt(deliveryId, result));
}

async function drainWebhookDeliveries(req, res) {
  const auth = requireScope(req, "webhooks:write");
  if (!auth.ok) return sendJson(res, auth.status, { error: auth.error });
  const body = await readJson(req);
  const deliveries = store.listDueWebhookDeliveries({ limit: body.limit || 10 });
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
        "x-qcgenie-delivery-id": delivery.deliveryId,
        "x-qcgenie-event": delivery.eventType
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
  const target = resolved.startsWith(distDir) && existsSync(resolved) ? resolved : join(distDir, "index.html");
  res.writeHead(200, { "Content-Type": mimeTypes[extname(target)] || "application/octet-stream" });
  createReadStream(target).pipe(res);
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(payload, null, 2));
}

function withCostEstimate(job) {
  if (!job) return job;
  return {
    ...job,
    costEstimate: estimateJobCost({ minutesMetered: job.minutesMetered || 0 })
  };
}

function requireScope(req, requiredScope) {
  return requireScopeFromHeaders(req.headers, requiredScope);
}

function requireScopeFromHeaders(headers, requiredScope) {
  if (!apiKey && !apiKeyHash) return { ok: true };
  const authorization = headers?.authorization;
  if (!authorization?.startsWith("Bearer ")) return { ok: false, status: 401, error: "missing_api_key" };
  const token = authorization.slice("Bearer ".length).trim();
  const validPlaintext = apiKey ? token === apiKey : false;
  const validHash = apiKeyHash ? createHash("sha256").update(token).digest("hex") === apiKeyHash : false;
  if (!validPlaintext && !validHash) return { ok: false, status: 401, error: "invalid_api_key" };
  if (!apiScopes.has(requiredScope)) return { ok: false, status: 403, error: "insufficient_scope" };
  return { ok: true };
}
