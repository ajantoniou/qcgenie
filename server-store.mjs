import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export class JsonStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.state = {
      jobs: [],
      uploads: [],
      webhooks: [],
      usageLedger: [],
      webhookDeliveries: []
    };
    this.load();
  }

  createJob(input) {
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
    this.persist();
    return job;
  }

  getJob(jobId) {
    return this.state.jobs.find((job) => job.jobId === jobId) || null;
  }

  listJobs(limit = 20) {
    return this.state.jobs.slice(-limit).reverse();
  }

  cancelJob(jobId) {
    const job = this.getJob(jobId);
    if (!job) return null;
    job.status = "cancelled";
    job.updatedAt = new Date().toISOString();
    this.persist();
    return job;
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
    const endpoint = {
      webhookId,
      url: input.url,
      eventTypes: input.event_types || input.eventTypes || ["job.completed", "job.failed"],
      signingSecretPreview: `whsec_${randomId()}`,
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
    const delivery = {
      deliveryId: `whd_${randomId()}`,
      webhookId,
      eventType,
      jobId,
      status: "pending",
      signatureHeader: "X-QCGenie-Signature",
      payload: {
        event: eventType,
        job_id: jobId,
        created_at: new Date().toISOString()
      },
      createdAt: new Date().toISOString()
    };
    this.state.webhookDeliveries.push(delivery);
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

function randomId() {
  return Math.random().toString(36).slice(2, 10);
}

function currentBillingPeriod() {
  return new Date().toISOString().slice(0, 7);
}
