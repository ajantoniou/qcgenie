import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto";
import { runQcForJob } from "./qc-engine-runner.mjs";

export class JsonStore {
  constructor(filePath, options = {}) {
    this.filePath = filePath;
    this.secretEncryptionKey = options.secretEncryptionKey || process.env.UPLOADCHECK_SECRET_ENCRYPTION_KEY || process.env.QCGENIE_SECRET_ENCRYPTION_KEY || null;
    this.state = {
      jobs: [],
      uploads: [],
      webhooks: [],
      jobEvents: [],
      flags: [],
      artifacts: [],
      usageLedger: [],
      webhookDeliveries: []
    };
    this.load();
  }

  createJob(input) {
    if (input.idempotency_key || input.idempotencyKey) {
      const existing = this.findJobByIdempotencyKey(input.idempotency_key || input.idempotencyKey);
      if (existing) {
        this.addJobEvent(existing.jobId, "idempotent_replay", {
          idempotencyKey: existing.idempotencyKey,
          status: existing.status
        });
        this.persist();
        return { ...existing, idempotentReplay: true };
      }
    }

    const uploadId = input.upload_id || input.uploadId || null;
    const upload = uploadId ? this.getUpload(uploadId) : null;
    const sourceType = input.source_type || input.sourceType || (input.youtube_url ? "youtube" : uploadId ? "upload" : "signed_url");
    const mediaIngress = buildMediaIngress(input, upload);
    const jobId = `job_${randomId()}`;
    const now = new Date().toISOString();
    const job = {
      jobId,
      status: "queued",
      progressPct: 0,
      verdict: null,
      minutesMetered: 0,
      source: input.youtube_url || input.source || input.signed_url || upload?.contentPath || input.upload_id || null,
      sourceType,
      mediaIngress,
      uploadId,
      idempotencyKey: input.idempotency_key || null,
      callbackUrl: input.callback_url || null,
      planId: input.plan_id || input.planId || null,
      planPriceCents: numberOrNull(input.plan_price_cents ?? input.planPriceCents),
      includedMinutes: numberOrNull(input.included_minutes ?? input.includedMinutes),
      aiReviewSeconds: Math.max(0, Number(input.ai_review_seconds ?? input.aiReviewSeconds ?? 0) || 0),
      requestedAiReviewSeconds: Math.max(0, Number(input.requested_ai_review_seconds ?? input.requestedAiReviewSeconds ?? input.ai_review_seconds ?? input.aiReviewSeconds ?? 0) || 0),
      checks: input.checks || null,
      requestedChecks: input.requested_checks || input.requestedChecks || input.checks || null,
      removedChecks: input.removed_checks || input.removedChecks || "",
      costGuardrail: input.cost_guardrail || input.costGuardrail || "downgrade",
      costGuardrailAction: input.cost_guardrail_action || input.costGuardrailAction || "none",
      costGuardrailReason: input.cost_guardrail_reason || input.costGuardrailReason || null,
      statusUrl: `/v1/qc/jobs/${jobId}`,
      reportUrl: `/v1/qc/jobs/${jobId}/report`,
      createdAt: now,
      updatedAt: now
    };
    this.state.jobs.push(job);
    this.addJobEvent(jobId, "queued", { sourceType: job.sourceType, mediaIngress });
    this.persist();
    return job;
  }

  findJobByIdempotencyKey(idempotencyKey) {
    if (!idempotencyKey) return null;
    return this.state.jobs.find((job) => job.idempotencyKey === idempotencyKey) || null;
  }

  getJob(jobId) {
    return this.state.jobs.find((job) => job.jobId === jobId) || null;
  }

  listJobs(options = {}) {
    const limit = typeof options === "number" ? options : Number(options.limit || 20);
    const status = typeof options === "object" ? options.status : null;
    const sourceUrl = typeof options === "object" ? options.sourceUrl || options.source_url : null;
    return this.state.jobs
      .filter((job) => !status || job.status === status)
      .filter((job) => !sourceUrl || job.source === sourceUrl)
      .slice(-Math.min(Math.max(limit || 20, 1), 100))
      .reverse();
  }

  cancelJob(jobId) {
    const job = this.getJob(jobId);
    if (!job) return null;
    job.status = "cancelled";
    job.updatedAt = new Date().toISOString();
    this.persist();
    return job;
  }

  runDeterministicQc(jobId, opts = {}) {
    const job = this.getJob(jobId);
    if (!job) return null;

    const advance = (status, progressPct) => {
      job.status = status;
      job.progressPct = progressPct;
      job.updatedAt = new Date().toISOString();
      this.addJobEvent(jobId, status, { progressPct });
    };
    advance("ingesting", 15);
    advance("metadata_probe", 30);
    advance("deterministic_qc", 60);

    // Run the REAL QC engine (scripts/qc-engine/run_gate.py) against the resolved source.
    let engine;
    try {
      engine = runQcForJob(job, opts);
    } catch (e) {
      engine = { ranEngine: false, error: String(e && e.message || e) };
    }

    if (engine && engine.ranEngine && engine.verdict) {
      advance("agent_review", 88);
      advance("reporting", 96);
      if (engine.durationS) job.minutesMetered = Math.ceil(engine.durationS / 60);
      // ingestGateVerdict converts VERDICT.json -> job verdict + flags + artifact.
      this.ingestGateVerdict(jobId, engine.verdict);
      this.addJobEvent(jobId, "qc_engine_ran", {
        verdict: engine.verdict.verdict,
        blocked: engine.verdict.blocked || [],
        skipped: engine.verdict.skipped || []
      });
      this.addArtifact(jobId, {
        artifactType: "marker_export",
        url: `/v1/qc/jobs/${jobId}/artifacts/markers`,
        metadata: { format: "premiere_csv" }
      });
      this.persist();
      return this.getJob(jobId);
    }

    // FALLBACK: engine could not run (e.g. no yt-dlp / unresolvable source). Mark needs-review
    // honestly instead of faking a pass.
    advance("reporting", 96);
    job.status = "completed";
    job.progressPct = 100;
    job.verdict = "WATCH";
    job.gateVerdict = "NEEDS_REVIEW";
    job.completedAt = new Date().toISOString();
    job.updatedAt = job.completedAt;
    this.addFlag(jobId, {
      gate: "engine",
      severity: "warn",
      timestamp: "00:00:00",
      summary: "QC engine could not run on this source; manual review required.",
      evidenceSource: "engine",
      transcriptEvidence: (engine && engine.error) ? String(engine.error).slice(0, 200) : ""
    });
    this.addArtifact(jobId, {
      artifactType: "json_report",
      url: `/v1/qc/jobs/${jobId}/report`,
      metadata: { format: "json", engine: "fallback" }
    });
    this.addJobEvent(jobId, "completed", { verdict: job.verdict, engine: "fallback", error: engine && engine.error });
    this.persist();
    return job;
  }

  ingestGateVerdict(jobId, verdictPayload) {
    const job = this.getJob(jobId);
    if (!job) return null;

    const blockedChecks = verdictPayload.blocked || [];
    const skippedChecks = verdictPayload.skipped || [];
    const importedVerdict = verdictPayload.verdict === "BLOCK" || blockedChecks.length ? "BLOCK" : "PASS";

    job.status = "completed";
    job.progressPct = 100;
    job.verdict = importedVerdict;
    job.gateVerdict = verdictPayload.verdict || importedVerdict;
    job.providerUsage = normalizeProviderUsage(verdictPayload);
    job.completedAt = new Date().toISOString();
    job.updatedAt = job.completedAt;

    this.addJobEvent(jobId, "gate_verdict_ingested", {
      verdict: job.verdict,
      blocked: blockedChecks,
      skipped: skippedChecks,
      providerUsageEntries: job.providerUsage.length
    });

    const importedFlags = buildFlagsFromGateVerdict(jobId, verdictPayload);
    for (const flag of importedFlags) this.addFlag(jobId, flag);

    this.addArtifact(jobId, {
      artifactType: "gate_verdict",
      url: `/v1/qc/jobs/${jobId}/report`,
      metadata: {
        format: "json",
        source: "qc_engine",
        blocked: blockedChecks,
        skipped: skippedChecks,
        providerUsageEntries: job.providerUsage.length
      }
    });

    this.persist();
    return {
      job,
      importedFlags,
      blocked: blockedChecks,
      skipped: skippedChecks
    };
  }

  addJobEvent(jobId, eventType, payload = {}) {
    const event = {
      eventId: `evt_${randomId()}`,
      jobId,
      eventType,
      payload,
      createdAt: new Date().toISOString()
    };
    this.state.jobEvents.push(event);
    return event;
  }

  listJobEvents(jobId) {
    return this.state.jobEvents.filter((event) => event.jobId === jobId);
  }

  addFlag(jobId, input) {
    const flag = {
      flagId: `flg_${randomId()}`,
      jobId,
      ...input,
      createdAt: new Date().toISOString()
    };
    this.state.flags.push(flag);
    return flag;
  }

  listFlags(jobId) {
    return this.state.flags.filter((flag) => flag.jobId === jobId);
  }

  addArtifact(jobId, input) {
    const artifact = {
      artifactId: `art_${randomId()}`,
      jobId,
      ...input,
      createdAt: new Date().toISOString()
    };
    this.state.artifacts.push(artifact);
    return artifact;
  }

  listArtifacts(jobId) {
    return this.state.artifacts.filter((artifact) => artifact.jobId === jobId);
  }

  buildMarkerCsv(jobId) {
    const flags = this.listFlags(jobId);
    const rows = [
      ["timecode", "severity", "gate", "summary", "evidence_source", "transcript_evidence"],
      ...flags.map((flag) => [
        flag.timestamp,
        flag.severity,
        flag.gate,
        flag.summary,
        flag.evidenceSource,
        flag.transcriptEvidence || ""
      ])
    ];
    return rows.map((row) => row.map(csvEscape).join(",")).join("\n") + "\n";
  }

  createUpload(input, options = {}) {
    const uploadId = `upl_${randomId()}`;
    const uploadToken = `upt_${randomBytes(18).toString("hex")}`;
    const filename = input.filename || "upload.mp4";
    const baseUrl = (options.baseUrl || "https://qcgenie-api.onrender.com").replace(/\/+$/, "");
    const upload = {
      uploadId,
      filename,
      contentType: input.content_type || input.contentType || "application/octet-stream",
      sizeBytes: input.size_bytes || input.sizeBytes || 0,
      status: "created",
      uploadToken,
      signedPutUrl: `${baseUrl}/v1/uploads/${uploadId}/content?token=${encodeURIComponent(uploadToken)}`,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      createdAt: new Date().toISOString()
    };
    this.state.uploads.push(upload);
    this.persist();
    return upload;
  }

  getUpload(uploadId) {
    return this.state.uploads.find((upload) => upload.uploadId === uploadId) || null;
  }

  markUploadStored(uploadId, input) {
    const upload = this.getUpload(uploadId);
    if (!upload) return null;
    upload.status = "uploaded";
    upload.contentPath = input.contentPath;
    upload.storageMode = input.storageMode || upload.storageMode || "render_temp_storage";
    upload.objectKey = input.objectKey || upload.objectKey || null;
    upload.objectUrl = input.objectUrl || upload.objectUrl || null;
    upload.bytesReceived = input.bytesReceived;
    upload.sha256 = input.sha256;
    upload.uploadedAt = new Date().toISOString();
    this.persist();
    return upload;
  }

  createWebhook(input) {
    const webhookId = `wh_${randomId()}`;
    const signingSecret = `whsec_${randomBytes(24).toString("hex")}`;
    const encryptedSigningSecret = this.secretEncryptionKey ? encryptSecret(signingSecret, this.secretEncryptionKey) : null;
    const endpoint = {
      webhookId,
      url: input.url,
      eventTypes: input.event_types || input.eventTypes || ["job.completed", "job.failed"],
      signingSecret: encryptedSigningSecret ? undefined : signingSecret,
      encryptedSigningSecret,
      signingSecretPreview: `${signingSecret.slice(0, 14)}...`,
      signingSecretStorage: encryptedSigningSecret ? "encrypted" : "plaintext",
      createdAt: new Date().toISOString()
    };
    this.state.webhooks.push(endpoint);
    this.persist();
    return { ...endpoint, signingSecret };
  }

  getWebhook(webhookId) {
    return this.state.webhooks.find((webhook) => webhook.webhookId === webhookId) || null;
  }

  createWebhookDelivery(webhookId, eventType, jobId) {
    const endpoint = this.getWebhook(webhookId);
    if (!endpoint) throw new Error(`Unknown webhook endpoint: ${webhookId}`);
    const existing = this.state.webhookDeliveries.find((delivery) =>
      delivery.webhookId === webhookId && delivery.eventType === eventType && delivery.jobId === jobId
    );
    if (existing) return { ...existing, idempotentReplay: true };

    const payload = {
      event: eventType,
      job_id: jobId,
      created_at: new Date().toISOString()
    };
    const encodedPayload = JSON.stringify(payload);
    const signingSecret = this.getWebhookSigningSecret(endpoint);
    const delivery = {
      deliveryId: `whd_${randomId()}`,
      webhookId,
      eventType,
      jobId,
      status: "pending",
      url: endpoint.url,
      attemptCount: 0,
      nextAttemptAt: new Date().toISOString(),
      signatureHeader: "X-UploadCheck-Signature",
      legacySignatureHeader: "X-QCGenie-Signature",
      signature: signPayload(signingSecret, encodedPayload),
      payload,
      createdAt: new Date().toISOString()
    };
    this.state.webhookDeliveries.push(delivery);
    this.persist();
    return delivery;
  }

  getWebhookSigningSecret(endpoint) {
    if (endpoint.encryptedSigningSecret) {
      if (!this.secretEncryptionKey) throw new Error("UPLOADCHECK_SECRET_ENCRYPTION_KEY is required to decrypt webhook signing secrets.");
      return decryptSecret(endpoint.encryptedSigningSecret, this.secretEncryptionKey);
    }
    if (endpoint.signingSecret) return endpoint.signingSecret;
    throw new Error(`Webhook endpoint ${endpoint.webhookId} is missing a signing secret.`);
  }

  createWebhookDeliveriesForJob(jobId, eventType = "job.completed") {
    const endpoints = this.state.webhooks.filter((endpoint) => endpoint.eventTypes.includes(eventType));
    return endpoints.map((endpoint) => this.createWebhookDelivery(endpoint.webhookId, eventType, jobId));
  }

  getWebhookDelivery(deliveryId) {
    return this.state.webhookDeliveries.find((delivery) => delivery.deliveryId === deliveryId) || null;
  }

  listWebhookDeliveries(options = {}) {
    const limit = Number(options.limit || 20);
    const status = options.status || null;
    const webhookId = options.webhookId || options.webhook_id || null;
    return this.state.webhookDeliveries
      .filter((delivery) => !status || delivery.status === status)
      .filter((delivery) => !webhookId || delivery.webhookId === webhookId)
      .slice(-Math.min(Math.max(limit || 20, 1), 100))
      .reverse();
  }

  listDueWebhookDeliveries(options = {}) {
    const limit = Number(options.limit || 10);
    const nowMs = options.now ? new Date(options.now).getTime() : Date.now();
    return this.state.webhookDeliveries
      .filter((delivery) => delivery.status === "pending")
      .filter((delivery) => !delivery.nextAttemptAt || new Date(delivery.nextAttemptAt).getTime() <= nowMs)
      .sort((a, b) => new Date(a.nextAttemptAt || a.createdAt).getTime() - new Date(b.nextAttemptAt || b.createdAt).getTime())
      .slice(0, Math.min(Math.max(limit || 10, 1), 25));
  }

  markWebhookDeliveryAttempt(deliveryId, result) {
    const delivery = this.getWebhookDelivery(deliveryId);
    if (!delivery) return null;

    delivery.attemptCount = (delivery.attemptCount || 0) + 1;
    delivery.lastAttemptAt = new Date().toISOString();
    delivery.responseStatus = result.responseStatus || null;

    if (result.ok) {
      delivery.status = "sent";
      delivery.sentAt = delivery.lastAttemptAt;
      delivery.lastError = null;
      delivery.nextAttemptAt = null;
    } else {
      delivery.lastError = result.error || `HTTP ${result.responseStatus || "unknown"}`;
      if (delivery.attemptCount >= 3) {
        delivery.status = "failed";
        delivery.nextAttemptAt = null;
      } else {
        delivery.status = "pending";
        delivery.nextAttemptAt = new Date(Date.now() + retryDelayMs(delivery.attemptCount)).toISOString();
      }
    }

    this.persist();
    return delivery;
  }

  appendUsage(jobId, roundedMinutes, billingPeriod = currentBillingPeriod(), costSnapshot = null) {
    const period = billingPeriod || currentBillingPeriod();
    const existing = this.state.usageLedger.find((entry) => entry.jobId === jobId && entry.billingPeriod === period);
    if (existing) {
      existing.idempotentReplay = true;
      return existing;
    }
    const job = this.getJob(jobId);
    const entry = {
      usageId: `use_${randomId()}`,
      jobId,
      roundedMinutes,
      billingPeriod: period,
      planId: job?.planId || costSnapshot?.planId || null,
      includedMinutes: numberOrNull(job?.includedMinutes ?? costSnapshot?.includedMinutes),
      costSnapshot,
      createdAt: new Date().toISOString()
    };
    this.state.usageLedger.push(entry);
    this.persist();
    return entry;
  }

  summarizePlanUsage({ planId, billingPeriod = currentBillingPeriod(), includedMinutes = null } = {}) {
    const normalizedPlanId = String(planId || "").toLowerCase();
    const period = billingPeriod || currentBillingPeriod();
    const entries = this.state.usageLedger.filter((entry) => {
      if (entry.billingPeriod !== period) return false;
      if (!normalizedPlanId) return true;
      return String(entry.planId || entry.costSnapshot?.planId || "").toLowerCase() === normalizedPlanId;
    });
    const minutesUsed = entries.reduce((sum, entry) => sum + (Number(entry.roundedMinutes) || 0), 0);
    const limit = numberOrNull(includedMinutes) || entries.find((entry) => entry.includedMinutes)?.includedMinutes || null;
    return {
      planId: normalizedPlanId || null,
      billingPeriod: period,
      includedMinutes: limit,
      minutesUsed,
      minutesRemaining: limit ? Math.max(0, limit - minutesUsed) : null,
      usageEntryCount: entries.length
    };
  }

  load() {
    if (!existsSync(this.filePath)) return;
    const raw = readFileSync(this.filePath, "utf8");
    if (!raw.trim()) return;
    this.state = { ...this.state, ...JSON.parse(raw) };
  }

  persist() {
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(this.state, null, 2));
  }
}

export function signPayload(secret, payload) {
  return `sha256=${createHmac("sha256", secret).update(payload).digest("hex")}`;
}

export function encryptSecret(secret, keyMaterial) {
  const key = deriveEncryptionKey(keyMaterial);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${ciphertext.toString("base64")}`;
}

export function decryptSecret(encryptedSecret, keyMaterial) {
  const [version, iv, tag, ciphertext] = String(encryptedSecret).split(":");
  if (version !== "v1" || !iv || !tag || !ciphertext) throw new Error("Unsupported encrypted secret format.");
  const key = deriveEncryptionKey(keyMaterial);
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64")),
    decipher.final()
  ]).toString("utf8");
}

function deriveEncryptionKey(keyMaterial) {
  return createHash("sha256").update(String(keyMaterial)).digest();
}

function randomId() {
  return Math.random().toString(36).slice(2, 10);
}

function currentBillingPeriod() {
  return new Date().toISOString().slice(0, 7);
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function retryDelayMs(attemptCount) {
  return Math.min(60_000, 2 ** Math.max(attemptCount - 1, 0) * 5_000);
}

function buildFlagsFromGateVerdict(jobId, verdictPayload) {
  const perCheck = verdictPayload.per_check || {};
  const flags = [];

  for (const [gate, result] of Object.entries(perCheck)) {
    const findings = [
      ...normalizeFindings(result.findings),
      ...normalizeFindings(result.freezes).map((finding) => ({ ...finding, summary: finding.summary || "Freeze/hold detected." }))
    ];

    if (result.pass === false && findings.length === 0) {
      findings.push({ summary: `${gate} check failed.`, timestamp: "00:00:00" });
    }

    for (const finding of findings) {
      flags.push({
        gate,
        severity: result.pass === false ? "block" : "warn",
        timestamp: normalizeTimestamp(finding.timestamp || finding.timecode || finding.start || finding.start_s || finding.startSec || finding.t_start),
        summary: summarizeFinding(gate, finding),
        evidenceSource: finding.evidenceSource || "deterministic",
        transcriptEvidence: finding.transcriptEvidence || finding.transcript || finding.quote || ""
      });
    }
  }

  if (flags.length === 0 && (verdictPayload.blocked || []).length) {
    for (const gate of verdictPayload.blocked) {
      flags.push({
        gate,
        severity: "block",
        timestamp: "00:00:00",
        summary: `${gate} check failed.`,
        evidenceSource: "deterministic",
        transcriptEvidence: ""
      });
    }
  }

  return flags;
}

function normalizeFindings(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((item) => typeof item === "object" ? item : { summary: String(item) });
  if (typeof value === "object") return [value];
  return [{ summary: String(value) }];
}

function normalizeProviderUsage(verdictPayload) {
  const direct = Array.isArray(verdictPayload.provider_usage) ? verdictPayload.provider_usage : [];
  const perCheck = verdictPayload.per_check && typeof verdictPayload.per_check === "object" ? verdictPayload.per_check : {};
  const nested = Object.entries(perCheck).flatMap(([check, payload]) => {
    const usage = payload?.provider_usage || payload?.usage || [];
    const items = Array.isArray(usage) ? usage : usage && typeof usage === "object" ? [usage] : [];
    return items.map((entry) => ({ check, ...entry }));
  });
  const source = direct.length ? direct : nested;
  return source
    .filter((entry) => entry && typeof entry === "object")
    .map((entry) => sanitizeProviderUsageEntry(entry));
}

function buildMediaIngress(input = {}, upload = null) {
  const inline = input.inline_media || input.inlineMedia;
  if (inline) {
    return {
      mode: "inline_ephemeral",
      contentType: inline.content_type || inline.contentType || null,
      bytes: numberOrNull(inline.bytes),
      sha256: safeSha256(inline.sha256),
      ephemeral: true,
      storageMode: "render_temp_storage"
    };
  }
  if (upload) {
    return {
      mode: "signed_upload",
      contentType: upload.contentType || null,
      bytes: numberOrNull(upload.bytesReceived ?? upload.sizeBytes),
      sha256: safeSha256(upload.sha256),
      ephemeral: false,
      storageMode: upload.storageMode || "render_temp_storage"
    };
  }
  if (input.youtube_url) return { mode: "youtube_url", ephemeral: false };
  if (input.signed_url || input.signedUrl) return { mode: "remote_url", ephemeral: false };
  if (input.source) return { mode: "local_or_remote_source", ephemeral: false };
  return null;
}

function safeSha256(value) {
  const text = String(value || "");
  return /^[a-f0-9]{64}$/i.test(text) ? text.toLowerCase() : null;
}

function sanitizeProviderUsageEntry(entry) {
  const safe = {};
  for (const [key, value] of Object.entries(entry)) {
    if (typeof value === "string") safe[key] = value.slice(0, 160);
    else if (typeof value === "number" && Number.isFinite(value)) safe[key] = value;
    else if (typeof value === "boolean") safe[key] = value;
    else if (value == null) safe[key] = value;
  }
  return safe;
}

function summarizeFinding(gate, finding) {
  if (gate === "twins") {
    const duplicateCount = Number.isFinite(Number(finding.duplicate_count)) ? Number(finding.duplicate_count) : null;
    const countText = duplicateCount ? `${duplicateCount} near-duplicate character${duplicateCount === 1 ? "" : "s"}` : "Near-duplicate characters";
    const action = finding.action || (finding.needs_more_character_variation ? "Regenerate or edit the scene with more character variation." : "");
    const reason = finding.reason || finding.summary || finding.label || "Repeated faces or bodies detected in the scene.";
    return action ? `${countText}: ${reason} ${action}` : `${countText}: ${reason}`;
  }
  if (finding.summary || finding.reason || finding.label) return finding.summary || finding.reason || finding.label;
  if (gate === "text_contrast" && Array.isArray(finding.words) && finding.words.length) {
    const sample = finding.words.map((word) => word.text).filter(Boolean).slice(0, 5).join(" ");
    const contrast = finding.words[0]?.contrast;
    const suffix = contrast ? ` (contrast ${contrast}:1)` : "";
    return `Low-contrast overlay text: "${sample}"${suffix}`;
  }
  if (gate === "text_safe_area" && Array.isArray(finding.words) && finding.words.length) {
    const sample = finding.words.map((word) => word.text).filter(Boolean).slice(0, 5).join(" ");
    return `Overlay text outside safe area: "${sample}"`;
  }
  if (finding.seconds && (finding.t_start != null || finding.t_end != null)) {
    return `${gate} finding over ${finding.seconds}s.`;
  }
  return `${gate} finding`;
}

function normalizeTimestamp(value) {
  if (typeof value === "number" && Number.isFinite(value)) return secondsToTimecode(value);
  if (typeof value === "string" && /^\d+(\.\d+)?$/.test(value)) return secondsToTimecode(Number(value));
  if (typeof value === "string" && value.trim()) return value;
  return "00:00:00";
}

function secondsToTimecode(seconds) {
  const total = Math.max(0, Math.floor(seconds));
  const hh = String(Math.floor(total / 3600)).padStart(2, "0");
  const mm = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
  const ss = String(total % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function csvEscape(value) {
  const text = String(value ?? "");
  if (!/[",\n]/.test(text)) return text;
  return `"${text.replaceAll('"', '""')}"`;
}
