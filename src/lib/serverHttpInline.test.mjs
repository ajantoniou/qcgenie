import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { createHash, createHmac } from "node:crypto";
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
    const storePath = join(dir, "store.json");
    const port = 19000 + Math.floor(Math.random() * 1000);
    const adminKey = "uck_test_duration_limit";
    const server = spawn("node", ["server.mjs"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PORT: String(port),
        UPLOADCHECK_API_KEY: adminKey,
        UPLOADCHECK_STORE_PATH: storePath,
        UPLOADCHECK_MAX_DURATION_MINUTES: "2",
        UPLOADCHECK_BUNDLED_DEMO_CLIP_PATH: "public/demo/uploadcheck-product-hunt-demo.mp4"
      },
      stdio: ["ignore", "pipe", "pipe"]
    });
    servers.push(server);

    try {
      await waitForHealth(port);
      const createKeyResponse = await fetch(`http://127.0.0.1:${port}/v1/api-keys`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${adminKey}`
        },
        body: JSON.stringify({
          name: "Abuse audit customer",
          workspace_id: "ws_abuse",
          owner_email: "abuse@example.com",
          plan_id: "creator",
          included_minutes: 2400,
          plan_price_cents: 9900,
          scopes: ["jobs:write", "jobs:read", "reports:read", "uploads:write", "api_keys:read"]
        })
      });
      const createdKey = await createKeyResponse.json();
      expect(createKeyResponse.status).toBe(201);

      const response = await fetch(`http://127.0.0.1:${port}/v1/qc/jobs`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${createdKey.apiKey}`
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

      const eventsResponse = await fetch(`http://127.0.0.1:${port}/v1/abuse-events?workspace_id=ws_abuse`, {
        headers: { authorization: `Bearer ${createdKey.apiKey}` }
      });
      const events = await eventsResponse.json();

      expect(eventsResponse.status).toBe(200);
      expect(events.abuseEvents).toHaveLength(1);
      expect(events.abuseEvents[0]).toMatchObject({
        error: "duration_limit_exceeded",
        workspaceId: "ws_abuse",
        ownerEmail: "abuse@example.com",
        requestedMinutes: 4,
        maxDurationMinutes: 2,
        status: 413
      });

      const saved = JSON.parse(readFileSync(storePath, "utf8"));
      expect(saved.abuseEvents[0]).toMatchObject({
        error: "duration_limit_exceeded",
        workspaceId: "ws_abuse"
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

  it("scopes stored workspace API keys to their own upload reservations", async () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-http-upload-workspace-scope-"));
    const storePath = join(dir, "store.json");
    const adminKey = "uck_admin_upload_scope";
    const seedStore = new JsonStore(storePath);
    const victimUpload = seedStore.createUpload({
      filename: "victim.mp4",
      content_type: "video/mp4",
      size_bytes: 10,
      workspace_id: "ws_victim",
      owner_email: "victim@example.com"
    });

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
      const createKeyResponse = await fetch(`http://127.0.0.1:${port}/v1/api-keys`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${adminKey}`
        },
        body: JSON.stringify({
          name: "Owned upload key",
          workspace_id: "ws_owned",
          owner_email: "owned@example.com",
          plan_id: "creator",
          included_minutes: 2400,
          plan_price_cents: 9900,
          scopes: ["jobs:write", "jobs:read", "reports:read", "uploads:write"]
        })
      });
      const createdKey = await createKeyResponse.json();
      expect(createKeyResponse.status).toBe(201);

      const createUploadResponse = await fetch(`http://127.0.0.1:${port}/v1/uploads`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${createdKey.apiKey}`
        },
        body: JSON.stringify({
          filename: "owned.mp4",
          content_type: "video/mp4",
          size_bytes: 10,
          workspace_id: "ws_victim",
          owner_email: "spoof@example.com"
        })
      });
      const ownedUpload = await createUploadResponse.json();
      expect(createUploadResponse.status).toBe(201);
      expect(ownedUpload).toMatchObject({
        workspaceId: "ws_owned",
        ownerEmail: "owned@example.com",
        apiKeyId: createdKey.key.keyId
      });

      const victimGet = await fetch(`http://127.0.0.1:${port}/v1/uploads/${victimUpload.uploadId}`, {
        headers: { authorization: `Bearer ${createdKey.apiKey}` }
      });
      expect(victimGet.status).toBe(404);

      const victimJob = await fetch(`http://127.0.0.1:${port}/v1/qc/jobs`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${createdKey.apiKey}`
        },
        body: JSON.stringify({
          upload_id: victimUpload.uploadId,
          process_async: true,
          checks: "canvas_fill"
        })
      });
      expect(victimJob.status).toBe(404);

      const ownedGet = await fetch(`http://127.0.0.1:${port}/v1/uploads/${ownedUpload.uploadId}`, {
        headers: { authorization: `Bearer ${createdKey.apiKey}` }
      });
      const ownedStatus = await ownedGet.json();
      expect(ownedGet.status).toBe(200);
      expect(ownedStatus).toMatchObject({ uploadId: ownedUpload.uploadId, workspaceId: "ws_owned" });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 20000);

  it("scopes stored workspace API keys to their own webhooks and deliveries", async () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-http-webhook-workspace-scope-"));
    const storePath = join(dir, "store.json");
    const adminKey = "uck_admin_webhook_scope";
    const seedStore = new JsonStore(storePath);
    const victimWebhook = seedStore.createWebhook({
      url: "https://victim.example.com/qc-callback",
      event_types: ["job.completed"],
      workspace_id: "ws_victim",
      owner_email: "victim@example.com"
    });
    const victimDelivery = seedStore.createWebhookDelivery(victimWebhook.webhookId, "job.completed", "job_victim");

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
      const createKeyResponse = await fetch(`http://127.0.0.1:${port}/v1/api-keys`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${adminKey}`
        },
        body: JSON.stringify({
          name: "Owned webhook key",
          workspace_id: "ws_owned",
          owner_email: "owned@example.com",
          plan_id: "creator",
          included_minutes: 2400,
          plan_price_cents: 9900,
          scopes: ["webhooks:write"]
        })
      });
      const createdKey = await createKeyResponse.json();
      expect(createKeyResponse.status).toBe(201);

      const createWebhookResponse = await fetch(`http://127.0.0.1:${port}/v1/webhooks`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${createdKey.apiKey}`
        },
        body: JSON.stringify({
          url: "https://owned.example.com/qc-callback",
          event_types: ["job.completed"],
          workspace_id: "ws_victim",
          owner_email: "spoof@example.com"
        })
      });
      const ownedWebhook = await createWebhookResponse.json();
      expect(createWebhookResponse.status).toBe(201);
      expect(ownedWebhook).toMatchObject({
        workspaceId: "ws_owned",
        ownerEmail: "owned@example.com",
        apiKeyId: createdKey.key.keyId
      });

      const victimPreview = await fetch(`http://127.0.0.1:${port}/v1/webhooks/${victimWebhook.webhookId}/delivery-preview`, {
        headers: { authorization: `Bearer ${createdKey.apiKey}` }
      });
      expect(victimPreview.status).toBe(404);

      const ownedPreview = await fetch(`http://127.0.0.1:${port}/v1/webhooks/${ownedWebhook.webhookId}/delivery-preview`, {
        headers: { authorization: `Bearer ${createdKey.apiKey}` }
      });
      const ownedDelivery = await ownedPreview.json();
      expect(ownedPreview.status).toBe(200);
      expect(ownedDelivery).toMatchObject({ webhookId: ownedWebhook.webhookId, workspaceId: "ws_owned" });

      const listResponse = await fetch(`http://127.0.0.1:${port}/v1/webhooks/deliveries?webhook_id=${victimWebhook.webhookId}`, {
        headers: { authorization: `Bearer ${createdKey.apiKey}` }
      });
      const list = await listResponse.json();
      expect(listResponse.status).toBe(200);
      expect(list.deliveries).toEqual([]);

      const ownedListResponse = await fetch(`http://127.0.0.1:${port}/v1/webhooks/deliveries`, {
        headers: { authorization: `Bearer ${createdKey.apiKey}` }
      });
      const ownedList = await ownedListResponse.json();
      expect(ownedListResponse.status).toBe(200);
      expect(ownedList.deliveries.map((delivery) => delivery.webhookId)).toEqual([ownedWebhook.webhookId]);

      const victimRetry = await fetch(`http://127.0.0.1:${port}/v1/webhooks/deliveries/${victimDelivery.deliveryId}/retry`, {
        method: "POST",
        headers: { authorization: `Bearer ${createdKey.apiKey}` }
      });
      expect(victimRetry.status).toBe(404);

      const drainResponse = await fetch(`http://127.0.0.1:${port}/v1/webhooks/deliveries/drain`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${createdKey.apiKey}`
        },
        body: JSON.stringify({ limit: 10 })
      });
      const drain = await drainResponse.json();
      expect(drainResponse.status).toBe(200);
      expect(drain.processed).toBe(1);
      expect(drain.results[0]).toMatchObject({ webhookId: ownedWebhook.webhookId, workspaceId: "ws_owned" });
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

  it("scopes stored workspace API keys to their own queued job drains", async () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-http-job-drain-scope-"));
    const storePath = join(dir, "store.json");
    const adminKey = "uck_admin_job_drain_scope";
    const seedStore = new JsonStore(storePath);
    const victimJob = seedStore.createJob({
      source: "/tmp/victim-queued.mp4",
      source_type: "signed_url",
      workspace_id: "ws_victim"
    });
    const ownedJob = seedStore.createJob({
      source: "/tmp/owned-queued.mp4",
      source_type: "signed_url",
      workspace_id: "ws_owned"
    });

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
      const createKeyResponse = await fetch(`http://127.0.0.1:${port}/v1/api-keys`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${adminKey}`
        },
        body: JSON.stringify({
          name: "Owned drain key",
          workspace_id: "ws_owned",
          owner_email: "owned@example.com",
          plan_id: "creator",
          included_minutes: 2400,
          plan_price_cents: 9900,
          scopes: ["jobs:write", "jobs:read", "reports:read"]
        })
      });
      const createdKey = await createKeyResponse.json();
      expect(createKeyResponse.status).toBe(201);

      const drainResponse = await fetch(`http://127.0.0.1:${port}/v1/qc/jobs/drain`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${createdKey.apiKey}`
        },
        body: JSON.stringify({ limit: 10 })
      });
      const drain = await drainResponse.json();
      expect(drainResponse.status).toBe(200);
      expect(drain.processed).toBe(1);
      expect(drain.jobs.map((job) => job.jobId)).toEqual([ownedJob.jobId]);

      const saved = JSON.parse(readFileSync(storePath, "utf8"));
      expect(saved.jobs.find((job) => job.jobId === victimJob.jobId)).toMatchObject({ status: "queued", workspaceId: "ws_victim" });
      expect(saved.jobs.find((job) => job.jobId === ownedJob.jobId)).toMatchObject({ status: "completed", workspaceId: "ws_owned" });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 20000);

  it("checks active job concurrency within the authenticated workspace", async () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-http-workspace-active-limit-"));
    const storePath = join(dir, "store.json");
    const adminKey = "uck_admin_workspace_active_limit";
    const seedStore = new JsonStore(storePath);
    seedStore.createJob({
      source: "https://example.com/other-running.mp4",
      workspace_id: "ws_other"
    });

    const port = 19000 + Math.floor(Math.random() * 1000);
    const server = spawn("node", ["server.mjs"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PORT: String(port),
        UPLOADCHECK_API_KEY: adminKey,
        UPLOADCHECK_STORE_PATH: storePath,
        UPLOADCHECK_MAX_ACTIVE_JOBS: "1",
        UPLOADCHECK_BUNDLED_DEMO_CLIP_PATH: "public/demo/uploadcheck-product-hunt-demo.mp4"
      },
      stdio: ["ignore", "pipe", "pipe"]
    });
    servers.push(server);

    try {
      await waitForHealth(port);
      const createKeyResponse = await fetch(`http://127.0.0.1:${port}/v1/api-keys`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${adminKey}`
        },
        body: JSON.stringify({
          name: "Owned concurrency key",
          workspace_id: "ws_owned",
          owner_email: "owned@example.com",
          plan_id: "creator",
          included_minutes: 2400,
          plan_price_cents: 9900,
          scopes: ["jobs:write", "jobs:read", "reports:read"]
        })
      });
      const createdKey = await createKeyResponse.json();
      expect(createKeyResponse.status).toBe(201);

      const response = await fetch(`http://127.0.0.1:${port}/v1/qc/jobs`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${createdKey.apiKey}`
        },
        body: JSON.stringify({
          source: "https://example.com/owned-new-job.mp4",
          source_type: "signed_url",
          duration_seconds: 30,
          checks: "canvas_fill",
          process_async: true
        })
      });
      const payload = await response.json();

      expect(response.status).toBe(202);
      expect(payload).toMatchObject({
        status: "queued",
        workspaceId: "ws_owned",
        ownerEmail: "owned@example.com"
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 20000);

  it("rejects declared jobs that exceed included plan minutes within the authenticated workspace", async () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-http-usage-limit-"));
    const storePath = join(dir, "store.json");
    const apiKey = "uck_test_usage_limit";
    const seedStore = new JsonStore(storePath);
    const seededOtherWorkspace = seedStore.createJob({ source: "/tmp/other.mp4", plan_id: "creator", workspace_id: "ws_other", included_minutes: 2400 });
    const seededCustomerWorkspace = seedStore.createJob({ source: "/tmp/previous.mp4", plan_id: "creator", workspace_id: "ws_usage", included_minutes: 2400 });
    seedStore.appendUsage(seededOtherWorkspace.jobId, 2399, currentTestBillingPeriod(), { planId: "creator", workspaceId: "ws_other", includedMinutes: 2400 });
    seedStore.appendUsage(seededCustomerWorkspace.jobId, 2399, currentTestBillingPeriod(), { planId: "creator", workspaceId: "ws_usage", includedMinutes: 2400 });

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
      const createKeyResponse = await fetch(`http://127.0.0.1:${port}/v1/api-keys`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          name: "Usage limit customer",
          workspace_id: "ws_usage",
          owner_email: "usage@example.com",
          plan_id: "creator",
          included_minutes: 2400,
          plan_price_cents: 9900,
          scopes: ["jobs:write", "jobs:read", "reports:read"]
        })
      });
      const createdKey = await createKeyResponse.json();
      expect(createKeyResponse.status).toBe(201);

      const response = await fetch(`http://127.0.0.1:${port}/v1/qc/jobs`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${createdKey.apiKey}`
        },
        body: JSON.stringify({
          source: "https://example.com/final.mp4",
          source_type: "signed_url",
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
      expect(payload.message).not.toContain("4800");

      const eventsResponse = await fetch(`http://127.0.0.1:${port}/v1/abuse-events?workspace_id=ws_usage`, {
        headers: { authorization: `Bearer ${apiKey}` }
      });
      const events = await eventsResponse.json();
      expect(eventsResponse.status).toBe(200);
      expect(events.abuseEvents).toHaveLength(1);
      expect(events.abuseEvents[0]).toMatchObject({
        error: "usage_limit_exceeded",
        status: 402,
        workspaceId: "ws_usage",
        ownerEmail: "usage@example.com",
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

  it("allows deterministic overage minutes when the workspace key has approved cap credits", async () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-http-usage-overage-cap-"));
    const storePath = join(dir, "store.json");
    const apiKey = "uck_test_usage_overage_cap";
    const seedStore = new JsonStore(storePath);
    const seededCustomerWorkspace = seedStore.createJob({ source: "/tmp/previous.mp4", plan_id: "creator", workspace_id: "ws_usage_cap", included_minutes: 2400 });
    seedStore.appendUsage(seededCustomerWorkspace.jobId, 2399, currentTestBillingPeriod(), { planId: "creator", workspaceId: "ws_usage_cap", includedMinutes: 2400 });

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
      const createKeyResponse = await fetch(`http://127.0.0.1:${port}/v1/api-keys`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          name: "Usage cap customer",
          workspace_id: "ws_usage_cap",
          owner_email: "usage-cap@example.com",
          plan_id: "creator",
          included_minutes: 2400,
          plan_price_cents: 9900,
          overage_cap_cents: 100,
          scopes: ["jobs:write", "jobs:read", "reports:read"]
        })
      });
      const createdKey = await createKeyResponse.json();
      expect(createKeyResponse.status).toBe(201);

      const response = await fetch(`http://127.0.0.1:${port}/v1/qc/jobs`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${createdKey.apiKey}`
        },
        body: JSON.stringify({
          source: "https://example.com/final.mp4",
          source_type: "signed_url",
          duration_seconds: 120,
          checks: "canvas_fill",
          cost_guardrail: "downgrade",
          process_async: true
        })
      });
      const payload = await response.json();

      expect(response.status).toBe(202);
      expect(payload).toMatchObject({
        status: "queued",
        workspaceId: "ws_usage_cap",
        planId: "creator",
        includedMinutes: 2400,
        overageCapCents: 100
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

  it("forces authenticated workspace API-key metadata over client-supplied plan fields", async () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-http-api-key-force-metadata-"));
    const storePath = join(dir, "store.json");
    const adminKey = "uck_admin_force_metadata";
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
          name: "Creator protected key",
          workspace_id: "ws_protected",
          owner_email: "protected@example.com",
          plan_id: "creator",
          included_minutes: 2400,
          plan_price_cents: 9900,
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
          source: "https://example.com/spoofed.mp4",
          source_type: "signed_url",
          workspace_id: "ws_victim",
          owner_email: "victim@example.com",
          plan_id: "network",
          included_minutes: 36000,
          plan_price_cents: 79900,
          duration_seconds: 60,
          checks: "canvas_fill",
          process_async: true
        })
      });
      const job = await jobResponse.json();

      expect(jobResponse.status).toBe(202);
      expect(job).toMatchObject({
        workspaceId: "ws_protected",
        ownerEmail: "protected@example.com",
        planId: "creator",
        includedMinutes: 2400,
        planPriceCents: 9900
      });

      const saved = JSON.parse(readFileSync(storePath, "utf8"));
      expect(saved.jobs[0]).toMatchObject({
        workspaceId: "ws_protected",
        ownerEmail: "protected@example.com",
        planId: "creator",
        includedMinutes: 2400,
        planPriceCents: 9900
      });
      expect(JSON.stringify(saved.jobs[0])).not.toContain("ws_victim");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 20000);

  it("scopes stored workspace API keys to their own jobs and usage ledger", async () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-http-api-key-workspace-scope-"));
    const storePath = join(dir, "store.json");
    const adminKey = "uck_admin_workspace_scope";
    const seedStore = new JsonStore(storePath);
    const victimJob = seedStore.createJob({
      source: "https://example.com/victim.mp4",
      source_type: "signed_url",
      workspace_id: "ws_victim",
      owner_email: "victim@example.com",
      plan_id: "creator",
      included_minutes: 2400
    });
    seedStore.appendUsage(victimJob.jobId, 12, currentTestBillingPeriod(), {
      planId: "creator",
      workspaceId: "ws_victim",
      ownerEmail: "victim@example.com",
      includedMinutes: 2400
    });
    const ownedJob = seedStore.createJob({
      source: "https://example.com/owned.mp4",
      source_type: "signed_url",
      workspace_id: "ws_owned",
      owner_email: "owned@example.com",
      plan_id: "creator",
      included_minutes: 2400
    });
    seedStore.appendUsage(ownedJob.jobId, 3, currentTestBillingPeriod(), {
      planId: "creator",
      workspaceId: "ws_owned",
      ownerEmail: "owned@example.com",
      includedMinutes: 2400
    });

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
          name: "Owned workspace key",
          workspace_id: "ws_owned",
          owner_email: "owned@example.com",
          plan_id: "creator",
          included_minutes: 2400,
          plan_price_cents: 9900,
          scopes: ["jobs:write", "jobs:read", "reports:read"]
        })
      });
      const created = await createResponse.json();
      expect(createResponse.status).toBe(201);

      const victimGet = await fetch(`http://127.0.0.1:${port}/v1/qc/jobs/${victimJob.jobId}`, {
        headers: { authorization: `Bearer ${created.apiKey}` }
      });
      expect(victimGet.status).toBe(404);

      const victimReport = await fetch(`http://127.0.0.1:${port}/v1/qc/jobs/${victimJob.jobId}/report`, {
        headers: { authorization: `Bearer ${created.apiKey}` }
      });
      expect(victimReport.status).toBe(404);

      const victimVerdict = await fetch(`http://127.0.0.1:${port}/v1/qc/jobs/${victimJob.jobId}/gate-verdict`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${created.apiKey}`
        },
        body: JSON.stringify({ verdict: "BLOCK", blocked: ["tamper"] })
      });
      expect(victimVerdict.status).toBe(404);

      const ownedGet = await fetch(`http://127.0.0.1:${port}/v1/qc/jobs/${ownedJob.jobId}`, {
        headers: { authorization: `Bearer ${created.apiKey}` }
      });
      expect(ownedGet.status).toBe(200);

      const listResponse = await fetch(`http://127.0.0.1:${port}/v1/qc/jobs?limit=10`, {
        headers: { authorization: `Bearer ${created.apiKey}` }
      });
      const list = await listResponse.json();
      expect(listResponse.status).toBe(200);
      expect(list.jobs.map((job) => job.jobId)).toEqual([ownedJob.jobId]);

      const usageResponse = await fetch(`http://127.0.0.1:${port}/v1/usage`, {
        headers: { authorization: `Bearer ${created.apiKey}` }
      });
      const usage = await usageResponse.json();
      expect(usageResponse.status).toBe(200);
      expect(usage.usageLedger).toHaveLength(1);
      expect(usage.usageLedger[0]).toMatchObject({
        jobId: ownedJob.jobId,
        workspaceId: "ws_owned",
        roundedMinutes: 3
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 20000);

  it("scopes stored API-key review endpoints and delegated key creation to their own workspace", async () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-http-api-key-review-scope-"));
    const storePath = join(dir, "store.json");
    const adminKey = "uck_admin_review_scope";
    const seedStore = new JsonStore(storePath);
    seedStore.recordAbuseEvent({
      error: "usage_limit_exceeded",
      workspaceId: "ws_victim",
      ownerEmail: "victim@example.com",
      planId: "creator",
      status: 402
    });
    seedStore.recordAbuseEvent({
      error: "usage_limit_exceeded",
      workspaceId: "ws_owned",
      ownerEmail: "owned@example.com",
      planId: "creator",
      status: 402
    });
    seedStore.recordSpendAlert({
      workspaceId: "ws_victim",
      ownerEmail: "victim@example.com",
      planId: "creator",
      status: "sent",
      provider: "resend"
    });
    seedStore.recordSpendAlert({
      workspaceId: "ws_owned",
      ownerEmail: "owned@example.com",
      planId: "creator",
      status: "sent",
      provider: "resend"
    });

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
      const ownedKeyResponse = await fetch(`http://127.0.0.1:${port}/v1/api-keys`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${adminKey}`
        },
        body: JSON.stringify({
          name: "Owned review key",
          workspace_id: "ws_owned",
          owner_email: "owned@example.com",
          plan_id: "creator",
          included_minutes: 2400,
          plan_price_cents: 9900,
          overage_cap_cents: 1200,
          scopes: ["jobs:write", "jobs:read", "reports:read", "api_keys:read", "api_keys:write"]
        })
      });
      const ownedKey = await ownedKeyResponse.json();
      expect(ownedKeyResponse.status).toBe(201);

      const victimKeyResponse = await fetch(`http://127.0.0.1:${port}/v1/api-keys`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${adminKey}`
        },
        body: JSON.stringify({
          name: "Victim key",
          workspace_id: "ws_victim",
          owner_email: "victim@example.com",
          plan_id: "creator",
          included_minutes: 2400,
          plan_price_cents: 9900,
          scopes: ["jobs:write"]
        })
      });
      expect(victimKeyResponse.status).toBe(201);

      const keysResponse = await fetch(`http://127.0.0.1:${port}/v1/api-keys?workspace_id=ws_victim`, {
        headers: { authorization: `Bearer ${ownedKey.apiKey}` }
      });
      const keys = await keysResponse.json();
      expect(keysResponse.status).toBe(200);
      expect(keys.keys).toHaveLength(1);
      expect(keys.keys[0]).toMatchObject({ workspaceId: "ws_owned", ownerEmail: "owned@example.com" });

      const abuseResponse = await fetch(`http://127.0.0.1:${port}/v1/abuse-events?workspace_id=ws_victim`, {
        headers: { authorization: `Bearer ${ownedKey.apiKey}` }
      });
      const abuse = await abuseResponse.json();
      expect(abuseResponse.status).toBe(200);
      expect(abuse.abuseEvents).toHaveLength(1);
      expect(abuse.abuseEvents[0]).toMatchObject({ workspaceId: "ws_owned" });

      const spendResponse = await fetch(`http://127.0.0.1:${port}/v1/spend-alerts?workspace_id=ws_victim`, {
        headers: { authorization: `Bearer ${ownedKey.apiKey}` }
      });
      const spend = await spendResponse.json();
      expect(spendResponse.status).toBe(200);
      expect(spend.spendAlerts).toHaveLength(1);
      expect(spend.spendAlerts[0]).toMatchObject({ workspaceId: "ws_owned" });

      const delegatedCreateResponse = await fetch(`http://127.0.0.1:${port}/v1/api-keys`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${ownedKey.apiKey}`
        },
        body: JSON.stringify({
          name: "Delegated attempted victim key",
          workspace_id: "ws_victim",
          owner_email: "attacker@example.com",
          plan_id: "network",
          included_minutes: 36000,
          plan_price_cents: 79900,
          scopes: ["jobs:write"]
        })
      });
      const delegated = await delegatedCreateResponse.json();
      expect(delegatedCreateResponse.status).toBe(201);
      expect(delegated.key).toMatchObject({
        workspaceId: "ws_owned",
        ownerEmail: "owned@example.com",
        planId: "creator",
        includedMinutes: 2400,
        planPriceCents: 9900,
        overageCapCents: 1200
      });
      expect(delegated.key.workspaceId).not.toBe("ws_victim");
      expect(delegated.key.planId).not.toBe("network");

      const delegatedCheckoutResponse = await fetch(`http://127.0.0.1:${port}/v1/checkout/provision-api-key`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${ownedKey.apiKey}`
        },
        body: JSON.stringify({
          owner_email: "attacker@example.com",
          workspace_id: "ws_victim_checkout",
          plan_id: "network",
          checkout_customer_id: "cus_victim",
          checkout_subscription_id: "sub_victim",
          overage_cap_cents: 999999,
          provisioning_id: "delegated-checkout-attempt"
        })
      });
      const delegatedCheckout = await delegatedCheckoutResponse.json();
      expect(delegatedCheckoutResponse.status).toBe(201);
      expect(delegatedCheckout.key).toMatchObject({
        workspaceId: "ws_owned",
        ownerEmail: "owned@example.com",
        planId: "creator",
        includedMinutes: 2400,
        planPriceCents: 9900,
        overageCapCents: 1200
      });
      expect(delegatedCheckout.key.workspaceId).not.toBe("ws_victim_checkout");
      expect(delegatedCheckout.key.planId).not.toBe("network");
      expect(delegatedCheckout.key.overageCapCents).not.toBe(999999);
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

  it("provisions paid checkout customers into idempotent MCP API keys", async () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-http-checkout-provision-"));
    const storePath = join(dir, "store.json");
    const adminKey = "uck_admin_checkout_provision";
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
      const payload = {
        plan_id: "studio",
        owner_email: "studio@example.com",
        checkout_customer_id: "cus_123",
        checkout_subscription_id: "sub_456"
      };
      const firstResponse = await fetch(`http://127.0.0.1:${port}/v1/checkout/provision-api-key`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${adminKey}`
        },
        body: JSON.stringify(payload)
      });
      const first = await firstResponse.json();

      expect(firstResponse.status).toBe(201);
      expect(first.apiKey).toMatch(/^uck_/);
      expect(first).toMatchObject({
        idempotentReplay: false,
        key: {
          workspaceId: "ws_sub_456",
          ownerEmail: "studio@example.com",
          provisioningId: "checkout:studio:sub_456",
          checkoutCustomerId: "cus_123",
          checkoutSubscriptionId: "sub_456",
          planId: "studio",
          includedMinutes: 10000,
          planPriceCents: 29900,
          scopes: ["jobs:write", "jobs:read", "reports:read", "uploads:write"]
        }
      });

      const retryResponse = await fetch(`http://127.0.0.1:${port}/v1/checkout/provision-api-key`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${adminKey}`
        },
        body: JSON.stringify(payload)
      });
      const retry = await retryResponse.json();

      expect(retryResponse.status).toBe(200);
      expect(retry.apiKey).toBeNull();
      expect(retry.idempotentReplay).toBe(true);
      expect(retry.key.keyId).toBe(first.key.keyId);

      const saved = JSON.parse(readFileSync(storePath, "utf8"));
      expect(saved.apiKeys).toHaveLength(1);
      expect(saved.apiKeys[0]).toMatchObject({
        provisioningId: "checkout:studio:sub_456",
        checkoutCustomerId: "cus_123",
        checkoutSubscriptionId: "sub_456",
        planId: "studio"
      });
      expect(saved.apiKeys[0]).not.toHaveProperty("apiKey");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 20000);

  it("provisions API keys from signed Lemon Squeezy subscription webhooks", async () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-http-lemon-webhook-"));
    const storePath = join(dir, "store.json");
    const webhookSecret = "lemon_test_secret";
    const port = 19000 + Math.floor(Math.random() * 1000);
    const server = spawn("node", ["server.mjs"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PORT: String(port),
        UPLOADCHECK_API_KEY: "uck_admin_lemon",
        UPLOADCHECK_STORE_PATH: storePath,
        UPLOADCHECK_LEMONSQUEEZY_WEBHOOK_SECRET: webhookSecret,
        UPLOADCHECK_BUNDLED_DEMO_CLIP_PATH: "public/demo/uploadcheck-product-hunt-demo.mp4"
      },
      stdio: ["ignore", "pipe", "pipe"]
    });
    servers.push(server);

    try {
      await waitForHealth(port);
      const payload = {
        meta: {
          event_name: "subscription_created",
          custom_data: {
            uploadcheck_plan_id: "network",
            workspace_id: "ws_network_paid",
            overage_cap_cents: 5000
          }
        },
        data: {
          id: "sub_999",
          attributes: {
            user_email: "network@example.com",
            customer_id: "cus_999",
            variant_name: "Network"
          }
        }
      };
      const raw = JSON.stringify(payload);
      const signature = createHmac("sha256", webhookSecret).update(raw).digest("hex");
      const firstResponse = await fetch(`http://127.0.0.1:${port}/v1/webhooks/lemonsqueezy`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-signature": signature
        },
        body: raw
      });
      const first = await firstResponse.json();

      expect(firstResponse.status).toBe(201);
      expect(first.apiKey).toMatch(/^uck_/);
      expect(first).toMatchObject({
        ok: true,
        eventName: "subscription_created",
        idempotentReplay: false,
        key: {
          workspaceId: "ws_network_paid",
          ownerEmail: "network@example.com",
          provisioningId: "lemonsqueezy:network:sub_999",
          checkoutCustomerId: "cus_999",
          checkoutSubscriptionId: "sub_999",
          planId: "network",
          includedMinutes: 36000,
          planPriceCents: 89900,
          overageCapCents: 5000
        }
      });

      const retryResponse = await fetch(`http://127.0.0.1:${port}/v1/webhooks/lemonsqueezy`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-signature": signature
        },
        body: raw
      });
      const retry = await retryResponse.json();
      expect(retryResponse.status).toBe(200);
      expect(retry.apiKey).toBeNull();
      expect(retry.idempotentReplay).toBe(true);

      const badResponse = await fetch(`http://127.0.0.1:${port}/v1/webhooks/lemonsqueezy`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-signature": "bad"
        },
        body: JSON.stringify({ ...payload, data: { id: "sub_bad", attributes: { user_email: "bad@example.com" } } })
      });
      expect(badResponse.status).toBe(401);

      const saved = JSON.parse(readFileSync(storePath, "utf8"));
      expect(saved.apiKeys).toHaveLength(1);
      expect(saved.apiKeys[0].tokenHash).toBe(createHash("sha256").update(first.apiKey).digest("hex"));
      expect(saved.apiKeys[0]).not.toHaveProperty("apiKey");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 20000);

  it("emails the API-key owner when billable extra-minute spend exceeds subscription value", async () => {
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
    const otherWorkspaceJob = seedStore.createJob({
      source: "/tmp/other-workspace.mp4",
      plan_id: "creator",
      workspace_id: "ws_other_spend",
      owner_email: "other@example.com",
      included_minutes: 1,
      plan_price_cents: 100
    });
    seedStore.appendUsage(otherWorkspaceJob.jobId, 2400, currentTestBillingPeriod(), {
      planId: "creator",
      workspaceId: "ws_other_spend",
      ownerEmail: "other@example.com",
      includedMinutes: 1,
      observedTotalCogsCents: 0
    });
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
      expect(sentEmails[0].body.text).toContain("Billable extra-minute spend: 156.00 USD");
      expect(sentEmails[0].body.text).toContain("Overage rate: 0.12 USD/min");
      expect(sentEmails[0].body.text).toContain("Minutes used: 1301");
      expect(sentEmails[0].body.text).not.toContain("3701");

      const saved = JSON.parse(readFileSync(storePath, "utf8"));
      expect(saved.spendAlerts).toHaveLength(1);
      expect(saved.spendAlerts[0]).toMatchObject({
        workspaceId: "ws_spend",
        ownerEmail: "owner@example.com",
        planId: "creator",
        status: "sent",
        provider: "resend",
        providerMessageId: "email_test_123",
        overageRevenueCents: 15600,
        overageRateCentsPerMinute: 12
      });

      const alertsResponse = await fetch(`http://127.0.0.1:${port}/v1/spend-alerts?workspace_id=ws_spend`, {
        headers: { authorization: `Bearer ${adminKey}` }
      });
      const alerts = await alertsResponse.json();
      expect(alertsResponse.status).toBe(200);
      expect(alerts.spendAlerts).toHaveLength(1);
      expect(alerts.spendAlerts[0]).toMatchObject({
        workspaceId: "ws_spend",
        ownerEmail: "owner@example.com",
        status: "sent",
        provider: "resend"
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
