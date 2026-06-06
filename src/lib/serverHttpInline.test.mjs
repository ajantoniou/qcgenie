import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
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
      expect(payload.product_hunt_ready).toBe(false);
      expect(payload.status.api_auth).toBe("pass");
      expect(payload.status.checkout).toBe("blocked");
      expect(payload.remaining_blockers.map((blocker) => blocker.id)).toContain("checkout");
      expect(payload.public_artifacts.live_launch_status).toBe("https://qcgenie-api.onrender.com/v1/launch-status");
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
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 20000);

  it("rejects declared jobs that exceed included plan minutes", async () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-http-usage-limit-"));
    const storePath = join(dir, "store.json");
    const apiKey = "uck_test_usage_limit";
    const seedStore = new JsonStore(storePath);
    const seededJob = seedStore.createJob({ source: "/tmp/previous.mp4", plan_id: "creator", included_minutes: 1200 });
    seedStore.appendUsage(seededJob.jobId, 1199, currentTestBillingPeriod(), { planId: "creator", includedMinutes: 1200 });

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
        includedMinutes: 1200,
        minutesUsed: 1199,
        requestedMinutes: 2,
        minutesRemaining: 1
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
