import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildLaunchStatus } from "../../launch-status.mjs";
import { buildReadinessReport } from "../../readiness.mjs";

function readJson(path) {
  return JSON.parse(readFileSync(resolve(path), "utf8"));
}

describe("public launch status", () => {
  it("publishes the current Product Hunt go/no-go state and blockers", () => {
    const status = readJson("public/launch-status.json");

    expect(status.product_hunt_ready).toBe(false);
    expect(status.status).toMatchObject({
      api: "pass",
      agent_preflight: "pass",
      api_auth: "pass",
      demo_clip: "pass",
      checkout: "blocked",
      custom_domain: "blocked",
      secret_encryption: "blocked",
      persistence: "blocked",
      storage: "blocked"
    });
    expect(status.remaining_blockers.map((blocker) => blocker.id)).toEqual([
      "checkout",
      "custom_domain",
      "secret_encryption",
      "persistence",
      "storage"
    ]);
    expect(status.operator_commands).toEqual(expect.arrayContaining([
      "npm run --silent render:bootstrap-env > /tmp/uploadcheck-render-launch.env",
      "npm run codex:verify-install",
      "npm run cost-basis:verify",
      "npm run roadmap:verify",
      "npm run render:validate-env",
      "npm run launch:check",
      "npm run readiness:check"
    ]));
    expect(status.verified_controls.find((control) => control.id === "codex_mcp")?.evidence).toContain("codex:verify-install");
    expect(status.verified_controls.find((control) => control.id === "cost_basis")?.evidence).toContain("cost-basis:verify");
    expect(status.verified_controls.find((control) => control.id === "roadmap")?.evidence).toContain("roadmap:verify");
    expect(status.verified_controls.find((control) => control.id === "sample_reports")?.evidence).toContain("PASS, WATCH, and BLOCK");
    expect(status.verified_controls.find((control) => control.id === "product_hunt_launch_kit")?.evidence).toContain("product-hunt-launch-kit.json");
    expect(status.verified_controls.find((control) => control.id === "billing_enforcement")?.evidence).toContain("AI-review seconds");
    expect(status.verified_controls.find((control) => control.id === "abuse_limits")?.evidence).toContain("active_job_limit_exceeded");
    expect(status.verified_controls.find((control) => control.id === "job_observability")?.evidence).toContain("processingDurationMs");
    expect(status.verified_controls.find((control) => control.id === "queued_worker")?.evidence).toContain("/v1/qc/jobs/drain");
    expect(status.go_no_go_rule).toContain("readyForProductHunt=true");
  });

  it("links launch status from public agent metadata", () => {
    const manifest = readJson("public/agent-manifest.json");
    const openapi = readJson("public/openapi.json");

    expect(manifest.launch_status_url).toBe("https://qcgenie-api.onrender.com/launch-status.json");
    expect(manifest.live_launch_status_url).toBe("https://qcgenie-api.onrender.com/v1/launch-status");
    expect(openapi.paths["/launch-status.json"].get.security).toEqual([]);
    expect(openapi.paths["/v1/launch-status"].get.security).toEqual([]);
  });

  it("builds live launch status from readiness checks", () => {
    const readiness = buildReadinessReport({
      host: "api.uploadcheck.app",
      env: {
        UPLOADCHECK_API_KEY_SHA256: "a".repeat(64),
        UPLOADCHECK_CREATOR_CHECKOUT_URL: "https://checkout.example/creator",
        UPLOADCHECK_STUDIO_CHECKOUT_URL: "https://checkout.example/studio",
        UPLOADCHECK_NETWORK_CHECKOUT_URL: "https://checkout.example/network",
        UPLOADCHECK_SECRET_ENCRYPTION_KEY: "b".repeat(64),
        UPLOADCHECK_STORE_PATH: "/mnt/uploadcheck/store.json",
        UPLOADCHECK_DURABLE_STORAGE_DIR: "/mnt/uploadcheck/uploads",
        UPLOADCHECK_BUNDLED_DEMO_CLIP_PATH: "public/demo/uploadcheck-product-hunt-demo.mp4"
      },
      now: "2026-06-06T00:00:00.000Z"
    });
    const status = buildLaunchStatus(readiness, { generatedFrom: "test readiness", lastVerifiedDate: "2026-06-06" });

    expect(status.product_hunt_ready).toBe(true);
    expect(Object.values(status.status).every((value) => value === "pass")).toBe(true);
    expect(status.remaining_blockers).toEqual([]);
    expect(status.public_artifacts.live_launch_status).toBe("https://qcgenie-api.onrender.com/v1/launch-status");
    expect(status.public_artifacts.sample_reports).toBe("https://qcgenie-api.onrender.com/sample-reports/index.json");
    expect(status.public_artifacts.product_hunt_launch_kit).toBe("https://qcgenie-api.onrender.com/product-hunt-launch-kit.json");
  });

  it("verifies launch status against readiness and discovery metadata", () => {
    const output = execFileSync("npm", ["run", "--silent", "launch-status:verify"], {
      cwd: resolve("."),
      encoding: "utf8"
    });

    expect(output).toContain("Launch status metadata matches readiness");
  });
});
