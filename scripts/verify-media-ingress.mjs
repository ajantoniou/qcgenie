#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = process.cwd();
const tempDir = mkdtempSync(join(tmpdir(), "uploadcheck-media-ingress-"));
const port = 21000 + Math.floor(Math.random() * 2000);
const hostedBaseUrl = normalizeBaseUrl(process.env.UPLOADCHECK_MEDIA_INGRESS_BASE_URL || process.env.UPLOADCHECK_API_BASE_URL || "");
const hostedMode = Boolean(hostedBaseUrl);
const apiKey = hostedMode
  ? (process.env.UPLOADCHECK_API_KEY || process.env.QCGENIE_API_KEY || "")
  : `uck_media_ingress_${randomBytes(8).toString("hex")}`;
let server = null;

try {
  if (hostedMode && !apiKey) {
    throw new Error("Set UPLOADCHECK_API_KEY when UPLOADCHECK_MEDIA_INGRESS_BASE_URL is set.");
  }

  if (!hostedMode) {
    server = spawn("node", ["server.mjs"], {
      cwd: root,
      env: {
        ...process.env,
        PORT: String(port),
        UPLOADCHECK_API_KEY: apiKey,
        UPLOADCHECK_STORE_PATH: join(tempDir, "store.json"),
        UPLOADCHECK_UPLOAD_DIR: join(tempDir, "uploads"),
        UPLOADCHECK_DURABLE_STORAGE_DIR: join(tempDir, "uploads"),
        UPLOADCHECK_INLINE_MEDIA_MAX_MB: "1",
        UPLOADCHECK_MAX_UPLOAD_MB: "1",
        UPLOADCHECK_BUNDLED_DEMO_CLIP_PATH: "public/demo/uploadcheck-product-hunt-demo.mp4"
      },
      stdio: ["ignore", "pipe", "pipe"]
    });
  }

  const baseUrl = hostedMode ? hostedBaseUrl : `http://127.0.0.1:${port}`;
  await waitForHealth(baseUrl);

  const inlineVideo = await postJson(baseUrl, "/v1/qc/jobs", apiKey, {
    media_base64: Buffer.from("fake-mp4").toString("base64"),
    media_content_type: "video/mp4",
    media_kind: "video",
    filename: "inline-smoke.mp4",
    checks: "canvas_fill",
    cost_guardrail: "downgrade"
  });
  assertStatus(inlineVideo, 202, "inline video job");
  assertMediaIngress(inlineVideo.payload, {
    mode: "inline_ephemeral",
    contentType: "video/mp4",
    bytes: 8,
    sha256: sha256("fake-mp4"),
    ephemeral: true,
    allowedStorageModes: ["render_temp_storage"]
  }, "inline video");

  const inlineAudio = await postJson(baseUrl, "/v1/qc/jobs", apiKey, {
    audio_base64: Buffer.from("fake-wav").toString("base64"),
    audio_content_type: "audio/wav",
    filename: "inline-smoke.wav",
    checks: "dead_air",
    cost_guardrail: "downgrade"
  });
  assertStatus(inlineAudio, 202, "inline audio job");
  assertMediaIngress(inlineAudio.payload, {
    mode: "inline_ephemeral",
    contentType: "audio/wav",
    bytes: 8,
    sha256: sha256("fake-wav"),
    ephemeral: true,
    allowedStorageModes: ["render_temp_storage"]
  }, "inline audio");

  const signedUpload = await postJson(baseUrl, "/v1/uploads", apiKey, {
    filename: "large-smoke.wav",
    content_type: "audio/wav",
    size_bytes: 4096
  });
  assertStatus(signedUpload, 201, "signed upload reservation");
  const uploadBytes = Buffer.alloc(4096, 7);
  const putResponse = await fetch(signedUpload.payload.signedPutUrl, {
    method: "PUT",
    headers: {
      "content-type": "audio/wav",
      "content-length": String(uploadBytes.length)
    },
    body: uploadBytes
  });
  if (!putResponse.ok) throw new Error(`signed upload PUT failed: ${putResponse.status} ${await putResponse.text()}`);

  const signedJob = await postJson(baseUrl, "/v1/qc/jobs", apiKey, {
    upload_id: signedUpload.payload.uploadId,
    checks: "dead_air",
    cost_guardrail: "downgrade"
  });
  assertStatus(signedJob, 202, "signed upload job");
  assertMediaIngress(signedJob.payload, {
    mode: "signed_upload",
    contentType: "audio/wav",
    bytes: 4096,
    sha256: sha256(uploadBytes),
    ephemeral: false,
    allowedStorageModes: ["render_temp_storage", "durable_filesystem", "object_storage"]
  }, "signed upload");

  console.log(JSON.stringify({
    ok: true,
    mode: hostedMode ? "hosted" : "local",
    baseUrl,
    checked: ["inline_video_base64", "inline_audio_base64", "signed_upload"],
    inlineStorageMode: inlineVideo.payload.mediaIngress.storageMode,
    signedUploadStorageMode: signedJob.payload.mediaIngress.storageMode
  }, null, 2));
} finally {
  if (server && server.exitCode === null) {
    server.kill("SIGTERM");
    await new Promise((resolve) => server.once("exit", resolve));
  }
  rmSync(tempDir, { recursive: true, force: true });
}

async function waitForHealth(baseUrl) {
  const started = Date.now();
  while (Date.now() - started < 10000) {
    try {
      const response = await fetch(`${baseUrl}/healthz`);
      if (response.ok) return;
    } catch {
      await delay(100);
    }
  }
  throw new Error(`UploadCheck server did not become healthy on ${baseUrl}.${await serverOutput()}`);
}

async function postJson(baseUrl, path, key, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${key}`
    },
    body: JSON.stringify(body)
  });
  const payload = await response.json();
  return { status: response.status, payload };
}

function assertStatus(result, expected, label) {
  if (result.status !== expected) {
    throw new Error(`${label} expected HTTP ${expected}, got ${result.status}: ${JSON.stringify(result.payload)}`);
  }
}

function assertMediaIngress(payload, expected, label) {
  const ingress = payload.mediaIngress || {};
  const expectedShape = { ...expected };
  const allowedStorageModes = expectedShape.allowedStorageModes || [];
  delete expectedShape.allowedStorageModes;
  const actualShape = { ...ingress };
  delete actualShape.storageMode;
  if (JSON.stringify(actualShape) !== JSON.stringify(expectedShape)) {
    throw new Error(`${label} mediaIngress mismatch.\nExpected: ${JSON.stringify(expectedShape)}\nActual:   ${JSON.stringify(actualShape)}`);
  }
  if (!allowedStorageModes.includes(ingress.storageMode)) {
    throw new Error(`${label} storageMode ${JSON.stringify(ingress.storageMode)} is not one of ${allowedStorageModes.join(", ")}.`);
  }
  if (!payload.sourceRedacted || payload.source) {
    throw new Error(`${label} must redact temporary/upload source paths.`);
  }
  const text = JSON.stringify(payload);
  if (text.includes("uploadcheck-inline-") || text.includes(tempDir)) {
    throw new Error(`${label} response leaked a temporary filesystem path.`);
  }
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeBaseUrl(value) {
  const trimmed = String(value || "").trim().replace(/\/+$/, "");
  return trimmed.endsWith("/v1") ? trimmed.slice(0, -3) : trimmed;
}

async function serverOutput() {
  const stdout = await readStream(server?.stdout);
  const stderr = await readStream(server?.stderr);
  return ` stdout=${JSON.stringify(stdout)} stderr=${JSON.stringify(stderr)}`;
}

function readStream(stream) {
  return new Promise((resolve) => {
    if (!stream) return resolve("");
    let data = "";
    stream.setEncoding("utf8");
    stream.on("data", (chunk) => {
      data += chunk;
    });
    setTimeout(() => resolve(data), 50);
  });
}
