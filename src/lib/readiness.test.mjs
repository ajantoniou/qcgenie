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

    expect(report.contractVersion).toBe("2026-06-06.render-web-proof");
    expect(report.readyForProductHunt).toBe(false);
    expect(report.checks.api.ok).toBe(true);
    expect(report.checks.apiAuth.ok).toBe(true);
    expect(report.checks.renderMediaIngress).toMatchObject({
      ok: true,
      modes: {
        inlineEphemeral: {
          ok: true,
          accepts: expect.arrayContaining(["video_base64", "audio_base64", "media_base64", "data_url"]),
          storageMode: "render_temp_storage",
          asyncSupported: false
        },
        signedUpload: {
          ok: true,
          endpoint: "POST /v1/uploads + PUT signedPutUrl + POST /v1/qc/jobs upload_id"
        }
      }
    });
    expect(report.checks.checkout.ok).toBe(false);
    expect(report.checks.checkout.plans.creator).toMatchObject({
      ok: false,
      configured: false,
      source: "missing",
      reason: "missing",
      host: null,
      redactedUrl: null
    });
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
    expect(report.contractVersion).toBe("2026-06-06.render-web-proof");
    expect(report.checks.checkout.plans.creator).toMatchObject({
      ok: true,
      configured: true,
      secure: true,
      source: "direct_url",
      sourceKey: "UPLOADCHECK_CREATOR_CHECKOUT_URL",
      host: "checkout.example",
      redactedUrl: "https://checkout.example<checkout_path>"
    });
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

  it("redacts Lemon Squeezy checkout variant ids in readiness output", () => {
    const report = buildReadinessReport({
      host: "api.uploadcheck.app",
      env: {
        UPLOADCHECK_LEMONSQUEEZY_STORE_SLUG: "uploadcheck",
        UPLOADCHECK_CREATOR_VARIANT_ID: "111",
        UPLOADCHECK_STUDIO_VARIANT_ID: "222",
        UPLOADCHECK_NETWORK_VARIANT_ID: "333",
        UPLOADCHECK_BUNDLED_DEMO_CLIP_PATH: "/tmp/does-not-exist-uploadcheck-demo.mp4"
      },
      now: "2026-06-06T00:00:00.000Z"
    });

    expect(report.checks.checkout.ok).toBe(true);
    expect(report.checks.checkout.plans.creator).toMatchObject({
      ok: true,
      configured: true,
      secure: true,
      source: "lemonsqueezy_variant",
      sourceKey: "UPLOADCHECK_LEMONSQUEEZY_STORE_SLUG+UPLOADCHECK_CREATOR_VARIANT_ID",
      host: "uploadcheck.lemonsqueezy.com",
      redactedUrl: "https://uploadcheck.lemonsqueezy.com/checkout/buy/<variant_id>"
    });
    expect(JSON.stringify(report)).not.toContain("111");
    expect(JSON.stringify(report)).not.toContain("222");
    expect(JSON.stringify(report)).not.toContain("333");
  });

  it("does not let Studio checkout config satisfy missing Creator readiness", () => {
    const report = buildReadinessReport({
      host: "api.uploadcheck.app",
      env: {
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

    expect(report.checks.checkout.ok).toBe(false);
    expect(report.checks.checkout.plans.creator).toMatchObject({
      ok: false,
      configured: false,
      source: "missing",
      sourceKey: null,
      host: null,
      redactedUrl: null
    });
    expect(report.checks.checkout.plans.studio).toMatchObject({
      ok: true,
      configured: true,
      sourceKey: "UPLOADCHECK_STUDIO_CHECKOUT_URL"
    });
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

  it("does not accept non-HTTPS checkout URLs as launch-ready", () => {
    const report = buildReadinessReport({
      host: "api.uploadcheck.app",
      env: {
        UPLOADCHECK_CREATOR_CHECKOUT_URL: "http://checkout.example/creator",
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

    expect(report.checks.checkout.ok).toBe(false);
    expect(report.checks.checkout.plans.creator).toMatchObject({
      configured: true,
      ok: false,
      secure: false,
      reason: "checkout_url_must_be_https"
    });
    expect(report.readyForProductHunt).toBe(false);
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

  it("does not accept Supabase env as launch-ready persistence until the server adapter ships", () => {
    const report = buildReadinessReport({
      host: "api.uploadcheck.app",
      env: {
        SUPABASE_URL: "https://supabase.example",
        SUPABASE_SERVICE_ROLE_KEY: "role",
        UPLOADCHECK_BUNDLED_DEMO_CLIP_PATH: "/tmp/does-not-exist-uploadcheck-demo.mp4"
      },
      now: "2026-06-06T00:00:00.000Z"
    });

    expect(report.checks.persistence.ok).toBe(false);
    expect(report.checks.persistence.mode).toBe("json_store");
    expect(report.checks.persistence.supabaseEnvPresent).toBe(true);
    expect(report.checks.persistence.detail).toContain("current server still uses JsonStore");
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
