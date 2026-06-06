import { describe, expect, it } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { buildRenderLaunchPlan, summarizePlan } from "../../scripts/render-launch-ops.mjs";

describe("Render launch operations plan", () => {
  it("builds the launch domain and env plan without requiring secrets", () => {
    const plan = buildRenderLaunchPlan({});

    expect(plan.domains.map((domain) => domain.name)).toEqual([
      "uploadcheck.app",
      "www.uploadcheck.app",
      "api.uploadcheck.app"
    ]);
    expect(plan.envVars).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: "UPLOADCHECK_STORE_PATH", value: "/mnt/uploadcheck/store.json", secret: false }),
      expect.objectContaining({ key: "UPLOADCHECK_DURABLE_STORAGE_DIR", value: "/mnt/uploadcheck/uploads", secret: false })
    ]));
    expect(plan.missingSecretInputs).toContain("UPLOADCHECK_SECRET_ENCRYPTION_KEY");
  });

  it("redacts supplied secret values in summaries", () => {
    const plan = buildRenderLaunchPlan({
      UPLOADCHECK_API_KEY: "secret-api-key",
      UPLOADCHECK_SECRET_ENCRYPTION_KEY: "secret-encryption-key",
      UPLOADCHECK_CREATOR_CHECKOUT_URL: "https://checkout.example/creator"
    });
    const summary = summarizePlan(plan);

    expect(JSON.stringify(summary)).not.toContain("secret-api-key");
    expect(JSON.stringify(summary)).not.toContain("secret-encryption-key");
    expect(JSON.stringify(summary)).not.toContain("https://checkout.example/creator");
    expect(summary.envVars).toContainEqual({ key: "UPLOADCHECK_API_KEY", value: "<provided-secret>" });
    expect(summary.envVars).toContainEqual({ key: "UPLOADCHECK_SECRET_ENCRYPTION_KEY", value: "<provided-secret>" });
  });

  it("prints a redacted plan without requiring a Render API key", () => {
    const output = execFileSync("node", ["scripts/render-launch-ops.mjs", "plan"], {
      encoding: "utf8",
      env: { ...process.env, RENDER_API_KEY: "" }
    });
    const payload = JSON.parse(output);

    expect(payload.domains).toContain("api.uploadcheck.app");
    expect(JSON.stringify(payload)).not.toContain("QCGENIE_API_KEY");
  });

  it("requires a Render API key for audit operations", () => {
    const result = spawnSync("node", ["scripts/render-launch-ops.mjs", "audit"], {
      encoding: "utf8",
      env: { ...process.env, RENDER_API_KEY: "" }
    });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("Set RENDER_API_KEY");
  });
});
