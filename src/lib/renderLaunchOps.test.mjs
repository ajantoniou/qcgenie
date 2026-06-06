import { describe, expect, it } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { buildEnvTemplate, buildRenderLaunchPlan, summarizePlan } from "../../scripts/render-launch-ops.mjs";

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
    expect(plan.missingSecretInputs).toContain("UPLOADCHECK_API_KEY or UPLOADCHECK_API_KEY_SHA256");
    expect(plan.missingSecretInputs).not.toContain("UPLOADCHECK_STORAGE_ACCESS_KEY_ID");
  });

  it("redacts supplied secret values in summaries", () => {
    const plan = buildRenderLaunchPlan({
      UPLOADCHECK_API_KEY: "secret-api-key",
      UPLOADCHECK_SECRET_ENCRYPTION_KEY: "secret-encryption-key",
      UPLOADCHECK_CREATOR_CHECKOUT_URL: "https://checkout.example/creator",
      UPLOADCHECK_STORAGE_BUCKET: "uploadcheck-artifacts",
      UPLOADCHECK_STORAGE_ENDPOINT: "https://r2.example",
      UPLOADCHECK_STORAGE_ACCESS_KEY_ID: "secret-access-key",
      UPLOADCHECK_STORAGE_SECRET_ACCESS_KEY: "secret-storage-key"
    });
    const summary = summarizePlan(plan);

    expect(JSON.stringify(summary)).not.toContain("secret-api-key");
    expect(JSON.stringify(summary)).not.toContain("secret-encryption-key");
    expect(JSON.stringify(summary)).not.toContain("https://checkout.example/creator");
    expect(JSON.stringify(summary)).not.toContain("secret-access-key");
    expect(JSON.stringify(summary)).not.toContain("secret-storage-key");
    expect(summary.envVars).toContainEqual({ key: "UPLOADCHECK_API_KEY", value: "<provided-secret>" });
    expect(summary.envVars).toContainEqual({ key: "UPLOADCHECK_SECRET_ENCRYPTION_KEY", value: "<provided-secret>" });
    expect(summary.envVars).toContainEqual({ key: "UPLOADCHECK_STORAGE_BUCKET", value: "uploadcheck-artifacts" });
    expect(summary.envVars).toContainEqual({ key: "UPLOADCHECK_STORAGE_ENDPOINT", value: "https://r2.example" });
    expect(summary.envVars).toContainEqual({ key: "UPLOADCHECK_STORAGE_ACCESS_KEY_ID", value: "<provided-secret>" });
    expect(summary.envVars).toContainEqual({ key: "UPLOADCHECK_STORAGE_SECRET_ACCESS_KEY", value: "<provided-secret>" });
  });

  it("treats API plaintext and hashed keys as either-or launch auth inputs", () => {
    const plan = buildRenderLaunchPlan({
      UPLOADCHECK_API_KEY_SHA256: "hash",
      UPLOADCHECK_CREATOR_CHECKOUT_URL: "https://checkout.example/creator",
      UPLOADCHECK_STUDIO_CHECKOUT_URL: "https://checkout.example/studio",
      UPLOADCHECK_NETWORK_CHECKOUT_URL: "https://checkout.example/network",
      UPLOADCHECK_SECRET_ENCRYPTION_KEY: "secret-encryption-key"
    });

    expect(plan.missingSecretInputs).toEqual([]);
  });

  it("does not treat unfilled template placeholders as launch env inputs", () => {
    const plan = buildRenderLaunchPlan({
      RENDER_API_KEY: "<render_api_key>",
      UPLOADCHECK_API_KEY_SHA256: "<generated_sha256>",
      UPLOADCHECK_CREATOR_CHECKOUT_URL: "https://...",
      UPLOADCHECK_STUDIO_CHECKOUT_URL: "https://...",
      UPLOADCHECK_NETWORK_CHECKOUT_URL: "https://...",
      UPLOADCHECK_SECRET_ENCRYPTION_KEY: "<generated_secret_encryption_key>",
      UPLOADCHECK_STORAGE_BUCKET: "uploadcheck-artifacts",
      UPLOADCHECK_STORAGE_ENDPOINT: "https://...",
      UPLOADCHECK_STORAGE_ACCESS_KEY_ID: "<object_storage_access_key>",
      UPLOADCHECK_STORAGE_SECRET_ACCESS_KEY: "<object_storage_secret_key>"
    });
    const plannedKeys = plan.envVars.map((item) => item.key);

    expect(plannedKeys).not.toContain("UPLOADCHECK_API_KEY_SHA256");
    expect(plannedKeys).not.toContain("UPLOADCHECK_CREATOR_CHECKOUT_URL");
    expect(plannedKeys).not.toContain("UPLOADCHECK_SECRET_ENCRYPTION_KEY");
    expect(plannedKeys).toContain("UPLOADCHECK_STORAGE_BUCKET");
    expect(plannedKeys).not.toContain("UPLOADCHECK_STORAGE_ENDPOINT");
    expect(plannedKeys).not.toContain("UPLOADCHECK_STORAGE_ACCESS_KEY_ID");
    expect(plan.missingSecretInputs).toEqual([
      "UPLOADCHECK_API_KEY or UPLOADCHECK_API_KEY_SHA256",
      "UPLOADCHECK_CREATOR_CHECKOUT_URL",
      "UPLOADCHECK_STUDIO_CHECKOUT_URL",
      "UPLOADCHECK_NETWORK_CHECKOUT_URL",
      "UPLOADCHECK_SECRET_ENCRYPTION_KEY"
    ]);
    expect(plan.placeholderInputs).toEqual(expect.arrayContaining([
      "RENDER_API_KEY",
      "UPLOADCHECK_API_KEY_SHA256",
      "UPLOADCHECK_CREATOR_CHECKOUT_URL",
      "UPLOADCHECK_STORAGE_ENDPOINT",
      "UPLOADCHECK_STORAGE_ACCESS_KEY_ID"
    ]));
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

  it("prints a fillable launch env template without requiring a Render API key", () => {
    const output = execFileSync("node", ["scripts/render-launch-ops.mjs", "env-template"], {
      encoding: "utf8",
      env: { ...process.env, RENDER_API_KEY: "" }
    });

    expect(output).toContain("RENDER_API_KEY=\"<render_api_key>\"");
    expect(output).toContain("UPLOADCHECK_API_KEY_SHA256=\"<generated_sha256>\"");
    expect(output).toContain("UPLOADCHECK_SECRET_ENCRYPTION_KEY=\"<generated_secret_encryption_key>\"");
    expect(output).toContain("UPLOADCHECK_STORE_PATH=\"/mnt/uploadcheck/store.json\"");
    expect(output).toContain("Do not commit a filled copy.");
    expect(output).not.toContain(process.env.RENDER_API_KEY || "render-secret-never-present");
  });

  it("keeps the env template aligned with fixed Render launch env values", () => {
    const template = buildEnvTemplate();
    const plan = buildRenderLaunchPlan({});

    for (const item of plan.envVars.filter((env) => !env.secret)) {
      expect(template).toContain(`${item.key}=${JSON.stringify(item.value)}`);
    }
  });

  it("requires a Render API key for audit operations", () => {
    const result = spawnSync("node", ["scripts/render-launch-ops.mjs", "audit"], {
      encoding: "utf8",
      env: { ...process.env, RENDER_API_KEY: "" }
    });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("Set a real RENDER_API_KEY");
  });

  it("rejects an unfilled Render API key placeholder for audit operations", () => {
    const result = spawnSync("node", ["scripts/render-launch-ops.mjs", "audit"], {
      encoding: "utf8",
      env: { ...process.env, RENDER_API_KEY: "<render_api_key>" }
    });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("Set a real RENDER_API_KEY");
  });
});
