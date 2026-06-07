import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { JsonStore, decryptSecret, signPayload } from "../../server-store.mjs";

describe("JsonStore", () => {
  it("persists jobs, uploads, webhooks, and usage ledger across store instances", () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-store-"));
    const path = join(dir, "state.json");

    try {
      const store = new JsonStore(path);
      const job = store.createJob({ youtube_url: "https://youtube.com/watch?v=creator-cut", idempotency_key: "abc" });
      const upload = store.createUpload({ filename: "rough-cut.mp4", content_type: "video/mp4", size_bytes: 42000000 });
      const webhook = store.createWebhook({ url: "https://agent.example.com/qc-callback" });
      const usage = store.appendUsage(job.jobId, 19, "2026-06", { estimatedCogsCents: 1.58, marginSafe: true });

      const reloaded = new JsonStore(path);

      expect(reloaded.getJob(job.jobId)).toMatchObject({ idempotencyKey: "abc", status: "queued" });
      expect(reloaded.getUpload(upload.uploadId)).toMatchObject({ filename: "rough-cut.mp4", status: "created" });
      expect(reloaded.getUpload(upload.uploadId).signedPutUrl).toContain(`/v1/uploads/${upload.uploadId}/content?token=`);
      expect(reloaded.getWebhook(webhook.webhookId)).toMatchObject({ url: "https://agent.example.com/qc-callback" });
      expect(reloaded.state.usageLedger[0]).toMatchObject({
        usageId: usage.usageId,
        roundedMinutes: 19,
        costSnapshot: { estimatedCogsCents: 1.58, marginSafe: true }
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("meters each job only once per billing period and summarizes plan allowance", () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-store-"));
    const path = join(dir, "state.json");

    try {
      const store = new JsonStore(path);
      const job = store.createJob({ source: "/tmp/master.mp4", plan_id: "creator", included_minutes: 1200 });
      job.aiReviewSeconds = 90;
      job.aiReviewBudgetSeconds = 3600;
      const first = store.appendUsage(job.jobId, 7, "2026-06", { planId: "creator", includedMinutes: 1200, aiReviewSeconds: 90, aiReviewBudgetSeconds: 3600 });
      const replay = store.appendUsage(job.jobId, 7, "2026-06", { planId: "creator", includedMinutes: 1200, aiReviewSeconds: 90, aiReviewBudgetSeconds: 3600 });
      const summary = store.summarizePlanUsage({ planId: "creator", billingPeriod: "2026-06", includedMinutes: 1200 });

      expect(first.usageId).toBe(replay.usageId);
      expect(replay.idempotentReplay).toBe(true);
      expect(store.state.usageLedger).toHaveLength(1);
      expect(summary).toMatchObject({
        planId: "creator",
        billingPeriod: "2026-06",
        includedMinutes: 1200,
        minutesUsed: 7,
        minutesRemaining: 1193,
        aiReviewSecondsUsed: 90,
        aiReviewBudgetSeconds: 3600,
        aiReviewSecondsRemaining: 3510,
        usageEntryCount: 1
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("summarizes plan usage within a workspace when workspaceId is supplied", () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-store-"));
    const path = join(dir, "state.json");

    try {
      const store = new JsonStore(path);
      const firstJob = store.createJob({ source: "/tmp/a.mp4", plan_id: "creator", workspace_id: "ws_a", included_minutes: 10 });
      const secondJob = store.createJob({ source: "/tmp/b.mp4", plan_id: "creator", workspace_id: "ws_b", included_minutes: 10 });
      store.appendUsage(firstJob.jobId, 9, "2026-06", { planId: "creator", workspaceId: "ws_a", includedMinutes: 10 });
      store.appendUsage(secondJob.jobId, 2, "2026-06", { planId: "creator", workspaceId: "ws_b", includedMinutes: 10 });

      expect(store.summarizePlanUsage({ planId: "creator", billingPeriod: "2026-06", includedMinutes: 10 })).toMatchObject({
        workspaceId: null,
        minutesUsed: 11,
        usageEntryCount: 2
      });
      expect(store.summarizePlanUsage({ planId: "creator", workspaceId: "ws_b", billingPeriod: "2026-06", includedMinutes: 10 })).toMatchObject({
        workspaceId: "ws_b",
        minutesUsed: 2,
        minutesRemaining: 8,
        usageEntryCount: 1
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("records usage-limit attempts with plan and workspace context", () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-store-usage-abuse-"));
    const path = join(dir, "store.json");
    try {
      const store = new JsonStore(path);
      const event = store.recordAbuseEvent({
        type: "usage_limit_exceeded",
        error: "usage_limit_exceeded",
        status: 402,
        workspaceId: "ws_limit",
        ownerEmail: "limit@example.com",
        planId: "creator",
        billingPeriod: "2026-06",
        includedMinutes: 2400,
        minutesUsed: 2399,
        requestedMinutes: 2,
        minutesRemaining: 1
      });

      expect(event).toMatchObject({
        error: "usage_limit_exceeded",
        workspaceId: "ws_limit",
        ownerEmail: "limit@example.com",
        planId: "creator",
        billingPeriod: "2026-06",
        includedMinutes: 2400,
        minutesUsed: 2399,
        requestedMinutes: 2,
        minutesRemaining: 1
      });
      expect(new JsonStore(path).listAbuseEvents({ workspaceId: "ws_limit" })[0]).toMatchObject({
        error: "usage_limit_exceeded",
        planId: "creator"
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("lists spend alerts by workspace for operator review", () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-store-spend-alerts-"));
    const path = join(dir, "store.json");
    try {
      const store = new JsonStore(path);
      store.recordSpendAlert({
        workspaceId: "ws_a",
        ownerEmail: "a@example.com",
        planId: "creator",
        billingPeriod: "2026-06",
        minutesUsed: 1301,
        includedMinutes: 1,
        planPriceCents: 100,
        overageRevenueCents: 15600,
        overageRateCentsPerMinute: 12,
        overageCostCents: 108.25,
        status: "sent",
        provider: "resend"
      });
      store.recordSpendAlert({
        workspaceId: "ws_b",
        ownerEmail: "b@example.com",
        planId: "creator",
        billingPeriod: "2026-06",
        minutesUsed: 3,
        includedMinutes: 1,
        status: "failed",
        provider: "resend"
      });

      expect(new JsonStore(path).listSpendAlerts({ workspaceId: "ws_a" })).toHaveLength(1);
      expect(new JsonStore(path).listSpendAlerts({ workspaceId: "ws_a" })[0]).toMatchObject({
        workspaceId: "ws_a",
        ownerEmail: "a@example.com",
        status: "sent",
        overageRevenueCents: 15600,
        overageRateCentsPerMinute: 12,
        provider: "resend"
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("lists queued jobs in FIFO order for worker drains", () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-store-"));
    const path = join(dir, "state.json");

    try {
      const store = new JsonStore(path);
      const first = store.createJob({ source: "https://example.com/first.mp4" });
      const second = store.createJob({ source: "https://example.com/second.mp4" });
      const completed = store.createJob({ source: "https://example.com/done.mp4" });
      completed.status = "completed";

      expect(store.listQueuedJobs({ limit: 10 }).map((job) => job.jobId)).toEqual([first.jobId, second.jobId]);
      expect(store.listQueuedJobs({ limit: 1 }).map((job) => job.jobId)).toEqual([first.jobId]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("lists queued jobs within a workspace for customer worker drains", () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-store-workspace-queue-"));
    const path = join(dir, "state.json");

    try {
      const store = new JsonStore(path);
      const victim = store.createJob({ source: "https://example.com/victim.mp4", workspace_id: "ws_victim" });
      const owned = store.createJob({ source: "https://example.com/owned.mp4", workspace_id: "ws_owned" });
      const secondOwned = store.createJob({ source: "https://example.com/owned-2.mp4", workspace_id: "ws_owned" });

      expect(store.listQueuedJobs({ limit: 10, workspaceId: "ws_owned" }).map((job) => job.jobId)).toEqual([owned.jobId, secondOwned.jobId]);
      expect(store.listQueuedJobs({ limit: 10, workspaceId: "ws_victim" }).map((job) => job.jobId)).toEqual([victim.jobId]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("marks uploaded content and creates upload jobs from the stored local file", () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-store-"));
    const path = join(dir, "state.json");
    const mediaPath = join(dir, "master.mp4");

    try {
      writeFileSync(mediaPath, "fake-video");
      const store = new JsonStore(path);
      const upload = store.createUpload({
        filename: "master.mp4",
        content_type: "video/mp4",
        size_bytes: 10,
        workspace_id: "ws_upload",
        owner_email: "upload@example.com",
        api_key_id: "key_upload"
      }, {
        baseUrl: "http://127.0.0.1:10002"
      });
      const stored = store.markUploadStored(upload.uploadId, {
        contentPath: mediaPath,
        storageMode: "durable_filesystem",
        bytesReceived: 10,
        sha256: "abc123"
      });
      const job = store.createJob({ upload_id: upload.uploadId });

      expect(upload.signedPutUrl).toMatch(new RegExp(`^http://127\\.0\\.0\\.1:10002/v1/uploads/${upload.uploadId}/content\\?token=`));
      expect(stored).toMatchObject({
        status: "uploaded",
        contentPath: mediaPath,
        storageMode: "durable_filesystem",
        bytesReceived: 10,
        workspaceId: "ws_upload",
        ownerEmail: "upload@example.com",
        apiKeyId: "key_upload"
      });
      expect(job).toMatchObject({
        source: mediaPath,
        sourceType: "upload",
        uploadId: upload.uploadId
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("persists sanitized inline media ingress without temporary file paths", () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-store-"));
    const path = join(dir, "state.json");

    try {
      const store = new JsonStore(path);
      const job = store.createJob({
        source: join(dir, "inline-source.mp4"),
        source_type: "upload",
        inline_media: {
          content_type: "video/mp4",
          bytes: 12345,
          sha256: "A".repeat(64),
          ephemeral: true,
          filePath: join(dir, "should-not-persist.mp4"),
          cleanupPath: dir
        }
      });
      const reloadedJob = new JsonStore(path).getJob(job.jobId);

      expect(reloadedJob.mediaIngress).toEqual({
        mode: "inline_ephemeral",
        contentType: "video/mp4",
        bytes: 12345,
        sha256: "a".repeat(64),
        ephemeral: true,
        storageMode: "render_temp_storage"
      });
      expect(JSON.stringify(reloadedJob.mediaIngress)).not.toContain("should-not-persist");
      expect(JSON.stringify(reloadedJob.mediaIngress)).not.toContain("cleanupPath");
      expect(store.listJobEvents(job.jobId)[0].payload.mediaIngress.mode).toBe("inline_ephemeral");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("records webhook delivery previews as delivery log entries", () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-store-"));
    const path = join(dir, "state.json");

    try {
      const store = new JsonStore(path);
      const webhook = store.createWebhook({ url: "https://agent.example.com/qc-callback" });
      const delivery = store.createWebhookDelivery(webhook.webhookId, "job.completed", "job_demo");

      expect(delivery).toMatchObject({
        webhookId: webhook.webhookId,
        eventType: "job.completed",
        signatureHeader: "X-UploadCheck-Signature"
      });
      expect(delivery.signature).toMatch(/^sha256=[a-f0-9]{64}$/);
      expect(delivery.signature).toBe(signPayload(webhook.signingSecret, JSON.stringify(delivery.payload)));
      expect(new JsonStore(path).state.webhookDeliveries).toHaveLength(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("encrypts webhook signing secrets when an encryption key is configured", () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-store-"));
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
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-store-"));
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

  it("scopes webhook endpoints and deliveries by workspace", () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-store-webhook-workspace-"));
    const path = join(dir, "state.json");

    try {
      const store = new JsonStore(path);
      const victimWebhook = store.createWebhook({
        url: "https://victim.example.com/qc-callback",
        event_types: ["job.completed"],
        workspace_id: "ws_victim",
        owner_email: "victim@example.com",
        api_key_id: "key_victim"
      });
      const ownedWebhook = store.createWebhook({
        url: "https://owned.example.com/qc-callback",
        event_types: ["job.completed"],
        workspace_id: "ws_owned",
        owner_email: "owned@example.com",
        api_key_id: "key_owned"
      });
      const ownedJob = store.createJob({ source: "/tmp/owned.mp4", workspace_id: "ws_owned" });
      const victimJob = store.createJob({ source: "/tmp/victim.mp4", workspace_id: "ws_victim" });
      const ownedDeliveries = store.createWebhookDeliveriesForJob(ownedJob.jobId, "job.completed");
      const victimDeliveries = store.createWebhookDeliveriesForJob(victimJob.jobId, "job.completed");

      expect(ownedWebhook).toMatchObject({ workspaceId: "ws_owned", ownerEmail: "owned@example.com", apiKeyId: "key_owned" });
      expect(ownedDeliveries).toHaveLength(1);
      expect(ownedDeliveries[0]).toMatchObject({ webhookId: ownedWebhook.webhookId, workspaceId: "ws_owned" });
      expect(victimDeliveries).toHaveLength(1);
      expect(victimDeliveries[0]).toMatchObject({ webhookId: victimWebhook.webhookId, workspaceId: "ws_victim" });
      expect(store.listWebhookDeliveries({ workspaceId: "ws_owned" }).map((delivery) => delivery.deliveryId)).toEqual([ownedDeliveries[0].deliveryId]);
      expect(store.listDueWebhookDeliveries({ workspaceId: "ws_owned" }).map((delivery) => delivery.deliveryId)).toEqual([ownedDeliveries[0].deliveryId]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("selects only due pending webhook deliveries for worker drains", () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-store-"));
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
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-store-"));
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
        minutesMetered: 0,
        observability: {
          outcome: "WATCH",
          engine: "fallback",
          providerUsageEntries: 0
        }
      });
      expect(completed.startedAt).toBeTruthy();
      expect(completed.completedAt).toBeTruthy();
      expect(completed.processingDurationMs).toBeGreaterThanOrEqual(0);
      expect(completed.failureReason).toBeTruthy();
      expect(completed.observability.stages.map((stage) => stage.status)).toEqual([
        "ingesting",
        "metadata_probe",
        "deterministic_qc",
        "reporting"
      ]);
      expect(store.listJobEvents(job.jobId).map((event) => event.eventType)).toContain("deterministic_qc");
      expect(store.listJobEvents(job.jobId).at(-1).payload).toMatchObject({
        engine: "fallback",
        processingDurationMs: completed.processingDurationMs
      });
      expect(store.listFlags(job.jobId)[0]).toMatchObject({ gate: "engine", severity: "warn" });
      expect(store.listArtifacts(job.jobId).map((artifact) => artifact.artifactType)).toEqual(["json_report"]);

      const reloaded = new JsonStore(path);
      expect(reloaded.listJobEvents(job.jobId).at(-1)).toMatchObject({ eventType: "completed" });
      expect(reloaded.listFlags(job.jobId)).toHaveLength(1);
      expect(reloaded.listArtifacts(job.jobId)).toHaveLength(1);
      expect(reloaded.state.usageLedger).toHaveLength(0);
      expect(reloaded.buildMarkerCsv(job.jobId)).toContain("timecode,severity,gate,summary");
      expect(reloaded.buildMarkerCsv(job.jobId)).toContain("00:00:00,warn,engine");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("records an honest fallback when a local media file is invalid", () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-store-"));
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
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-store-"));
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
      expect(result.job.observability).toMatchObject({
        outcome: "BLOCK",
        engine: "gate_verdict_import",
        providerUsageEntries: 0
      });
      expect(result.job.processingDurationMs).toBeGreaterThanOrEqual(0);
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

  it("records completed known-duration jobs into usage ledger before report fetch", () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-store-"));
    const path = join(dir, "state.json");

    try {
      const store = new JsonStore(path);
      const job = store.createJob({
        source: "/tmp/final-master.mp4",
        plan_id: "creator",
        included_minutes: 1200,
        ai_review_seconds: 30,
        checks: "canvas_fill,twins"
      });
      job.minutesMetered = 2.2;
      const result = store.ingestGateVerdict(job.jobId, {
        verdict: "PASS",
        blocked: [],
        skipped: [],
        provider_usage: [{
          check: "twins",
          provider: "anthropic",
          model: "claude-sonnet-4-5",
          input_tokens: 100,
          output_tokens: 20
        }],
        per_check: {
          twins: { pass: true, findings: [] }
        }
      });
      const usage = store.state.usageLedger[0];
      const replay = store.recordCompletedUsage(job.jobId, "2026-06");

      expect(result.job).toMatchObject({ status: "completed", verdict: "PASS" });
      expect(store.state.usageLedger).toHaveLength(1);
      expect(usage).toMatchObject({
        jobId: job.jobId,
        roundedMinutes: 3,
        planId: "creator",
        includedMinutes: 1200,
        aiReviewSeconds: 30
      });
      expect(usage.costSnapshot).toMatchObject({
        planId: "creator",
        minutesMetered: 3,
        observedProviderUsageEntries: 1
      });
      expect(replay.usageId).toBe(usage.usageId);
      expect(store.listJobEvents(job.jobId).map((event) => event.eventType)).toContain("usage_recorded");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("ingests text contrast gate findings with readable summaries", () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-store-"));
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

  it("ingests twins findings with character variation repair guidance", () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-store-"));
    const path = join(dir, "state.json");

    try {
      const store = new JsonStore(path);
      const job = store.createJob({ source: "/tmp/crowd-scene.jpg" });
      const result = store.ingestGateVerdict(job.jobId, {
        verdict: "BLOCK",
        blocked: ["twins"],
        skipped: [],
        provider_usage: [{
          check: "twins",
          provider: "anthropic",
          model: "claude-sonnet-4-5",
          input_tokens: 1200,
          output_tokens: 80
        }],
        per_check: {
          twins: {
            pass: false,
            findings: [{
              t: 0,
              duplicate_count: 12,
              needs_more_character_variation: true,
              reason: "Multiple background men share the same face, hair, and robe silhouette.",
              action: "Regenerate or edit the crowd with more distinct characters."
            }]
          }
        }
      });

      expect(result.importedFlags).toHaveLength(1);
      expect(store.listFlags(job.jobId)[0]).toMatchObject({
        gate: "twins",
        severity: "block",
        timestamp: "00:00:00",
        summary: "12 near-duplicate characters: Multiple background men share the same face, hair, and robe silhouette. Regenerate or edit the crowd with more distinct characters."
      });
      expect(store.getJob(job.jobId).providerUsage).toEqual([{
        check: "twins",
        provider: "anthropic",
        model: "claude-sonnet-4-5",
        input_tokens: 1200,
        output_tokens: 80
      }]);
      expect(store.state.usageLedger[0]).toMatchObject({
        jobId: job.jobId,
        roundedMinutes: 1,
        costSnapshot: {
          observedProviderUsageEntries: 1
        }
      });
      expect(store.buildMarkerCsv(job.jobId)).toContain("more distinct characters");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("adds character variation repair guidance when a twins action is too narrow", () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-store-"));
    const path = join(dir, "state.json");

    try {
      const store = new JsonStore(path);
      const job = store.createJob({ source: "/tmp/tiled-characters.jpg" });
      store.ingestGateVerdict(job.jobId, {
        verdict: "BLOCK",
        blocked: ["twins"],
        skipped: [],
        per_check: {
          twins: {
            pass: false,
            findings: [{
              t: 0,
              duplicate_count: 4,
              needs_more_character_variation: true,
              reason: "The same face appears four times.",
              action: "Remove the duplicate quadrants."
            }]
          }
        }
      });

      const flag = store.listFlags(job.jobId)[0];
      expect(flag.summary).toContain("Remove the duplicate quadrants.");
      expect(flag.summary).toContain("more distinct characters");
      expect(store.buildMarkerCsv(job.jobId)).toContain("more distinct characters");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("ingests text safe-area gate findings with readable summaries", () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-store-"));
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

  it("ingests thumbnail readability findings with readable summaries", () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-store-"));
    const path = join(dir, "state.json");

    try {
      const store = new JsonStore(path);
      const job = store.createJob({ source: "/tmp/thumbnail.jpg" });
      const result = store.ingestGateVerdict(job.jobId, {
        verdict: "BLOCK",
        blocked: ["thumbnail_text_readability"],
        skipped: [],
        per_check: {
          thumbnail_text_readability: {
            pass: false,
            findings: [{
              label: "THUMBNAIL_LOW_CONTRAST_TEXT",
              reason: "Thumbnail text is too low-contrast against the image/background.",
              words: [{ text: "Buried", contrast: 1.57 }, { text: "Truth", contrast: 1.57 }]
            }]
          }
        }
      });

      expect(result.importedFlags).toHaveLength(1);
      expect(store.listFlags(job.jobId)[0]).toMatchObject({
        gate: "thumbnail_text_readability",
        severity: "block",
        summary: 'Thumbnail text readability issue: "Buried Truth" - Thumbnail text is too low-contrast against the image/background.'
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("returns the existing job for repeated idempotency keys", () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-store-"));
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
