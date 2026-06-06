import { createServer } from "node:http";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { getObjectStorageConfig, objectKeyForUpload, uploadFileToObjectStorage } from "../../object-storage.mjs";

const servers = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))));
});

describe("object storage adapter", () => {
  it("requires the complete S3-compatible env set", () => {
    expect(getObjectStorageConfig({ UPLOADCHECK_STORAGE_BUCKET: "bucket" })).toMatchObject({
      configured: false,
      bucket: "bucket"
    });
    expect(getObjectStorageConfig({
      UPLOADCHECK_STORAGE_BUCKET: "bucket",
      UPLOADCHECK_STORAGE_ENDPOINT: "https://r2.example",
      UPLOADCHECK_STORAGE_ACCESS_KEY_ID: "key",
      UPLOADCHECK_STORAGE_SECRET_ACCESS_KEY: "secret"
    })).toMatchObject({
      configured: true,
      bucket: "bucket",
      endpoint: "https://r2.example"
    });
  });

  it("uploads a local file with S3-compatible signed PUT", async () => {
    const received = {};
    const server = createServer((req, res) => {
      received.method = req.method;
      received.url = req.url;
      received.authorization = req.headers.authorization;
      const chunks = [];
      req.on("data", (chunk) => chunks.push(chunk));
      req.on("end", () => {
        received.body = Buffer.concat(chunks).toString("utf8");
        res.writeHead(200);
        res.end("ok");
      });
    });
    servers.push(server);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = server.address().port;
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-object-"));
    const filePath = join(dir, "asset.txt");
    writeFileSync(filePath, "video-bytes");

    try {
      const upload = { uploadId: "upl_123", filename: "clip one.mp4" };
      const key = objectKeyForUpload(upload, upload.filename, { UPLOADCHECK_STORAGE_PREFIX: "qc" });
      const result = await uploadFileToObjectStorage(filePath, {
        key,
        contentType: "video/mp4",
        sha256: "00".repeat(32),
        env: {
          UPLOADCHECK_STORAGE_BUCKET: "bucket",
          UPLOADCHECK_STORAGE_ENDPOINT: `http://127.0.0.1:${port}`,
          UPLOADCHECK_STORAGE_ACCESS_KEY_ID: "key",
          UPLOADCHECK_STORAGE_SECRET_ACCESS_KEY: "secret",
          UPLOADCHECK_STORAGE_REGION: "auto",
          UPLOADCHECK_STORAGE_PUBLIC_BASE_URL: "https://cdn.example"
        }
      });

      expect(result).toEqual({
        storageMode: "object_storage",
        objectKey: "qc/upl_123-clip_one.mp4",
        objectUrl: "https://cdn.example/qc/upl_123-clip_one.mp4"
      });
      expect(received).toMatchObject({
        method: "PUT",
        url: "/bucket/qc/upl_123-clip_one.mp4",
        body: "video-bytes"
      });
      expect(received.authorization).toContain("AWS4-HMAC-SHA256");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
