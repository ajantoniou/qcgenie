import { describe, expect, it } from "vitest";
import { buildReadinessActions, formatReadinessSummary } from "../../readiness-actions.mjs";

describe("readiness action mapping", () => {
  it("maps failed launch checks to concrete deployment actions", () => {
    const report = {
      generatedAt: "2026-06-06T00:00:00.000Z",
      readyForProductHunt: false,
      checks: {
        checkout: { ok: false, plans: { creator: { configured: false }, studio: { configured: true, ok: true }, network: { configured: false } } },
        checkoutWebhook: { ok: false },
        customDomain: { ok: false, host: "qcgenie-api.onrender.com" },
        secretEncryption: { ok: false, reason: "missing" },
        apiAuth: { ok: true },
        persistence: { ok: false, mode: "json_store" },
        storage: {
          ok: false,
          mode: "render_temp_storage",
          objectStorage: {
            bucketConfigured: true,
            endpointConfigured: false,
            accessKeyConfigured: false,
            secretKeyConfigured: false
          }
        },
        demoClip: { ok: true },
        productHunt: { ok: false }
      }
    };

    const actions = buildReadinessActions(report);

    expect(actions.map((action) => action.id)).toEqual([
      "render-env-template",
      "checkout",
      "custom-domain",
      "checkout-webhook",
      "secret-encryption",
      "persistence",
      "storage"
    ]);
    expect(actions[0].commands).toContain("npm run --silent render:bootstrap-env > /tmp/uploadcheck-render-launch.env");
    expect(actions[0].commands).toContain("npm run render:validate-env-file -- /tmp/uploadcheck-render-launch.env");
    expect(actions[0].commands).toContain("UPLOADCHECK_CHECKOUT_PROBE=1 npm run launch:checkout");
    expect(actions[0].commands).toContain("UPLOADCHECK_STORAGE_PROBE=1 npm run launch:storage");
    expect(actions[0].commands).toContain("UPLOADCHECK_MEDIA_INGRESS_BASE_URL=https://api.uploadcheck.app UPLOADCHECK_API_KEY=<private_bearer> npm run media-ingress:verify");
    expect(actions[1].env).toContain("UPLOADCHECK_CREATOR_CHECKOUT_URL");
    expect(actions[1].command).toBe("UPLOADCHECK_CHECKOUT_PROBE=1 npm run launch:checkout");
    expect(actions.find((action) => action.id === "checkout-webhook").env).toEqual(["UPLOADCHECK_LEMONSQUEEZY_WEBHOOK_SECRET"]);
    expect(actions.find((action) => action.id === "secret-encryption").command).toBe("npm run --silent render:bootstrap-env");
    expect(actions.find((action) => action.id === "persistence").env).toEqual(["UPLOADCHECK_STORE_PATH=/mnt/uploadcheck/store.json"]);
    expect(actions.find((action) => action.id === "persistence").detail).toContain("Supabase env alone is not launch-ready");
    expect(actions.find((action) => action.id === "storage").env.join(" ")).toContain("UPLOADCHECK_STORAGE_ENDPOINT");
    expect(actions.find((action) => action.id === "storage").env.join(" ")).toContain("UPLOADCHECK_STORAGE_SECRET_ACCESS_KEY");
    expect(actions.find((action) => action.id === "storage").command).toBe("UPLOADCHECK_STORAGE_PROBE=1 npm run launch:storage");
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
    }, [{ title: "Move job persistence off temp storage", detail: "Set mounted store path.", commands: ["npm run render:plan"], env: ["UPLOADCHECK_STORE_PATH=/mnt/uploadcheck/store.json"] }]);

    expect(text).toContain("UploadCheck readiness: NOT READY");
    expect(text).toContain("PASS api");
    expect(text).toContain("BLOCK persistence (json_store)");
    expect(text).toContain("commands:\n    npm run render:plan");
    expect(text).toContain("UPLOADCHECK_STORE_PATH=/mnt/uploadcheck/store.json");
  });

  it("maps missing API auth to the safe hash generator command", () => {
    const actions = buildReadinessActions({
      checks: {
        apiAuth: { ok: false },
        productHunt: { ok: false }
      }
    });

    expect(actions).toEqual([{
      id: "render-env-template",
      title: "Prepare Render launch env",
      detail: "Generate and fill the local env template for apiAuth before render:apply.",
      commands: [
        "npm run --silent render:bootstrap-env > /tmp/uploadcheck-render-launch.env",
        "npm run render:validate-env-file -- /tmp/uploadcheck-render-launch.env",
        "set -a; source /tmp/uploadcheck-render-launch.env; set +a",
        "npm run render:plan && npm run render:validate-env && npm run render:apply",
        "UPLOADCHECK_CHECKOUT_PROBE=1 npm run launch:checkout",
        "UPLOADCHECK_STORAGE_PROBE=1 npm run launch:storage",
        "UPLOADCHECK_MEDIA_INGRESS_BASE_URL=https://api.uploadcheck.app UPLOADCHECK_API_KEY=<private_bearer> npm run media-ingress:verify"
      ],
      docs: "docs/DEPLOYMENT-CUTOVER.md"
    }, {
      id: "api-auth",
      title: "Configure API auth",
      detail: "Generate an UploadCheck bearer key and set the SHA-256 hash on Render before public API use.",
      command: "npm run --silent api-key:generate",
      env: ["UPLOADCHECK_API_KEY_SHA256", "or UPLOADCHECK_API_KEY for bootstrapping only"]
    }]);
  });
});
