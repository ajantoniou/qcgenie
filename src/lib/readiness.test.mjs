import { describe, expect, it } from "vitest";
import { buildReadinessReport } from "../../readiness.mjs";

const strongSecret = "a".repeat(64);

describe("launch readiness report", () => {
  it("marks Product Hunt readiness false when launch-critical env is missing", () => {
    const report = buildReadinessReport({
      host: "qcgenie-api.onrender.com",
      env: {
        UPLOADCHECK_API_KEY_SHA256: "hash",
        UPLOADCHECK_BUNDLED_DEMO_CLIP_PATH: "/tmp/does-not-exist-uploadcheck-demo.mp4"
      },
      now: "2026-06-06T00:00:00.000Z"
    });

    expect(report.readyForProductHunt).toBe(false);
    expect(report.checks.api.ok).toBe(true);
    expect(report.checks.apiAuth.ok).toBe(true);
    expect(report.checks.checkout.ok).toBe(false);
    expect(report.checks.customDomain.ok).toBe(false);
    expect(report.checks.persistence.mode).toBe("json_store");
    expect(report.checks.storage.mode).toBe("render_temp_storage");
    expect(report.checks.demoClip.ok).toBe(false);
  });

  it("marks Product Hunt readiness true when launch-critical env is configured", () => {
    const report = buildReadinessReport({
      host: "api.uploadcheck.app",
      env: {
        UPLOADCHECK_CREATOR_CHECKOUT_URL: "https://checkout.example/creator",
        UPLOADCHECK_STUDIO_CHECKOUT_URL: "https://checkout.example/studio",
        UPLOADCHECK_NETWORK_CHECKOUT_URL: "https://checkout.example/network",
        UPLOADCHECK_SECRET_ENCRYPTION_KEY: strongSecret,
        UPLOADCHECK_API_KEY_SHA256: "hash",
        UPLOADCHECK_STORE_PATH: "/mnt/uploadcheck-data/store.json",
        UPLOADCHECK_DURABLE_STORAGE_DIR: "/mnt/uploadcheck-storage",
        UPLOADCHECK_DEMO_CLIP_URL: "https://uploadcheck.app/demo.mp4"
      },
      now: "2026-06-06T00:00:00.000Z"
    });

    expect(report.readyForProductHunt).toBe(true);
    expect(report.checks.checkout.plans.creator.configured).toBe(true);
    expect(report.checks.customDomain.ok).toBe(true);
    expect(report.checks.secretEncryption.ok).toBe(true);
    expect(report.checks.persistence.mode).toBe("durable_json_store");
    expect(report.checks.storage.mode).toBe("durable_filesystem");
    expect(report.checks.demoClip.ok).toBe(true);
  });

  it("requires API auth for Product Hunt readiness", () => {
    const report = buildReadinessReport({
      host: "api.uploadcheck.app",
      env: {
        UPLOADCHECK_CREATOR_CHECKOUT_URL: "https://checkout.example/creator",
        UPLOADCHECK_STUDIO_CHECKOUT_URL: "https://checkout.example/studio",
        UPLOADCHECK_NETWORK_CHECKOUT_URL: "https://checkout.example/network",
        UPLOADCHECK_SECRET_ENCRYPTION_KEY: strongSecret,
        UPLOADCHECK_STORE_PATH: "/mnt/uploadcheck-data/store.json",
        UPLOADCHECK_DURABLE_STORAGE_DIR: "/mnt/uploadcheck-storage",
        UPLOADCHECK_DEMO_CLIP_URL: "https://uploadcheck.app/demo.mp4"
      },
      now: "2026-06-06T00:00:00.000Z"
    });

    expect(report.checks.apiAuth.ok).toBe(false);
    expect(report.checks.productHunt.required).toContain("apiAuth");
    expect(report.readyForProductHunt).toBe(false);
  });

  it("does not accept weak webhook encryption keys as launch-ready", () => {
    const report = buildReadinessReport({
      host: "api.uploadcheck.app",
      env: {
        UPLOADCHECK_SECRET_ENCRYPTION_KEY: "secret",
        UPLOADCHECK_BUNDLED_DEMO_CLIP_PATH: "/tmp/does-not-exist-uploadcheck-demo.mp4"
      },
      now: "2026-06-06T00:00:00.000Z"
    });

    expect(report.checks.secretEncryption).toMatchObject({ ok: false, reason: "too_short" });
  });

  it("does not accept incomplete object storage env as launch-ready storage", () => {
    const report = buildReadinessReport({
      host: "api.uploadcheck.app",
      env: {
        UPLOADCHECK_STORAGE_BUCKET: "uploadcheck-artifacts",
        UPLOADCHECK_BUNDLED_DEMO_CLIP_PATH: "/tmp/does-not-exist-uploadcheck-demo.mp4"
      },
      now: "2026-06-06T00:00:00.000Z"
    });

    expect(report.checks.storage.ok).toBe(false);
    expect(report.checks.storage.mode).toBe("render_temp_storage");
    expect(report.checks.storage.objectStorage).toMatchObject({
      bucketConfigured: true,
      endpointConfigured: false,
      accessKeyConfigured: false,
      secretKeyConfigured: false
    });
  });

  it("reports complete object storage env separately from mounted filesystem storage", () => {
    const report = buildReadinessReport({
      host: "api.uploadcheck.app",
      env: {
        UPLOADCHECK_STORAGE_BUCKET: "uploadcheck-artifacts",
        UPLOADCHECK_STORAGE_ENDPOINT: "https://r2.example",
        UPLOADCHECK_STORAGE_ACCESS_KEY_ID: "key",
        UPLOADCHECK_STORAGE_SECRET_ACCESS_KEY: "secret",
        UPLOADCHECK_BUNDLED_DEMO_CLIP_PATH: "/tmp/does-not-exist-uploadcheck-demo.mp4"
      },
      now: "2026-06-06T00:00:00.000Z"
    });

    expect(report.checks.storage.ok).toBe(true);
    expect(report.checks.storage.mode).toBe("object_storage_configured");
    expect(report.checks.storage.objectStorage.configured).toBe(true);
  });

  it("keeps Supabase as the preferred persistence mode when configured", () => {
    const report = buildReadinessReport({
      host: "api.uploadcheck.app",
      env: {
        SUPABASE_URL: "https://supabase.example",
        SUPABASE_SERVICE_ROLE_KEY: "role",
        UPLOADCHECK_STORE_PATH: "/mnt/uploadcheck-data/store.json",
        UPLOADCHECK_BUNDLED_DEMO_CLIP_PATH: "/tmp/does-not-exist-uploadcheck-demo.mp4"
      },
      now: "2026-06-06T00:00:00.000Z"
    });

    expect(report.checks.persistence.ok).toBe(true);
    expect(report.checks.persistence.mode).toBe("supabase_configured");
  });

  it("accepts a bundled public demo clip as demo proof", () => {
    const report = buildReadinessReport({
      host: "api.uploadcheck.app",
      env: {
        UPLOADCHECK_BUNDLED_DEMO_CLIP_PATH: "public/demo/uploadcheck-product-hunt-demo.mp4"
      },
      now: "2026-06-06T00:00:00.000Z"
    });

    expect(report.checks.demoClip.ok).toBe(true);
  });
});
