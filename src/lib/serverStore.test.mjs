import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { JsonStore } from "../../server-store.mjs";

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
      expect(new JsonStore(path).state.webhookDeliveries).toHaveLength(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
