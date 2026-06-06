import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { JsonStore } from "../../server-store.mjs";

const servers = [];

afterEach(async () => {
  for (const server of servers.splice(0)) {
    if (server.exitCode !== null) continue;
    server.kill("SIGTERM");
    await new Promise((resolve) => server.once("exit", resolve));
  }
});

describe("server inline media API", () => {
  it("serves live launch status derived from readiness without API auth", async () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-http-launch-status-"));
    const port = 19000 + Math.floor(Math.random() * 1000);
    const server = spawn("node", ["server.mjs"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PORT: String(port),
        UPLOADCHECK_API_KEY_SHA256: "a".repeat(64),
        UPLOADCHECK_STORE_PATH: join(dir, "store.json"),
        UPLOADCHECK_BUNDLED_DEMO_CLIP_PATH: "public/demo/uploadcheck-product-hunt-demo.mp4"
      },
      stdio: ["ignore", "pipe", "pipe"]
    });
    servers.push(server);

    try {
      await waitForHealth(port);
      const response = await fetch(`http://127.0.0.1:${port}/v1/launch-status`);
      const payload = await response.json();

      expect(response.status).toBe(200);
      expect(payload.generated_from).toBe("live readiness");
      expect(payload.contractVersion).toBe("2026-06-06.render-web-proof");
      expect(payload.product_hunt_ready).toBe(false);
      expect(payload.status.api_auth).toBe("pass");
      expect(payload.status.checkout).toBe("blocked");
      expect(payload.remaining_blockers.map((blocker) => blocker.id)).toContain("checkout");
      expect(payload.public_artifacts.live_launch_status).toBe("https://api.uploadcheck.app/v1/launch-status");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 20000);

  it("serves live launch handoff derived from readiness without API auth", async () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-http-launch-handoff-"));
    const port = 19000 + Math.floor(Math.random() * 1000);
    const server = spawn("node", ["server.mjs"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PORT: String(port),
        UPLOADCHECK_API_KEY_SHA256: "a".repeat(64),
        UPLOADCHECK_STORE_PATH: join(dir, "store.json"),
        UPLOADCHECK_BUNDLED_DEMO_CLIP_PATH: "public/demo/uploadcheck-product-hunt-demo.mp4"
      },
      stdio: ["ignore", "pipe", "pipe"]
    });
    servers.push(server);

    try {
      await waitForHealth(port);
      const response = await fetch(`http://127.0.0.1:${port}/v1/launch-handoff`);
      const payload = await response.json();

      expect(response.status).toBe(200);
      expect(payload.name).toBe("UploadCheck.app Launch Handoff");
      expect(payload.source).toBe("https://api.uploadcheck.app/v1/readiness");
      expect(payload.productHuntReady).toBe(false);
      expect(payload.remainingBlockers.map((blocker) => blocker.id)).toContain("checkout");
      expect(payload.requiredActions.map((action) => action.id)).toContain("checkout");
      expect(payload.blockerProofCommands.find((blocker) => blocker.id === "checkout")?.commands).toContain("UPLOADCHECK_CHECKOUT_PROBE=1 npm run launch:checkout");
      expect(payload.launchDoctorCommands).toContain("UPLOADCHECK_MEDIA_INGRESS_BASE_URL=https://api.uploadcheck.app UPLOADCHECK_API_KEY=<private_bearer> npm run media-ingress:verify");
      expect(payload.operatorCommandSequence).toContain("UPLOADCHECK_MEDIA_INGRESS_BASE_URL=https://api.uploadcheck.app UPLOADCHECK_API_KEY=<private_bearer> npm run media-ingress:verify");
      expect(payload.rule).toContain("Do not launch on Product Hunt");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 20000);

  it("serves live launch doctor derived from readiness without API auth", async () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-http-launch-doctor-"));
    const port = 19000 + Math.floor(Math.random() * 1000);
    const server = spawn("node", ["server.mjs"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PORT: String(port),
        UPLOADCHECK_API_KEY_SHA256: "a".repeat(64),
        UPLOADCHECK_STORE_PATH: join(dir, "store.json"),
        UPLOADCHECK_BUNDLED_DEMO_CLIP_PATH: "public/demo/uploadcheck-product-hunt-demo.mp4"
      },
      stdio: ["ignore", "pipe", "pipe"]
    });
    servers.push(server);

    try {
      await waitForHealth(port);
      const response = await fetch(`http://127.0.0.1:${port}/v1/launch-doctor`);
      const payload = await response.json();

      expect(response.status).toBe(200);
      expect(payload.name).toBe("UploadCheck.app Launch Doctor");
      expect(payload.contractVersion).toBe("2026-06-06.render-web-proof");
      expect(payload.handoffUrl).toBe("https://api.uploadcheck.app/v1/launch-handoff");
      expect(payload.blockerFixPlan.status).toBe("blocked");
      expect(payload.launchDoctorCommands).toContain("UPLOADCHECK_MEDIA_INGRESS_BASE_URL=https://api.uploadcheck.app UPLOADCHECK_API_KEY=<private_bearer> npm run media-ingress:verify");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 20000);

  it("serves redacted live launch evidence derived from readiness without API auth", async () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-http-launch-evidence-"));
    const port = 19000 + Math.floor(Math.random() * 1000);
    const server = spawn("node", ["server.mjs"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PORT: String(port),
        UPLOADCHECK_API_KEY_SHA256: "a".repeat(64),
        UPLOADCHECK_STORE_PATH: join(dir, "store.json"),
        UPLOADCHECK_BUNDLED_DEMO_CLIP_PATH: "public/demo/uploadcheck-product-hunt-demo.mp4"
      },
      stdio: ["ignore", "pipe", "pipe"]
    });
    servers.push(server);

    try {
      await waitForHealth(port);
      const response = await fetch(`http://127.0.0.1:${port}/v1/launch-evidence`);
      const payload = await response.json();

      expect(response.status).toBe(200);
      expect(payload.name).toBe("UploadCheck.app Remote Launch Evidence");
      expect(payload.contractVersion).toBe("2026-06-06.render-web-proof");
      expect(payload.source).toBe("https://api.uploadcheck.app/v1/launch-doctor");
      expect(payload.productHuntReady).toBe(false);
      expect(payload.status).toBe("blocked");
      expect(payload.blockers).toContain("checkout");
      expect(payload.commandCoverage.join("\n")).toContain("<private_bearer>");
      expect(JSON.stringify(payload)).not.toContain("uck_");
      expect(JSON.stringify(payload)).not.toContain(dir);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 20000);

  it("returns JSON 404 for missing public artifact paths instead of SPA HTML", async () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-http-static-miss-"));
    const port = 19000 + Math.floor(Math.random() * 1000);
    const server = spawn("node", ["server.mjs"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PORT: String(port),
        UPLOADCHECK_API_KEY_SHA256: "a".repeat(64),
        UPLOADCHECK_STORE_PATH: join(dir, "store.json"),
        UPLOADCHECK_BUNDLED_DEMO_CLIP_PATH: "public/demo/uploadcheck-product-hunt-demo.mp4"
      },
      stdio: ["ignore", "pipe", "pipe"]
    });
    servers.push(server);

    try {
      await waitForHealth(port);
      const response = await fetch(`http://127.0.0.1:${port}/missing-public-artifact.json`);
      const payload = await response.json();

      expect(response.status).toBe(404);
      expect(response.headers.get("content-type")).toContain("application/json");
      expect(payload).toEqual({
        error: "artifact_not_found",
        path: "/missing-public-artifact.json"
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 20000);

  it("returns sanitized mediaIngress without exposing temporary source paths", async () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-http-inline-"));
    const port = 19000 + Math.floor(Math.random() * 1000);
    const apiKey = "uck_test_inline";
    const server = spawn("node", ["server.mjs"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PORT: String(port),
        UPLOADCHECK_API_KEY: apiKey,
        UPLOADCHECK_STORE_PATH: join(dir, "store.json"),
        UPLOADCHECK_INLINE_MEDIA_MAX_MB: "1",
        UPLOADCHECK_BUNDLED_DEMO_CLIP_PATH: "public/demo/uploadcheck-product-hunt-demo.mp4"
      },
      stdio: ["ignore", "pipe", "pipe"]
    });
    servers.push(server);

    try {
      await waitForHealth(port);
      const response = await fetch(`http://127.0.0.1:${port}/v1/qc/jobs`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          media_base64: Buffer.from("fake-mp4").toString("base64"),
          media_content_type: "video/mp4",
          media_kind: "video",
          filename: "inline-smoke.mp4",
          checks: "canvas_fill",
          cost_guardrail: "downgrade"
        })
      });
      const payload = await response.json();

      expect(response.status).toBe(202);
      expect(payload.mediaIngress).toEqual({
        mode: "inline_ephemeral",
        contentType: "video/mp4",
        bytes: 8,
        sha256: createHash("sha256").update("fake-mp4").digest("hex"),
        ephemeral: true,
        storageMode: "render_temp_storage"
      });
      expect(payload.sourceRedacted).toBe(true);
      expect(payload.source).toBeUndefined();
      expect(JSON.stringify(payload)).not.toContain("uploadcheck-inline-");
      expect(payload.verdict).toBe("WATCH");

      const reportResponse = await fetch(`http://127.0.0.1:${port}/v1/qc/jobs/${payload.jobId}/report`, {
        headers: { authorization: `Bearer ${apiKey}` }
      });
      const report = await reportResponse.json();
      const usageResponse = await fetch(`http://127.0.0.1:${port}/v1/usage`, {
        headers: { authorization: `Bearer ${apiKey}` }
      });
      const usage = await usageResponse.json();

      expect(reportResponse.status).toBe(200);
      expect(report.usage).toBeNull();
      expect(report.costEstimate.minutesMetered).toBe(0);
      expect(usage.usageLedger).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 20000);

  it("materializes inline chunk sidecars and blocks failed rerender reports", async () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-http-sidecars-"));
    const port = 19000 + Math.floor(Math.random() * 1000);
    const apiKey = "uck_test_chunk_sidecars";
    const server = spawn("node", ["server.mjs"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PORT: String(port),
        UPLOADCHECK_API_KEY: apiKey,
        UPLOADCHECK_STORE_PATH: join(dir, "store.json"),
        UPLOADCHECK_INLINE_MEDIA_MAX_MB: "1",
        UPLOADCHECK_BUNDLED_DEMO_CLIP_PATH: "public/demo/uploadcheck-product-hunt-demo.mp4"
      },
      stdio: ["ignore", "pipe", "pipe"]
    });
    servers.push(server);

    try {
      await waitForHealth(port);
      const response = await fetch(`http://127.0.0.1:${port}/v1/qc/jobs`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          media_base64: Buffer.from("fake-jpeg").toString("base64"),
          media_content_type: "image/jpeg",
          media_kind: "image",
          filename: "voiceover.jpg",
          checks: "chunk_sidecar_failures",
          chunk_sidecars_json: [{
            relative_path: "voice-12.garble-report.json",
            json: {
              pass: false,
              status: "failed",
              findings: [{ reason: "Chunk 12 failed after max rerenders." }]
            }
          }]
        })
      });
      const payload = await response.json();

      expect(response.status).toBe(202);
      expect(payload.verdict).toBe("BLOCK");
      expect(payload.gateVerdict).toBe("BLOCK");
      const reportResponse = await fetch(`http://127.0.0.1:${port}/v1/qc/jobs/${payload.jobId}/report`, {
        headers: { authorization: `Bearer ${apiKey}` }
      });
      const report = await reportResponse.json();

      expect(reportResponse.status).toBe(200);
      expect(report.flags[0]).toMatchObject({
        gate: "chunk_sidecar_failures",
        severity: "block"
      });
      expect(report.flags[0].summary).toContain("Chunk 12 failed after max rerenders");
      expect(JSON.stringify(payload)).not.toContain("uploadcheck-chunk-sidecars-");
      expect(JSON.stringify(report)).not.toContain("uploadcheck-chunk-sidecars-");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 20000);

  it("queues async jobs and drains them through the worker endpoint", async () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-http-async-drain-"));
    const port = 19000 + Math.floor(Math.random() * 1000);
    const apiKey = "uck_test_async_drain";
    const server = spawn("node", ["server.mjs"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PORT: String(port),
        UPLOADCHECK_API_KEY: apiKey,
        UPLOADCHECK_STORE_PATH: join(dir, "store.json"),
        UPLOADCHECK_BUNDLED_DEMO_CLIP_PATH: "public/demo/uploadcheck-product-hunt-demo.mp4"
      },
      stdio: ["ignore", "pipe", "pipe"]
    });
    servers.push(server);

    try {
      await waitForHealth(port);
      const createResponse = await fetch(`http://127.0.0.1:${port}/v1/qc/jobs`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          source: "https://example.com/queued-final.mp4",
          source_type: "signed_url",
          process_async: true,
          duration_seconds: 30,
          checks: "canvas_fill"
        })
      });
      const created = await createResponse.json();

      expect(createResponse.status).toBe(202);
      expect(created.status).toBe("queued");
      expect(created.verdict).toBeNull();

      const drainResponse = await fetch(`http://127.0.0.1:${port}/v1/qc/jobs/drain`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({ limit: 1 })
      });
      const drained = await drainResponse.json();

      expect(drainResponse.status).toBe(200);
      expect(drained.processed).toBe(1);
      expect(drained.jobs[0]).toMatchObject({
        jobId: created.jobId,
        status: "completed",
        verdict: "WATCH",
        gateVerdict: "NEEDS_REVIEW"
      });
      expect(drained.jobs[0].observability.processingDurationMs).toBeGreaterThanOrEqual(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 20000);

  it("rejects async jobs with ephemeral inline media", async () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-http-async-inline-"));
    const port = 19000 + Math.floor(Math.random() * 1000);
    const apiKey = "uck_test_async_inline";
    const server = spawn("node", ["server.mjs"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PORT: String(port),
        UPLOADCHECK_API_KEY: apiKey,
        UPLOADCHECK_STORE_PATH: join(dir, "store.json"),
        UPLOADCHECK_BUNDLED_DEMO_CLIP_PATH: "public/demo/uploadcheck-product-hunt-demo.mp4"
      },
      stdio: ["ignore", "pipe", "pipe"]
    });
    servers.push(server);

    try {
      await waitForHealth(port);
      const response = await fetch(`http://127.0.0.1:${port}/v1/qc/jobs`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          media_base64: Buffer.from("fake-mp4").toString("base64"),
          media_content_type: "video/mp4",
          media_kind: "video",
          process_async: true,
          checks: "canvas_fill"
        })
      });
      const payload = await response.json();

      expect(response.status).toBe(400);
      expect(payload.error).toBe("async_ephemeral_inputs_unsupported");
      expect(payload.message).toContain("Queued jobs cannot use inline media");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 20000);

  it("drains async jobs with remote sidecar URLs without exposing the URLs", async () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-http-async-sidecars-"));
    const mediaPath = join(dir, "source.png");
    const port = 19000 + Math.floor(Math.random() * 1000);
    const apiKey = "uck_test_async_sidecars";
    const sidecarServer = createServer((req, res) => {
      if (req.url === "/chunk-sidecars.json") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify([{
          relative_path: "voice-09.garble-report.json",
          json: { pass: false, status: "failed", reason: "garble report failed before render" }
        }]));
        return;
      }
      res.writeHead(404);
      res.end();
    });
    await new Promise((resolve) => sidecarServer.listen(0, "127.0.0.1", resolve));
    const sidecarPort = sidecarServer.address().port;
    const sidecarUrl = `http://127.0.0.1:${sidecarPort}/chunk-sidecars.json`;
    const server = spawn("node", ["server.mjs"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PORT: String(port),
        UPLOADCHECK_API_KEY: apiKey,
        UPLOADCHECK_STORE_PATH: join(dir, "store.json"),
        UPLOADCHECK_BUNDLED_DEMO_CLIP_PATH: "public/demo/uploadcheck-product-hunt-demo.mp4"
      },
      stdio: ["ignore", "pipe", "pipe"]
    });
    servers.push(server);

    try {
      writeFileSync(mediaPath, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/l2w2VQAAAABJRU5ErkJggg==", "base64"));
      await waitForHealth(port);
      const createResponse = await fetch(`http://127.0.0.1:${port}/v1/qc/jobs`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          source: mediaPath,
          source_type: "upload",
          process_async: true,
          checks: "chunk_sidecar_failures",
          chunk_sidecars_url: sidecarUrl
        })
      });
      const created = await createResponse.json();

      expect(createResponse.status).toBe(202);
      expect(created.sidecarIngress).toMatchObject({
        mode: "remote_https_sidecars",
        supplied: ["chunkSidecars"]
      });
      expect(JSON.stringify(created)).not.toContain(sidecarUrl);
      expect(JSON.stringify(created)).not.toContain("chunk-sidecars.json");

      const drainResponse = await fetch(`http://127.0.0.1:${port}/v1/qc/jobs/drain`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({ limit: 1 })
      });
      const drained = await drainResponse.json();

      expect(drainResponse.status).toBe(200);
      expect(drained.processed).toBe(1);
      expect(drained.jobs[0].verdict).toBe("BLOCK");
      expect(drained.jobs[0].gateVerdict).toBe("BLOCK");
      expect(JSON.stringify(drained)).not.toContain(sidecarUrl);
    } finally {
      sidecarServer.close();
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30000);

  it("rejects declared jobs that exceed the max duration limit", async () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-http-duration-limit-"));
    const port = 19000 + Math.floor(Math.random() * 1000);
    const apiKey = "uck_test_duration_limit";
    const server = spawn("node", ["server.mjs"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PORT: String(port),
        UPLOADCHECK_API_KEY: apiKey,
        UPLOADCHECK_STORE_PATH: join(dir, "store.json"),
        UPLOADCHECK_MAX_DURATION_MINUTES: "2",
        UPLOADCHECK_BUNDLED_DEMO_CLIP_PATH: "public/demo/uploadcheck-product-hunt-demo.mp4"
      },
      stdio: ["ignore", "pipe", "pipe"]
    });
    servers.push(server);

    try {
      await waitForHealth(port);
      const response = await fetch(`http://127.0.0.1:${port}/v1/qc/jobs`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          source: "https://example.com/long-final.mp4",
          source_type: "signed_url",
          duration_seconds: 181,
          checks: "canvas_fill"
        })
      });
      const payload = await response.json();

      expect(response.status).toBe(413);
      expect(payload).toMatchObject({
        error: "duration_limit_exceeded",
        maxDurationMinutes: 2,
        requestedMinutes: 4
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 20000);

  it("rejects upload reservations that exceed the max upload size", async () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-http-upload-limit-"));
    const port = 19000 + Math.floor(Math.random() * 1000);
    const apiKey = "uck_test_upload_limit";
    const server = spawn("node", ["server.mjs"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PORT: String(port),
        UPLOADCHECK_API_KEY: apiKey,
        UPLOADCHECK_STORE_PATH: join(dir, "store.json"),
        UPLOADCHECK_MAX_UPLOAD_MB: "1",
        UPLOADCHECK_BUNDLED_DEMO_CLIP_PATH: "public/demo/uploadcheck-product-hunt-demo.mp4"
      },
      stdio: ["ignore", "pipe", "pipe"]
    });
    servers.push(server);

    try {
      await waitForHealth(port);
      const response = await fetch(`http://127.0.0.1:${port}/v1/uploads`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          filename: "too-large.mp4",
          content_type: "video/mp4",
          size_bytes: 2 * 1024 * 1024
        })
      });
      const payload = await response.json();

      expect(response.status).toBe(413);
      expect(payload).toMatchObject({
        error: "upload_size_limit_exceeded",
        maxUploadMb: 1,
        requestedBytes: 2 * 1024 * 1024
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 20000);

  it("rejects job creation when active job concurrency is exhausted", async () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-http-active-limit-"));
    const storePath = join(dir, "store.json");
    const seedStore = new JsonStore(storePath);
    seedStore.createJob({ source: "https://example.com/already-running.mp4" });
    const port = 19000 + Math.floor(Math.random() * 1000);
    const apiKey = "uck_test_active_limit";
    const server = spawn("node", ["server.mjs"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PORT: String(port),
        UPLOADCHECK_API_KEY: apiKey,
        UPLOADCHECK_STORE_PATH: storePath,
        UPLOADCHECK_MAX_ACTIVE_JOBS: "1",
        UPLOADCHECK_BUNDLED_DEMO_CLIP_PATH: "public/demo/uploadcheck-product-hunt-demo.mp4"
      },
      stdio: ["ignore", "pipe", "pipe"]
    });
    servers.push(server);

    try {
      await waitForHealth(port);
      const response = await fetch(`http://127.0.0.1:${port}/v1/qc/jobs`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          source: "https://example.com/new-job.mp4",
          source_type: "signed_url",
          duration_seconds: 30,
          checks: "canvas_fill"
        })
      });
      const payload = await response.json();

      expect(response.status).toBe(429);
      expect(payload).toMatchObject({
        error: "active_job_limit_exceeded",
        maxActiveJobs: 1,
        activeJobs: 1
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 20000);

  it("rejects declared jobs that exceed included plan minutes", async () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-http-usage-limit-"));
    const storePath = join(dir, "store.json");
    const apiKey = "uck_test_usage_limit";
    const seedStore = new JsonStore(storePath);
    const seededJob = seedStore.createJob({ source: "/tmp/previous.mp4", plan_id: "creator", included_minutes: 2400 });
    seedStore.appendUsage(seededJob.jobId, 2399, currentTestBillingPeriod(), { planId: "creator", includedMinutes: 2400 });

    const port = 19000 + Math.floor(Math.random() * 1000);
    const server = spawn("node", ["server.mjs"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PORT: String(port),
        UPLOADCHECK_API_KEY: apiKey,
        UPLOADCHECK_STORE_PATH: storePath,
        UPLOADCHECK_BUNDLED_DEMO_CLIP_PATH: "public/demo/uploadcheck-product-hunt-demo.mp4"
      },
      stdio: ["ignore", "pipe", "pipe"]
    });
    servers.push(server);

    try {
      await waitForHealth(port);
      const response = await fetch(`http://127.0.0.1:${port}/v1/qc/jobs`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          source: "https://example.com/final.mp4",
          source_type: "signed_url",
          plan_id: "creator",
          duration_seconds: 120,
          checks: "canvas_fill",
          cost_guardrail: "downgrade"
        })
      });
      const payload = await response.json();

      expect(response.status).toBe(402);
      expect(payload).toMatchObject({
        error: "usage_limit_exceeded",
        planId: "creator",
        includedMinutes: 2400,
        minutesUsed: 2399,
        requestedMinutes: 2,
        minutesRemaining: 1
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 20000);

  it("creates hashed customer API keys and honors their plan metadata", async () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-http-api-key-"));
    const storePath = join(dir, "store.json");
    const adminKey = "uck_admin_key";
    const port = 19000 + Math.floor(Math.random() * 1000);
    const server = spawn("node", ["server.mjs"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PORT: String(port),
        UPLOADCHECK_API_KEY: adminKey,
        UPLOADCHECK_STORE_PATH: storePath,
        UPLOADCHECK_BUNDLED_DEMO_CLIP_PATH: "public/demo/uploadcheck-product-hunt-demo.mp4"
      },
      stdio: ["ignore", "pipe", "pipe"]
    });
    servers.push(server);

    try {
      await waitForHealth(port);
      const createResponse = await fetch(`http://127.0.0.1:${port}/v1/api-keys`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${adminKey}`
        },
        body: JSON.stringify({
          name: "Creator agent",
          workspace_id: "ws_creator",
          owner_email: "owner@example.com",
          plan_id: "creator",
          included_minutes: 2400,
          plan_price_cents: 9900,
          scopes: ["jobs:write", "jobs:read", "reports:read"]
        })
      });
      const created = await createResponse.json();

      expect(createResponse.status).toBe(201);
      expect(created.apiKey).toMatch(/^uck_/);
      expect(JSON.stringify(created.key)).not.toContain(created.apiKey);
      expect(created.key).toMatchObject({
        workspaceId: "ws_creator",
        ownerEmail: "owner@example.com",
        planId: "creator",
        includedMinutes: 2400,
        planPriceCents: 9900
      });

      const jobResponse = await fetch(`http://127.0.0.1:${port}/v1/qc/jobs`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${created.apiKey}`
        },
        body: JSON.stringify({
          source: "https://example.com/final.mp4",
          source_type: "signed_url",
          duration_seconds: 60,
          checks: "canvas_fill",
          process_async: true
        })
      });
      const job = await jobResponse.json();

      expect(jobResponse.status).toBe(202);
      expect(job).toMatchObject({
        planId: "creator",
        includedMinutes: 2400,
        planPriceCents: 9900,
        workspaceId: "ws_creator",
        ownerEmail: "owner@example.com"
      });

      const saved = JSON.parse(readFileSync(storePath, "utf8"));
      expect(saved.apiKeys[0].tokenHash).toBe(createHash("sha256").update(created.apiKey).digest("hex"));
      expect(saved.apiKeys[0]).not.toHaveProperty("apiKey");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 20000);

  it("allows the web dashboard to preflight API-key creation", async () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-http-api-key-cors-"));
    const port = 19000 + Math.floor(Math.random() * 1000);
    const server = spawn("node", ["server.mjs"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PORT: String(port),
        UPLOADCHECK_API_KEY: "uck_admin_key",
        UPLOADCHECK_STORE_PATH: join(dir, "store.json"),
        UPLOADCHECK_BUNDLED_DEMO_CLIP_PATH: "public/demo/uploadcheck-product-hunt-demo.mp4"
      },
      stdio: ["ignore", "pipe", "pipe"]
    });
    servers.push(server);

    try {
      await waitForHealth(port);
      const response = await fetch(`http://127.0.0.1:${port}/v1/api-keys`, {
        method: "OPTIONS",
        headers: {
          origin: "https://uploadcheck.app",
          "access-control-request-method": "POST",
          "access-control-request-headers": "authorization, content-type"
        }
      });

      expect(response.status).toBe(204);
      expect(response.headers.get("access-control-allow-origin")).toBe("https://uploadcheck.app");
      expect(response.headers.get("access-control-allow-headers")).toContain("authorization");
      expect(response.headers.get("access-control-allow-methods")).toContain("POST");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 20000);

  it("emails the API-key owner when extra-minute spend exceeds subscription value", async () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-http-spend-alert-"));
    const storePath = join(dir, "store.json");
    const adminKey = "uck_admin_spend_alert";
    const sentEmails = [];
    const resendServer = createServer(async (req, res) => {
      let body = "";
      for await (const chunk of req) body += chunk;
      sentEmails.push({
        method: req.method,
        url: req.url,
        authorization: req.headers.authorization,
        body: JSON.parse(body || "{}")
      });
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ id: "email_test_123" }));
    });
    await new Promise((resolve) => resendServer.listen(0, "127.0.0.1", resolve));

    const seedStore = new JsonStore(storePath);
    const seededJob = seedStore.createJob({
      source: "/tmp/previous.mp4",
      plan_id: "creator",
      workspace_id: "ws_spend",
      owner_email: "owner@example.com",
      included_minutes: 1,
      plan_price_cents: 100
    });
    seedStore.appendUsage(seededJob.jobId, 1300, currentTestBillingPeriod(), {
      planId: "creator",
      workspaceId: "ws_spend",
      ownerEmail: "owner@example.com",
      includedMinutes: 1,
      observedTotalCogsCents: 0
    });

    const port = 19000 + Math.floor(Math.random() * 1000);
    const resendPort = resendServer.address().port;
    const server = spawn("node", ["server.mjs"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PORT: String(port),
        UPLOADCHECK_API_KEY: adminKey,
        UPLOADCHECK_STORE_PATH: storePath,
        RESEND_API_KEY: "re_test_key",
        UPLOADCHECK_RESEND_API_URL: `http://127.0.0.1:${resendPort}/emails`,
        UPLOADCHECK_ALERT_FROM_EMAIL: "UploadCheck <alerts@example.com>",
        UPLOADCHECK_BUNDLED_DEMO_CLIP_PATH: "public/demo/uploadcheck-product-hunt-demo.mp4"
      },
      stdio: ["ignore", "pipe", "pipe"]
    });
    servers.push(server);

    try {
      await waitForHealth(port);
      const createResponse = await fetch(`http://127.0.0.1:${port}/v1/api-keys`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${adminKey}`
        },
        body: JSON.stringify({
          name: "Spend alert customer key",
          workspace_id: "ws_spend",
          owner_email: "owner@example.com",
          plan_id: "creator",
          included_minutes: 1,
          plan_price_cents: 100,
          scopes: ["jobs:write", "jobs:read", "reports:read"]
        })
      });
      const created = await createResponse.json();
      expect(createResponse.status).toBe(201);

      const jobResponse = await fetch(`http://127.0.0.1:${port}/v1/qc/jobs`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${created.apiKey}`
        },
        body: JSON.stringify({
          source: "https://example.com/final.mp4",
          source_type: "signed_url",
          checks: "canvas_fill",
          process_async: true
        })
      });
      const job = await jobResponse.json();
      expect(jobResponse.status).toBe(202);
      expect(job.ownerEmail).toBe("owner@example.com");
      expect(job.workspaceId).toBe("ws_spend");

      const verdictResponse = await fetch(`http://127.0.0.1:${port}/v1/qc/jobs/${job.jobId}/gate-verdict`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${created.apiKey}`
        },
        body: JSON.stringify({
          verdict: "PASS",
          provider_usage: [{ provider: "deterministic", input_tokens: 1, output_tokens: 0 }]
        })
      });
      expect(verdictResponse.status).toBe(200);

      expect(sentEmails).toHaveLength(1);
      expect(sentEmails[0]).toMatchObject({
        method: "POST",
        url: "/emails",
        authorization: "Bearer re_test_key"
      });
      expect(sentEmails[0].body).toMatchObject({
        from: "UploadCheck <alerts@example.com>",
        to: ["owner@example.com"],
        subject: "UploadCheck overage spend alert: creator"
      });
      expect(sentEmails[0].body.text).toContain("Workspace ws_spend exceeded the overage spend threshold");
      expect(sentEmails[0].body.text).toContain("Plan price: 1.00 USD");

      const saved = JSON.parse(readFileSync(storePath, "utf8"));
      expect(saved.spendAlerts).toHaveLength(1);
      expect(saved.spendAlerts[0]).toMatchObject({
        workspaceId: "ws_spend",
        ownerEmail: "owner@example.com",
        planId: "creator",
        status: "sent",
        provider: "resend",
        providerMessageId: "email_test_123"
      });
    } finally {
      await new Promise((resolve) => resendServer.close(resolve));
      rmSync(dir, { recursive: true, force: true });
    }
  }, 20000);

  it("rejects declared jobs that exceed included AI-review seconds", async () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-http-ai-limit-"));
    const storePath = join(dir, "store.json");
    const apiKey = "uck_test_ai_limit";
    const seedStore = new JsonStore(storePath);
    const seededJob = seedStore.createJob({
      source: "/tmp/previous.mp4",
      plan_id: "creator",
      included_minutes: 2400,
      ai_review_budget_seconds: 0,
      ai_review_seconds: 3500
    });
    seedStore.appendUsage(seededJob.jobId, 10, currentTestBillingPeriod(), {
      planId: "creator",
      includedMinutes: 2400,
      aiReviewBudgetSeconds: 0,
      aiReviewSeconds: 3500
    });

    const port = 19000 + Math.floor(Math.random() * 1000);
    const server = spawn("node", ["server.mjs"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PORT: String(port),
        UPLOADCHECK_API_KEY: apiKey,
        UPLOADCHECK_STORE_PATH: storePath,
        UPLOADCHECK_BUNDLED_DEMO_CLIP_PATH: "public/demo/uploadcheck-product-hunt-demo.mp4"
      },
      stdio: ["ignore", "pipe", "pipe"]
    });
    servers.push(server);

    try {
      await waitForHealth(port);
      const response = await fetch(`http://127.0.0.1:${port}/v1/qc/jobs`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          source: "https://example.com/final.mp4",
          source_type: "signed_url",
          plan_id: "creator",
          duration_seconds: 30,
          ai_review_seconds: 180,
          checks: "canvas_fill",
          cost_guardrail: "off"
        })
      });
      const payload = await response.json();

      expect(response.status).toBe(402);
      expect(payload).toMatchObject({
        error: "usage_limit_exceeded",
        planId: "creator",
        aiReviewBudgetSeconds: 0,
        aiReviewSecondsUsed: 3500,
        requestedAiReviewSeconds: 180,
        aiReviewSecondsRemaining: 0
      });
      expect(payload.message).toContain("AI-review seconds");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 20000);

  it("treats a zero AI-review budget as an enforced limit", async () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-http-zero-ai-limit-"));
    const apiKey = "uck_test_zero_ai_limit";
    const port = 19000 + Math.floor(Math.random() * 1000);
    const server = spawn("node", ["server.mjs"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PORT: String(port),
        UPLOADCHECK_API_KEY: apiKey,
        UPLOADCHECK_STORE_PATH: join(dir, "store.json"),
        UPLOADCHECK_BUNDLED_DEMO_CLIP_PATH: "public/demo/uploadcheck-product-hunt-demo.mp4"
      },
      stdio: ["ignore", "pipe", "pipe"]
    });
    servers.push(server);

    try {
      await waitForHealth(port);
      const response = await fetch(`http://127.0.0.1:${port}/v1/qc/jobs`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          source: "https://example.com/final.mp4",
          source_type: "signed_url",
          plan_id: "stress_99_5000",
          duration_seconds: 30,
          ai_review_seconds: 1,
          checks: "canvas_fill",
          cost_guardrail: "off"
        })
      });
      const payload = await response.json();

      expect(response.status).toBe(402);
      expect(payload).toMatchObject({
        error: "usage_limit_exceeded",
        planId: "stress_99_5000",
        aiReviewBudgetSeconds: 0,
        aiReviewSecondsUsed: 0,
        requestedAiReviewSeconds: 1,
        aiReviewSecondsRemaining: 0
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 20000);
});

async function waitForHealth(port) {
  const deadline = Date.now() + 10000;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/healthz`);
      if (response.ok) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw lastError || new Error("server did not become healthy");
}

function currentTestBillingPeriod() {
  return new Date().toISOString().slice(0, 7);
}
