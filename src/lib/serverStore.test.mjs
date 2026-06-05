import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { JsonStore, signPayload } from "../../server-store.mjs";

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
      expect(reloaded.getWebhook(webhook.webhookId)).toMatchObject({ url: "https://agent.example.com/qc-callback" });
      expect(reloaded.state.usageLedger[0]).toMatchObject({ usageId: usage.usageId, roundedMinutes: 19 });
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

  it("runs deterministic v0 QC and persists events, flags, and artifacts", () => {
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
        minutesMetered: 19
      });
      expect(store.listJobEvents(job.jobId).map((event) => event.eventType)).toContain("deterministic_qc");
      expect(store.listFlags(job.jobId)[0]).toMatchObject({ gate: "caption", severity: "warn" });
      expect(store.listArtifacts(job.jobId).map((artifact) => artifact.artifactType)).toEqual(["json_report", "marker_export"]);

      const reloaded = new JsonStore(path);
      expect(reloaded.listJobEvents(job.jobId).at(-1)).toMatchObject({ eventType: "completed" });
      expect(reloaded.listFlags(job.jobId)).toHaveLength(1);
      expect(reloaded.listArtifacts(job.jobId)).toHaveLength(2);
      expect(reloaded.buildMarkerCsv(job.jobId)).toContain("timecode,severity,gate,summary");
      expect(reloaded.buildMarkerCsv(job.jobId)).toContain("00:09:12,warn,caption");
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
