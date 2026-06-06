import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { JsonStore, decryptSecret, signPayload } from "../../server-store.mjs";

describe("JsonStore", () => {
  it("persists jobs, uploads, webhooks, and usage ledger across store instances", () => {
    const dir = mkdtempSync(join(tmpdir(), "qcgenie-store-"));
    const path = join(dir, "state.json");

    try {
      const store = new JsonStore(path);
      const job = store.createJob({ youtube_url: "https://youtube.com/watch?v=creator-cut", idempotency_key: "abc" });
      const upload = store.createUpload({ filename: "rough-cut.mp4", content_type: "video/mp4", size_bytes: 42000000 });
      const webhook = store.createWebhook({ url: "https://agent.example.com/qc-callback" });
      const usage = store.appendUsage(job.jobId, 19, "2026-06");

      const reloaded = new JsonStore(path);

      expect(reloaded.getJob(job.jobId)).toMatchObject({ idempotencyKey: "abc", status: "queued" });
      expect(reloaded.getUpload(upload.uploadId)).toMatchObject({ filename: "rough-cut.mp4", status: "created" });
      expect(reloaded.getUpload(upload.uploadId).signedPutUrl).toContain(`/v1/uploads/${upload.uploadId}/content?token=`);
      expect(reloaded.getWebhook(webhook.webhookId)).toMatchObject({ url: "https://agent.example.com/qc-callback" });
      expect(reloaded.state.usageLedger[0]).toMatchObject({ usageId: usage.usageId, roundedMinutes: 19 });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("marks uploaded content and creates upload jobs from the stored local file", () => {
    const dir = mkdtempSync(join(tmpdir(), "qcgenie-store-"));
    const path = join(dir, "state.json");
    const mediaPath = join(dir, "master.mp4");

    try {
      writeFileSync(mediaPath, "fake-video");
      const store = new JsonStore(path);
      const upload = store.createUpload({ filename: "master.mp4", content_type: "video/mp4", size_bytes: 10 }, {
        baseUrl: "http://127.0.0.1:10002"
      });
      const stored = store.markUploadStored(upload.uploadId, {
        contentPath: mediaPath,
        bytesReceived: 10,
        sha256: "abc123"
      });
      const job = store.createJob({ upload_id: upload.uploadId });

      expect(upload.signedPutUrl).toMatch(new RegExp(`^http://127\\.0\\.0\\.1:10002/v1/uploads/${upload.uploadId}/content\\?token=`));
      expect(stored).toMatchObject({ status: "uploaded", contentPath: mediaPath, bytesReceived: 10 });
      expect(job).toMatchObject({
        source: mediaPath,
        sourceType: "upload",
        uploadId: upload.uploadId
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("records webhook delivery previews as delivery log entries", () => {
    const dir = mkdtempSync(join(tmpdir(), "qcgenie-store-"));
    const path = join(dir, "state.json");

    try {
      const store = new JsonStore(path);
      const webhook = store.createWebhook({ url: "https://agent.example.com/qc-callback" });
      const delivery = store.createWebhookDelivery(webhook.webhookId, "job.completed", "job_demo");

      expect(delivery).toMatchObject({
        webhookId: webhook.webhookId,
        eventType: "job.completed",
        signatureHeader: "X-QCGenie-Signature"
      });
      expect(delivery.signature).toMatch(/^sha256=[a-f0-9]{64}$/);
      expect(delivery.signature).toBe(signPayload(webhook.signingSecret, JSON.stringify(delivery.payload)));
      expect(new JsonStore(path).state.webhookDeliveries).toHaveLength(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("encrypts webhook signing secrets when an encryption key is configured", () => {
    const dir = mkdtempSync(join(tmpdir(), "qcgenie-store-"));
    const path = join(dir, "state.json");

    try {
      const store = new JsonStore(path, { secretEncryptionKey: "test-secret-key" });
      const webhook = store.createWebhook({ url: "https://agent.example.com/qc-callback" });

      expect(webhook.signingSecret).toMatch(/^whsec_/);
      expect(webhook.encryptedSigningSecret).toMatch(/^v1:/);
      expect(webhook.signingSecretStorage).toBe("encrypted");
      expect(decryptSecret(webhook.encryptedSigningSecret, "test-secret-key")).toMatch(/^whsec_/);

      const reloaded = new JsonStore(path, { secretEncryptionKey: "test-secret-key" });
      const delivery = reloaded.createWebhookDelivery(webhook.webhookId, "job.completed", "job_encrypted");
      expect(delivery.signature).toMatch(/^sha256=[a-f0-9]{64}$/);
      expect(new JsonStore(path).getWebhook(webhook.webhookId).signingSecret).toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("queues idempotent webhook deliveries and tracks retry attempts", () => {
    const dir = mkdtempSync(join(tmpdir(), "qcgenie-store-"));
    const path = join(dir, "state.json");

    try {
      const store = new JsonStore(path);
      const webhook = store.createWebhook({ url: "https://agent.example.com/qc-callback", event_types: ["job.completed"] });
      const first = store.createWebhookDeliveriesForJob("job_demo", "job.completed");
      const replay = store.createWebhookDeliveriesForJob("job_demo", "job.completed");

      expect(first).toHaveLength(1);
      expect(replay[0]).toMatchObject({ deliveryId: first[0].deliveryId, idempotentReplay: true });
      expect(store.listWebhookDeliveries({ webhook_id: webhook.webhookId })).toHaveLength(1);

      const failedOnce = store.markWebhookDeliveryAttempt(first[0].deliveryId, { ok: false, responseStatus: 500, error: "server_error" });
      expect(failedOnce).toMatchObject({ status: "pending", attemptCount: 1, lastError: "server_error" });
      expect(failedOnce.nextAttemptAt).toBeTruthy();

      const sent = store.markWebhookDeliveryAttempt(first[0].deliveryId, { ok: true, responseStatus: 200 });
      expect(sent).toMatchObject({ status: "sent", attemptCount: 2, responseStatus: 200 });
      expect(sent.sentAt).toBeTruthy();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("selects only due pending webhook deliveries for worker drains", () => {
    const dir = mkdtempSync(join(tmpdir(), "qcgenie-store-"));
    const path = join(dir, "state.json");

    try {
      const store = new JsonStore(path);
      const webhook = store.createWebhook({ url: "https://agent.example.com/qc-callback", event_types: ["job.completed"] });
      const due = store.createWebhookDelivery(webhook.webhookId, "job.completed", "job_due");
      const future = store.createWebhookDelivery(webhook.webhookId, "job.completed", "job_future");
      future.nextAttemptAt = "2099-01-01T00:00:00.000Z";
      store.persist();

      expect(store.listDueWebhookDeliveries({ limit: 10 }).map((delivery) => delivery.deliveryId)).toEqual([due.deliveryId]);

      store.markWebhookDeliveryAttempt(due.deliveryId, { ok: true, responseStatus: 204 });
      expect(store.listDueWebhookDeliveries({ limit: 10 })).toHaveLength(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("runs deterministic v0 QC and records an honest fallback when the engine cannot resolve the source", () => {
    const dir = mkdtempSync(join(tmpdir(), "qcgenie-store-"));
    const path = join(dir, "state.json");

    try {
      const store = new JsonStore(path);
      const job = store.createJob({ youtube_url: "https://youtube.com/watch?v=creator-cut" });
      const completed = store.runDeterministicQc(job.jobId);

      expect(completed).toMatchObject({
        status: "completed",
        progressPct: 100,
        verdict: "WATCH",
        gateVerdict: "NEEDS_REVIEW",
        minutesMetered: 0
      });
      expect(store.listJobEvents(job.jobId).map((event) => event.eventType)).toContain("deterministic_qc");
      expect(store.listFlags(job.jobId)[0]).toMatchObject({ gate: "engine", severity: "warn" });
      expect(store.listArtifacts(job.jobId).map((artifact) => artifact.artifactType)).toEqual(["json_report"]);

      const reloaded = new JsonStore(path);
      expect(reloaded.listJobEvents(job.jobId).at(-1)).toMatchObject({ eventType: "completed" });
      expect(reloaded.listFlags(job.jobId)).toHaveLength(1);
      expect(reloaded.listArtifacts(job.jobId)).toHaveLength(1);
      expect(reloaded.buildMarkerCsv(job.jobId)).toContain("timecode,severity,gate,summary");
      expect(reloaded.buildMarkerCsv(job.jobId)).toContain("00:00:00,warn,engine");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("records an honest fallback when a local media file is invalid", () => {
    const dir = mkdtempSync(join(tmpdir(), "qcgenie-store-"));
    const path = join(dir, "state.json");
    const mediaPath = join(dir, "invalid.mp4");

    try {
      writeFileSync(mediaPath, "not-a-real-video");
      const store = new JsonStore(path);
      const job = store.createJob({ source: mediaPath });
      const completed = store.runDeterministicQc(job.jobId);

      expect(completed).toMatchObject({
        status: "completed",
        verdict: "WATCH",
        gateVerdict: "NEEDS_REVIEW",
        minutesMetered: 0
      });
      expect(store.listFlags(job.jobId)[0]).toMatchObject({
        gate: "engine",
        severity: "warn"
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("ingests external gate verdicts into job verdicts, flags, and marker exports", () => {
    const dir = mkdtempSync(join(tmpdir(), "qcgenie-store-"));
    const path = join(dir, "state.json");

    try {
      const store = new JsonStore(path);
      const job = store.createJob({ youtube_url: "https://youtube.com/watch?v=creator-cut" });
      const result = store.ingestGateVerdict(job.jobId, {
        verdict: "BLOCK",
        blocked: ["loop_freeze"],
        skipped: ["omni_watch"],
        per_check: {
          loop_freeze: {
            pass: false,
            freezes: [{ start: 42.2, summary: "Visual hold detected for 4.5 seconds." }]
          },
          garble: {
            pass: true,
            findings: []
          }
        }
      });

      expect(result.job).toMatchObject({ status: "completed", verdict: "BLOCK", gateVerdict: "BLOCK" });
      expect(result.importedFlags).toHaveLength(1);
      expect(store.listFlags(job.jobId)[0]).toMatchObject({
        gate: "loop_freeze",
        severity: "block",
        timestamp: "00:00:42"
      });
      expect(store.listJobEvents(job.jobId).map((event) => event.eventType)).toContain("gate_verdict_ingested");
      expect(store.buildMarkerCsv(job.jobId)).toContain("00:00:42,block,loop_freeze");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("ingests text contrast gate findings with readable summaries", () => {
    const dir = mkdtempSync(join(tmpdir(), "qcgenie-store-"));
    const path = join(dir, "state.json");

    try {
      const store = new JsonStore(path);
      const job = store.createJob({ source: "/tmp/final-short.mp4" });
      const result = store.ingestGateVerdict(job.jobId, {
        verdict: "BLOCK",
        blocked: ["text_contrast"],
        skipped: [],
        per_check: {
          text_contrast: {
            pass: false,
            findings: [{
              t_start: 12.4,
              t_end: 14.4,
              seconds: 2,
              words: [{ text: "Buried", contrast: 1.42 }, { text: "in", contrast: 1.41 }, { text: "1945", contrast: 1.4 }]
            }]
          }
        }
      });

      expect(result.importedFlags).toHaveLength(1);
      expect(store.listFlags(job.jobId)[0]).toMatchObject({
        gate: "text_contrast",
        severity: "block",
        timestamp: "00:00:12",
        summary: 'Low-contrast overlay text: "Buried in 1945" (contrast 1.42:1)'
      });
      expect(store.buildMarkerCsv(job.jobId)).toContain('00:00:12,block,text_contrast,"Low-contrast overlay text: ""Buried in 1945"" (contrast 1.42:1)"');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("ingests text safe-area gate findings with readable summaries", () => {
    const dir = mkdtempSync(join(tmpdir(), "qcgenie-store-"));
    const path = join(dir, "state.json");

    try {
      const store = new JsonStore(path);
      const job = store.createJob({ source: "/tmp/short.mp4" });
      const result = store.ingestGateVerdict(job.jobId, {
        verdict: "BLOCK",
        blocked: ["text_safe_area"],
        skipped: [],
        per_check: {
          text_safe_area: {
            pass: false,
            findings: [{
              t_start: 2,
              t_end: 4,
              seconds: 2,
              words: [{ text: "Too" }, { text: "low" }]
            }]
          }
        }
      });

      expect(result.importedFlags).toHaveLength(1);
      expect(store.listFlags(job.jobId)[0]).toMatchObject({
        gate: "text_safe_area",
        severity: "block",
        timestamp: "00:00:02",
        summary: 'Overlay text outside safe area: "Too low"'
      });
      expect(store.buildMarkerCsv(job.jobId)).toContain('00:00:02,block,text_safe_area,"Overlay text outside safe area: ""Too low"""');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("returns the existing job for repeated idempotency keys", () => {
    const dir = mkdtempSync(join(tmpdir(), "qcgenie-store-"));
    const path = join(dir, "state.json");

    try {
      const store = new JsonStore(path);
      const first = store.createJob({ youtube_url: "https://youtube.com/watch?v=creator-cut", idempotency_key: "agent-run-1" });
      store.runDeterministicQc(first.jobId);
      const replay = store.createJob({ youtube_url: "https://youtube.com/watch?v=creator-cut", idempotency_key: "agent-run-1" });

      expect(replay).toMatchObject({
        jobId: first.jobId,
        idempotentReplay: true,
        status: "completed"
      });
      expect(store.listJobs({ source_url: "https://youtube.com/watch?v=creator-cut" })).toHaveLength(1);
      expect(store.listJobEvents(first.jobId).map((event) => event.eventType)).toContain("idempotent_replay");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
