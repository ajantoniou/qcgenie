import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildStorageSummary, formatStorageSummary } from "../../launch-storage.mjs";

describe("launch storage config helper", () => {
  it("blocks default temp persistence and temp upload storage", () => {
    const summary = buildStorageSummary({});
    const text = formatStorageSummary(summary);

    expect(summary.ok).toBe(false);
    expect(summary.persistence.mode).toBe("json_store");
    expect(summary.storage.mode).toBe("render_temp_storage");
    expect(text).toContain("UploadCheck persistence/storage config: NOT READY");
    expect(text).toContain("BLOCK persistence (json_store)");
    expect(text).toContain("BLOCK storage (render_temp_storage)");
  });

  it("passes mounted Render disk persistence and upload storage", () => {
    const summary = buildStorageSummary({
      UPLOADCHECK_STORE_PATH: "/mnt/uploadcheck/store.json",
      UPLOADCHECK_DURABLE_STORAGE_DIR: "/mnt/uploadcheck/uploads"
    });

    expect(summary.ok).toBe(true);
    expect(summary.persistence.mode).toBe("durable_json_store");
    expect(summary.storage.mode).toBe("durable_filesystem");
  });

  it("passes complete object storage without exposing access keys", () => {
    const summary = buildStorageSummary({
      UPLOADCHECK_STORE_PATH: "/mnt/uploadcheck/store.json",
      UPLOADCHECK_STORAGE_BUCKET: "uploadcheck-artifacts",
      UPLOADCHECK_STORAGE_ENDPOINT: "https://r2.example",
      UPLOADCHECK_STORAGE_ACCESS_KEY_ID: "secret-access-key",
      UPLOADCHECK_STORAGE_SECRET_ACCESS_KEY: "secret-storage-key",
      UPLOADCHECK_STORAGE_PUBLIC_BASE_URL: "https://cdn.example",
      UPLOADCHECK_STORAGE_PREFIX: "artifacts/"
    });
    const text = formatStorageSummary(summary);

    expect(summary.ok).toBe(true);
    expect(summary.storage.mode).toBe("object_storage_configured");
    expect(text).toContain("objectStorageEndpointHost: r2.example");
    expect(text).toContain("objectStoragePublicBaseHost: cdn.example");
    expect(text).toContain("accessKey=yes");
    expect(text).toContain("secretKey=yes");
    expect(text).not.toContain("secret-access-key");
    expect(text).not.toContain("secret-storage-key");
  });

  it("prints missing storage env with a failing exit code", () => {
    const result = spawnSync("npm", ["run", "--silent", "launch:storage"], {
      cwd: resolve("."),
      encoding: "utf8",
      env: { PATH: process.env.PATH }
    });

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("UploadCheck persistence/storage config: NOT READY");
    expect(result.stdout).toContain("BLOCK persistence");
    expect(result.stdout).toContain("BLOCK storage");
  });
});
