import { extname, basename } from "node:path";
import { statSync, readFileSync, existsSync } from "node:fs";

const DEFAULT_API_BASE_URL = "https://qcgenie-api.onrender.com";
const DEFAULT_MAX_INLINE_MB = 128;

const CONTENT_TYPES = new Map([
  [".mp4", "video/mp4"],
  [".mov", "video/quicktime"],
  [".m4v", "video/x-m4v"],
  [".webm", "video/webm"],
  [".mp3", "audio/mpeg"],
  [".m4a", "audio/mp4"],
  [".wav", "audio/wav"],
  [".aac", "audio/aac"],
  [".ogg", "audio/ogg"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".png", "image/png"],
  [".webp", "image/webp"]
]);

export function buildJobRequest(target, options = {}) {
  if (!target) throw new Error("Usage: uploadcheck check <file-or-url>");

  const apiBaseUrl = trimTrailingSlash(options.apiBaseUrl || process.env.UPLOADCHECK_API_BASE_URL || DEFAULT_API_BASE_URL);
  const maxInlineMb = Number(options.maxInlineMb || process.env.UPLOADCHECK_INLINE_MEDIA_MAX_MB || DEFAULT_MAX_INLINE_MB);
  const payload = {};

  if (isHttpUrl(target)) {
    if (isYouTubeUrl(target)) {
      payload.youtube_url = target;
    } else {
      payload.signed_url = target;
    }
  } else {
    if (!existsSync(target)) throw new Error(`File not found: ${target}`);
    const fileStat = statSync(target);
    const maxBytes = maxInlineMb * 1024 * 1024;
    const uploadMode = options.uploadMode || "auto";
    if (uploadMode === "signed" || (uploadMode === "auto" && fileStat.size > maxBytes)) {
      return buildSignedUploadPlan(target, options, fileStat);
    }
    if (uploadMode === "inline" && fileStat.size > maxBytes) {
      throw new Error(`File is ${formatMb(fileStat.size)} MB; inline CLI payload limit is ${maxInlineMb} MB. Use a signed URL or raise --max-inline-mb.`);
    }
    const contentType = inferContentType(target);
    const mediaKind = inferMediaKind(contentType);
    payload.media_base64 = readFileSync(target).toString("base64");
    payload.media_content_type = contentType;
    payload.media_kind = mediaKind;
    payload.filename = basename(target);
  }

  if (options.checks) payload.checks = options.checks;
  attachManifest(payload, options);
  attachTranscript(payload, options);
  attachWatchlist(payload, options);
  attachExpectedScript(payload, options);
  if (options.callbackUrl) payload.callback_url = options.callbackUrl;
  if (options.idempotencyKey) payload.idempotency_key = options.idempotencyKey;
  attachCostOptions(payload, options);

  return {
    apiBaseUrl,
    path: "/v1/qc/jobs",
    method: "POST",
    kind: "job",
    payload
  };
}

export function buildSignedUploadPlan(target, options = {}, fileStat = null) {
  if (!existsSync(target)) throw new Error(`File not found: ${target}`);
  const stat = fileStat || statSync(target);
  const apiBaseUrl = trimTrailingSlash(options.apiBaseUrl || process.env.UPLOADCHECK_API_BASE_URL || DEFAULT_API_BASE_URL);
  const contentType = inferContentType(target);
  const jobPayload = {};
  if (options.checks) jobPayload.checks = options.checks;
  attachManifest(jobPayload, options);
  attachTranscript(jobPayload, options);
  attachWatchlist(jobPayload, options);
  attachExpectedScript(jobPayload, options);
  if (options.callbackUrl) jobPayload.callback_url = options.callbackUrl;
  if (options.idempotencyKey) jobPayload.idempotency_key = options.idempotencyKey;
  attachCostOptions(jobPayload, options);

  return {
    apiBaseUrl,
    kind: "signed_upload",
    filePath: target,
    contentType,
    sizeBytes: stat.size,
    createUpload: {
      path: "/v1/uploads",
      method: "POST",
      payload: {
        filename: basename(target),
        content_type: contentType,
        size_bytes: stat.size
      }
    },
    createJob: {
      path: "/v1/qc/jobs",
      method: "POST",
      payload: jobPayload
    }
  };
}

export function parseArgs(argv) {
  const args = [...argv];
  const command = args.shift();
  if (!["check", "estimate", "usage"].includes(command)) throw new Error("Usage: uploadcheck check <file-or-url> | uploadcheck estimate --minutes N | uploadcheck usage");

  const target = command === "check" ? args.shift() : null;
  const options = { json: false };

  while (args.length) {
    const arg = args.shift();
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--api-base") {
      options.apiBaseUrl = requireValue(arg, args.shift());
    } else if (arg === "--api-key") {
      options.apiKey = requireValue(arg, args.shift());
    } else if (arg === "--checks") {
      options.checks = requireValue(arg, args.shift());
    } else if (arg === "--manifest") {
      options.manifestPath = requireValue(arg, args.shift());
    } else if (arg === "--transcript") {
      options.transcriptPath = requireValue(arg, args.shift());
    } else if (arg === "--watchlist") {
      options.watchlistPath = requireValue(arg, args.shift());
    } else if (arg === "--expected-script") {
      options.expectedScriptPath = requireValue(arg, args.shift());
    } else if (arg === "--callback-url") {
      options.callbackUrl = requireValue(arg, args.shift());
    } else if (arg === "--idempotency-key") {
      options.idempotencyKey = requireValue(arg, args.shift());
    } else if (arg === "--plan") {
      options.planId = requireValue(arg, args.shift());
    } else if (arg === "--plan-price-cents") {
      options.planPriceCents = requireValue(arg, args.shift());
    } else if (arg === "--included-minutes") {
      options.includedMinutes = requireValue(arg, args.shift());
    } else if (arg === "--ai-review-seconds") {
      options.aiReviewSeconds = requireValue(arg, args.shift());
    } else if (arg === "--cost-guardrail") {
      const mode = requireValue(arg, args.shift());
      if (!["downgrade", "block", "off"].includes(mode)) throw new Error("--cost-guardrail must be downgrade, block, or off");
      options.costGuardrail = mode;
    } else if (arg === "--minutes") {
      options.minutes = requireValue(arg, args.shift());
    } else if (arg === "--duration-seconds") {
      options.durationSeconds = requireValue(arg, args.shift());
    } else if (arg === "--billing-period") {
      options.billingPeriod = requireValue(arg, args.shift());
    } else if (arg === "--limit") {
      options.limit = requireValue(arg, args.shift());
    } else if (arg === "--max-inline-mb") {
      options.maxInlineMb = requireValue(arg, args.shift());
    } else if (arg === "--upload-mode") {
      const mode = requireValue(arg, args.shift());
      if (!["auto", "inline", "signed"].includes(mode)) throw new Error("--upload-mode must be auto, inline, or signed");
      options.uploadMode = mode;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return { command, target, options };
}

export function buildUsageRequest(options = {}) {
  const apiBaseUrl = trimTrailingSlash(options.apiBaseUrl || process.env.UPLOADCHECK_API_BASE_URL || DEFAULT_API_BASE_URL);
  const params = new URLSearchParams();
  if (options.billingPeriod) params.set("billing_period", options.billingPeriod);
  if (options.limit) params.set("limit", Number(options.limit));
  const query = params.toString();
  return {
    apiBaseUrl,
    path: `/v1/usage/margins${query ? `?${query}` : ""}`,
    method: "GET",
    kind: "usage"
  };
}

export function buildEstimateRequest(options = {}) {
  const apiBaseUrl = trimTrailingSlash(options.apiBaseUrl || process.env.UPLOADCHECK_API_BASE_URL || DEFAULT_API_BASE_URL);
  const payload = {};
  if (options.checks) payload.checks = options.checks;
  if (options.minutes) payload.minutes = Number(options.minutes);
  if (options.durationSeconds) payload.duration_seconds = Number(options.durationSeconds);
  attachCostOptions(payload, options);
  return {
    apiBaseUrl,
    path: "/v1/qc/estimate",
    method: "POST",
    kind: "estimate",
    payload
  };
}

export function formatJobSummary(payload) {
  const status = payload.status || "unknown";
  const verdict = payload.verdict || "pending";
  const minutes = payload.minutesMetered ?? 0;
  const ingressSuffix = formatMediaIngress(payload.mediaIngress);
  const cost = payload.costEstimate?.estimatedCogsUsd ?? (
    payload.costEstimate?.estimatedCogsCents == null ? null : payload.costEstimate.estimatedCogsCents / 100
  );
  const observed = payload.costEstimate?.observedTotalCogsCents;
  const observedSuffix = observed == null ? "" : ` | observed COGS $${(Number(observed) / 100).toFixed(4)}`;
  const suffix = cost == null ? observedSuffix : ` | est. COGS $${Number(cost).toFixed(4)}${observedSuffix}`;
  return `UploadCheck job ${payload.jobId || payload.id || "(unknown)"}: ${status} / ${verdict} | ${minutes} min${ingressSuffix}${suffix}`;
}

export function formatUsageSummary(payload) {
  const summary = payload.summary || {};
  const minutes = Number(summary.minutes || 0);
  const cogs = Number(summary.estimatedCogsCents || 0) / 100;
  const costPerMinuteCents = Number(summary.estimatedCostPerMinuteCents || 0);
  const grossMarginPct = Number(summary.estimatedGrossMarginPct || 0);
  const status = summary.marginSafe === false ? "MARGIN RISK" : "MARGIN SAFE";
  const observed = summary.observedProviderUsageEntries > 0
    ? ` | observed cost/min ${Number(summary.observedCostPerMinuteCents || 0).toFixed(4)}c | observed margin ${Number(summary.observedGrossMarginPct || 0).toFixed(2)}%`
    : "";
  return `UploadCheck usage: ${status} | ${minutes} min | est. COGS $${cogs.toFixed(4)} | cost/min ${costPerMinuteCents.toFixed(4)}c | margin ${grossMarginPct.toFixed(2)}%${observed}`;
}

function requireValue(flag, value) {
  if (!value) throw new Error(`${flag} requires a value`);
  return value;
}

function trimTrailingSlash(value) {
  return value.replace(/\/+$/, "");
}

function isHttpUrl(value) {
  return /^https?:\/\//i.test(value);
}

function isYouTubeUrl(value) {
  return /(^https?:\/\/)?([^/]+\.)?(youtube\.com|youtu\.be)\//i.test(value);
}

export function inferContentType(filePath) {
  const ext = extname(filePath).toLowerCase();
  return CONTENT_TYPES.get(ext) || "application/octet-stream";
}

function inferMediaKind(contentType) {
  if (contentType.startsWith("audio/")) return "audio";
  if (contentType.startsWith("image/")) return "image";
  return "video";
}

function attachManifest(payload, options) {
  if (!options.manifestPath) return;
  if (!existsSync(options.manifestPath)) throw new Error(`Manifest not found: ${options.manifestPath}`);
  const text = readFileSync(options.manifestPath, "utf8");
  payload.manifest_json = JSON.parse(text);
  payload.manifest_filename = basename(options.manifestPath);
}

function attachTranscript(payload, options) {
  if (!options.transcriptPath) return;
  if (!existsSync(options.transcriptPath)) throw new Error(`Transcript not found: ${options.transcriptPath}`);
  const text = readFileSync(options.transcriptPath, "utf8");
  if (options.transcriptPath.toLowerCase().endsWith(".json")) {
    payload.transcript_json = JSON.parse(text);
  } else {
    payload.transcript_text = text;
  }
  payload.transcript_filename = basename(options.transcriptPath);
}

function attachWatchlist(payload, options) {
  if (!options.watchlistPath) return;
  if (!existsSync(options.watchlistPath)) throw new Error(`Watchlist not found: ${options.watchlistPath}`);
  const text = readFileSync(options.watchlistPath, "utf8");
  payload.watchlist_json = JSON.parse(text);
  payload.watchlist_filename = basename(options.watchlistPath);
}

function attachExpectedScript(payload, options) {
  if (!options.expectedScriptPath) return;
  if (!existsSync(options.expectedScriptPath)) throw new Error(`Expected script not found: ${options.expectedScriptPath}`);
  const text = readFileSync(options.expectedScriptPath, "utf8");
  if (options.expectedScriptPath.toLowerCase().endsWith(".json")) {
    payload.expected_script_json = JSON.parse(text);
  } else {
    payload.expected_script_text = text;
  }
  payload.expected_script_filename = basename(options.expectedScriptPath);
}

function attachCostOptions(payload, options) {
  if (options.planId) payload.plan_id = options.planId;
  if (options.planPriceCents) payload.plan_price_cents = Number(options.planPriceCents);
  if (options.includedMinutes) payload.included_minutes = Number(options.includedMinutes);
  if (options.aiReviewSeconds) payload.ai_review_seconds = Number(options.aiReviewSeconds);
  if (options.costGuardrail) payload.cost_guardrail = options.costGuardrail;
}

function formatMediaIngress(mediaIngress) {
  if (!mediaIngress?.mode) return "";
  const detail = [mediaIngress.mode, mediaIngress.contentType, formatBytes(mediaIngress.bytes)].filter(Boolean).join(" ");
  return detail ? ` | media ${detail}` : "";
}

function formatBytes(bytes) {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value <= 0) return "";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(value < 10 * 1024 ? 1 : 0)} KB`;
  return `${(value / 1024 / 1024).toFixed(value < 10 * 1024 * 1024 ? 2 : 1)} MB`;
}

function formatMb(bytes) {
  return (bytes / 1024 / 1024).toFixed(1);
}
