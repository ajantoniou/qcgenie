import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
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
    expect(summary.persistence.writableProbe.checked).toBe(false);
  });

  it("can probe writable mounted-style persistence and storage paths when explicitly enabled", () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-storage-probe-"));

    try {
      const summary = buildStorageSummary({
        UPLOADCHECK_STORE_PATH: join(dir, "store.json"),
        UPLOADCHECK_DURABLE_STORAGE_DIR: join(dir, "uploads"),
        UPLOADCHECK_STORAGE_PROBE: "1"
      }, {
        durablePathPrefixes: [dir]
      });
      const text = formatStorageSummary(summary);

      expect(summary.ok).toBe(true);
      expect(summary.persistence.writableProbe).toMatchObject({ checked: true, ok: true });
      expect(summary.storage.writableProbe).toMatchObject({ checked: true, ok: true });
      expect(text).toContain("writableProbe: pass");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("fails the explicit filesystem probe when durable paths cannot be written", () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-storage-probe-fail-"));
    const blocker = join(dir, "not-a-dir");

    try {
      writeFileSync(blocker, "this path is intentionally a file");
      const summary = buildStorageSummary({
        UPLOADCHECK_STORE_PATH: join(blocker, "store.json"),
        UPLOADCHECK_DURABLE_STORAGE_DIR: join(blocker, "uploads")
      }, {
        probeFilesystem: true,
        durablePathPrefixes: [dir]
      });
      const text = formatStorageSummary(summary);

      expect(summary.ok).toBe(false);
      expect(summary.persistence.writableProbe.checked).toBe(true);
      expect(summary.persistence.writableProbe.ok).toBe(false);
      expect(summary.storage.writableProbe.checked).toBe(true);
      expect(summary.storage.writableProbe.ok).toBe(false);
      expect(text).toContain("writableProbe: fail");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("does not pass persistence on Supabase env alone before the server adapter exists", () => {
    const summary = buildStorageSummary({
      SUPABASE_URL: "https://supabase.example",
      SUPABASE_SERVICE_ROLE_KEY: "role"
    });
    const text = formatStorageSummary(summary);

    expect(summary.ok).toBe(false);
    expect(summary.persistence.mode).toBe("json_store");
    expect(summary.persistence.supabaseEnvPresent).toBe(true);
    expect(text).toContain("supabaseStatus: env_present_but_json_store_adapter_active");
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
