import { createReadStream, existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { createServer } from "node:http";

const port = Number(process.env.PORT || 10000);
const distDir = resolve("dist");
const jobs = new Map();

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
    if (req.method === "POST" && url.pathname === "/v1/qc/jobs") return createJob(req, res);
    if (req.method === "GET" && /^\/v1\/qc\/jobs\/[^/]+$/.test(url.pathname)) return getJob(url, res);
    if (req.method === "GET" && /^\/v1\/qc\/jobs\/[^/]+\/report$/.test(url.pathname)) return getReport(url, res);
    if (req.method === "POST" && /^\/v1\/qc\/jobs\/[^/]+\/cancel$/.test(url.pathname)) return cancelJob(url, res);
    if (req.method === "POST" && url.pathname === "/v1/uploads") return createUpload(req, res);
    if (req.method === "GET" && url.pathname === "/v1/qc/jobs") return listJobs(res);

    return serveStatic(url.pathname, res);
  } catch (error) {
    return sendJson(res, 500, { error: "internal_error", message: error instanceof Error ? error.message : "Unknown error" });
  }
}).listen(port, () => {
  console.log(`QC Genie web service listening on ${port}`);
});

async function createJob(req, res) {
  const body = await readJson(req);
  const jobId = `job_${Math.random().toString(36).slice(2, 10)}`;
  const job = {
    jobId,
    status: "queued",
    progressPct: 0,
    verdict: null,
    minutesMetered: 0,
    source: body.youtube_url || body.source || body.signed_url || body.upload_id || null,
    sourceType: body.youtube_url ? "youtube" : body.upload_id ? "upload" : "signed_url",
    statusUrl: `/v1/qc/jobs/${jobId}`,
    reportUrl: `/v1/qc/jobs/${jobId}/report`
  };
  jobs.set(jobId, job);
  return sendJson(res, 202, job);
}

function getJob(url, res) {
  const jobId = url.pathname.split("/").at(-1);
  return sendJson(res, 200, jobs.get(jobId) || completedJob(jobId));
}

function getReport(url, res) {
  const jobId = url.pathname.split("/").at(-2);
  return sendJson(res, 200, {
    jobId,
    verdict: "WATCH",
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

function cancelJob(url, res) {
  const jobId = url.pathname.split("/").at(-2);
  const job = jobs.get(jobId) || completedJob(jobId);
  job.status = "cancelled";
  jobs.set(jobId, job);
  return sendJson(res, 200, job);
}

async function createUpload(req, res) {
  const body = await readJson(req);
  const uploadId = `upl_${Math.random().toString(36).slice(2, 10)}`;
  return sendJson(res, 201, {
    uploadId,
    signedPutUrl: `https://uploads.qcgenie.com/${uploadId}/${encodeURIComponent(body.filename || "upload.mp4")}`,
    expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString()
  });
}

function listJobs(res) {
  return sendJson(res, 200, { jobs: Array.from(jobs.values()).slice(-20) });
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
