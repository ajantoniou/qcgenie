import { describe, expect, it } from "vitest";
import { buildReadinessActions, formatReadinessSummary } from "../../readiness-actions.mjs";

describe("readiness action mapping", () => {
  it("maps failed launch checks to concrete deployment actions", () => {
    const report = {
      generatedAt: "2026-06-06T00:00:00.000Z",
      readyForProductHunt: false,
      checks: {
        checkout: { ok: false, plans: { creator: { configured: false }, studio: { configured: true }, network: { configured: false } } },
        customDomain: { ok: false, host: "qcgenie-api.onrender.com" },
        secretEncryption: { ok: false, reason: "missing" },
        apiAuth: { ok: true },
        persistence: { ok: false, mode: "json_store" },
        storage: { ok: false, mode: "render_temp_storage" },
        demoClip: { ok: true },
        productHunt: { ok: false }
      }
    };

    const actions = buildReadinessActions(report);

    expect(actions.map((action) => action.id)).toEqual([
      "checkout",
      "custom-domain",
      "secret-encryption",
      "persistence",
      "storage"
    ]);
    expect(actions[0].env).toContain("UPLOADCHECK_CREATOR_CHECKOUT_URL");
    expect(actions[2].command).toBe("npm run --silent secret:generate");
  });

  it("formats a concise readiness summary", () => {
    const text = formatReadinessSummary({
      generatedAt: "2026-06-06T00:00:00.000Z",
      readyForProductHunt: false,
      checks: {
        api: { ok: true },
        persistence: { ok: false, mode: "json_store" },
        productHunt: { ok: false }
      }
    }, [{ title: "Move job persistence off temp storage", detail: "Set mounted store path.", env: ["UPLOADCHECK_STORE_PATH=/mnt/uploadcheck/store.json"] }]);

    expect(text).toContain("UploadCheck readiness: NOT READY");
    expect(text).toContain("PASS api");
    expect(text).toContain("BLOCK persistence (json_store)");
    expect(text).toContain("UPLOADCHECK_STORE_PATH=/mnt/uploadcheck/store.json");
  });
});
