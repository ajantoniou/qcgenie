import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { createHmac, randomBytes } from "node:crypto";

export class JsonStore {
  constructor(filePath) {
    this.filePath = filePath;
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

    const jobId = `job_${randomId()}`;
    const now = new Date().toISOString();
    const job = {
      jobId,
      status: "queued",
      progressPct: 0,
      verdict: null,
      minutesMetered: 0,
      source: input.youtube_url || input.source || input.signed_url || input.upload_id || null,
      sourceType: input.youtube_url ? "youtube" : input.upload_id ? "upload" : "signed_url",
      idempotencyKey: input.idempotency_key || null,
      callbackUrl: input.callback_url || null,
      statusUrl: `/v1/qc/jobs/${jobId}`,
      reportUrl: `/v1/qc/jobs/${jobId}/report`,
      createdAt: now,
      updatedAt: now
    };
    this.state.jobs.push(job);
    this.addJobEvent(jobId, "queued", { sourceType: job.sourceType });
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

  runDeterministicQc(jobId) {
    const job = this.getJob(jobId);
    if (!job) return null;

    const stages = [
      ["ingesting", 15],
      ["metadata_probe", 30],
      ["transcribing", 48],
      ["deterministic_qc", 72],
      ["agent_review", 88],
      ["reporting", 96]
    ];

    for (const [status, progressPct] of stages) {
      job.status = status;
      job.progressPct = progressPct;
      job.updatedAt = new Date().toISOString();
      this.addJobEvent(jobId, status, { progressPct });
    }

    job.status = "completed";
    job.progressPct = 100;
    job.verdict = "WATCH";
    job.minutesMetered = 19;
    job.completedAt = new Date().toISOString();
    job.updatedAt = job.completedAt;

    this.addFlag(jobId, {
      gate: "caption",
      severity: "warn",
      timestamp: "00:09:12",
      summary: "Caption sits near the Shorts UI safe area.",
      evidenceSource: "transcript",
      transcriptEvidence: "the payment failed twice"
    });

    this.addArtifact(jobId, {
      artifactType: "json_report",
      url: `/v1/qc/jobs/${jobId}/report`,
      metadata: { format: "json" }
    });
    this.addArtifact(jobId, {
      artifactType: "marker_export",
      url: `/v1/qc/jobs/${jobId}/artifacts/markers`,
      metadata: { format: "premiere_csv" }
    });
    this.addJobEvent(jobId, "completed", { verdict: job.verdict, minutesMetered: job.minutesMetered });
    this.persist();
    return job;
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

  createUpload(input) {
    const uploadId = `upl_${randomId()}`;
    const upload = {
      uploadId,
      filename: input.filename || "upload.mp4",
      contentType: input.content_type || input.contentType || "application/octet-stream",
      sizeBytes: input.size_bytes || input.sizeBytes || 0,
      status: "created",
      signedPutUrl: `https://uploads.qcgenie.com/${uploadId}/${encodeURIComponent(input.filename || "upload.mp4")}`,
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

  createWebhook(input) {
    const webhookId = `wh_${randomId()}`;
    const signingSecret = `whsec_${randomBytes(24).toString("hex")}`;
    const endpoint = {
      webhookId,
      url: input.url,
      eventTypes: input.event_types || input.eventTypes || ["job.completed", "job.failed"],
      signingSecret,
      signingSecretPreview: `${signingSecret.slice(0, 14)}...`,
      createdAt: new Date().toISOString()
    };
    this.state.webhooks.push(endpoint);
    this.persist();
    return endpoint;
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
    const delivery = {
      deliveryId: `whd_${randomId()}`,
      webhookId,
      eventType,
      jobId,
      status: "pending",
      url: endpoint.url,
      attemptCount: 0,
      nextAttemptAt: new Date().toISOString(),
      signatureHeader: "X-QCGenie-Signature",
      signature: signPayload(endpoint.signingSecret, encodedPayload),
      payload,
      createdAt: new Date().toISOString()
    };
    this.state.webhookDeliveries.push(delivery);
    this.persist();
    return delivery;
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

  appendUsage(jobId, roundedMinutes, billingPeriod = currentBillingPeriod()) {
    const entry = {
      usageId: `use_${randomId()}`,
      jobId,
      roundedMinutes,
      billingPeriod,
      createdAt: new Date().toISOString()
    };
    this.state.usageLedger.push(entry);
    this.persist();
    return entry;
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

function randomId() {
  return Math.random().toString(36).slice(2, 10);
}

function currentBillingPeriod() {
  return new Date().toISOString().slice(0, 7);
}

function retryDelayMs(attemptCount) {
  return Math.min(60_000, 2 ** Math.max(attemptCount - 1, 0) * 5_000);
}

function csvEscape(value) {
  const text = String(value ?? "");
  if (!/[",\n]/.test(text)) return text;
  return `"${text.replaceAll('"', '""')}"`;
}
