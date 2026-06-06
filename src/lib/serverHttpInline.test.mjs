import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";

const servers = [];

afterEach(async () => {
  for (const server of servers.splice(0)) {
    if (server.exitCode !== null) continue;
    server.kill("SIGTERM");
    await new Promise((resolve) => server.once("exit", resolve));
  }
});

describe("server inline media API", () => {
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
