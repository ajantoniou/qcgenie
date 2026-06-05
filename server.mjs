import { createReadStream, existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { JsonStore } from "./server-store.mjs";

const port = Number(process.env.PORT || 10000);
const distDir = resolve("dist");
const store = new JsonStore(process.env.QCGENIE_STORE_PATH || "/tmp/qcgenie/store.json");
const apiKey = process.env.QCGENIE_API_KEY;
const apiKeyHash = process.env.QCGENIE_API_KEY_SHA256;
const apiScopes = new Set((process.env.QCGENIE_API_SCOPES || "jobs:write,jobs:read,reports:read,uploads:write,webhooks:write").split(","));

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

    if (url.pathname === "/healthz") return sendJson(res, 200, { ok: true, service: "qcgenie" });
    if (req.method === "GET" && url.pathname === "/openapi.json") return serveStatic("/openapi.json", res);
    if (req.method === "POST" && url.pathname === "/v1/qc/jobs") return createJob(req, res);
    if (req.method === "GET" && /^\/v1\/qc\/jobs\/[^/]+$/.test(url.pathname)) return getJob(req, url, res);
    if (req.method === "GET" && /^\/v1\/qc\/jobs\/[^/]+\/report$/.test(url.pathname)) return getReport(req, url, res);
    if (req.method === "POST" && /^\/v1\/qc\/jobs\/[^/]+\/cancel$/.test(url.pathname)) return cancelJob(req, url, res);
    if (req.method === "POST" && url.pathname === "/v1/uploads") return createUpload(req, res);
    if (req.method === "GET" && /^\/v1\/uploads\/[^/]+$/.test(url.pathname)) return getUpload(req, url, res);
    if (req.method === "GET" && url.pathname === "/v1/qc/jobs") return listJobs(req, res);
    if (req.method === "GET" && url.pathname === "/v1/usage") return getUsage(req, res);
    if (req.method === "POST" && url.pathname === "/v1/webhooks") return createWebhook(req, res);
    if (req.method === "GET" && /^\/v1\/webhooks\/[^/]+\/delivery-preview$/.test(url.pathname)) return previewWebhookDelivery(req, url, res);

    return serveStatic(url.pathname, res);
  } catch (error) {
    return sendJson(res, 500, { error: "internal_error", message: error instanceof Error ? error.message : "Unknown error" });
  }
}).listen(port, () => {
  console.log(`QC Genie web service listening on ${port}`);
});

async function createJob(req, res) {
  const auth = requireScope(req, "jobs:write");
  if (!auth.ok) return sendJson(res, auth.status, { error: auth.error });
  const body = await readJson(req);
  const job = store.createJob(body);
  return sendJson(res, 202, job);
}

function getJob(req, url, res) {
  const auth = requireScope(req, "jobs:read");
  if (!auth.ok) return sendJson(res, auth.status, { error: auth.error });
  const jobId = url.pathname.split("/").at(-1);
  return sendJson(res, 200, store.getJob(jobId) || completedJob(jobId));
}

function getReport(req, url, res) {
  const auth = requireScope(req, "reports:read");
  if (!auth.ok) return sendJson(res, auth.status, { error: auth.error });
  const jobId = url.pathname.split("/").at(-2);
  const job = store.getJob(jobId) || completedJob(jobId);
  const roundedMinutes = Math.max(1, Math.ceil(job.minutesMetered || 19));
  const usage = store.appendUsage(jobId, roundedMinutes);
  return sendJson(res, 200, {
    jobId,
    verdict: "WATCH",
    usage,
    flags: [
      {
        timestamp: "00:09:12",
        severity: "warn",
        summary: "Caption sits near the Shorts UI safe area.",
        evidenceSource: "transcript",
        transcriptEvidence: "the payment failed twice"
      }
    ],
    artifacts: [
      { type: "json_report", url: `/v1/qc/jobs/${jobId}/report` },
      { type: "marker_export", url: `/v1/qc/jobs/${jobId}/artifacts/markers` }
    ]
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
  return sendJson(res, 201, store.createUpload(body));
}

function getUpload(req, url, res) {
  const auth = requireScope(req, "uploads:write");
  if (!auth.ok) return sendJson(res, auth.status, { error: auth.error });
  const uploadId = url.pathname.split("/").at(-1);
  const upload = store.getUpload(uploadId);
  if (!upload) return sendJson(res, 404, { error: "upload_not_found" });
  return sendJson(res, 200, upload);
}

function listJobs(req, res) {
  const auth = requireScope(req, "jobs:read");
  if (!auth.ok) return sendJson(res, auth.status, { error: auth.error });
  return sendJson(res, 200, { jobs: store.listJobs(20) });
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
