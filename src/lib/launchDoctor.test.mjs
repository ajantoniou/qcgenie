import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { formatLaunchDoctor, launchDoctorCommandStrings, runLaunchDoctor } from "../../launch-doctor.mjs";

describe("launch doctor", () => {
  it("summarizes passing and blocking launch steps", () => {
    const seen = [];
    const report = runLaunchDoctor({
      steps: [
        { id: "one", label: "First check", command: ["first"] },
        { id: "two", label: "Second check", command: ["second"], env: { UPLOADCHECK_CHECKOUT_PROBE: "1" }, displayEnv: { UPLOADCHECK_API_KEY: "<private_bearer>" } }
      ],
      runner: (command, step) => {
        seen.push([command[0], step.env || null]);
        return command[0] === "first"
          ? { status: 0, stdout: "first ok\n", stderr: "" }
          : { status: 1, stdout: "", stderr: "second failed\n" };
      }
    });
    const text = formatLaunchDoctor(report);

    expect(report.ok).toBe(false);
    expect(report.status).toBe("blocked");
    expect(report.blockers).toEqual(["two"]);
    expect(report.results[0].commandString).toBe("first");
    expect(report.results[1].commandString).toBe("UPLOADCHECK_CHECKOUT_PROBE=1 UPLOADCHECK_API_KEY=<private_bearer> second");
    expect(seen).toEqual([
      ["first", null],
      ["second", { UPLOADCHECK_CHECKOUT_PROBE: "1" }]
    ]);
    expect(text).toContain("UploadCheck launch doctor: NOT READY");
    expect(text).toContain("PASS one - First check");
    expect(text).toContain("BLOCK two - Second check");
    expect(text).toContain("Blockers: two");
  });

  it("returns nonzero in the current unconfigured local launch state", () => {
    const result = spawnSync("npm", ["run", "--silent", "launch:doctor"], {
      cwd: resolve("."),
      encoding: "utf8",
      env: { ...process.env, RENDER_API_KEY: "" }
    });

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("UploadCheck launch doctor: NOT READY");
    expect(result.stdout).toContain("BLOCK checkout");
    expect(result.stdout).toContain("BLOCK checkout-probe");
    expect(result.stdout).toContain("BLOCK storage");
    expect(result.stdout).toContain("BLOCK storage-probe");
    expect(result.stdout).toMatch(/(PASS|BLOCK) render-web-artifacts/);
    for (const hostedStep of [
      "hosted-launch-doctor",
      "hosted-launch-evidence",
      "hosted-cost-basis",
      "hosted-agent-manifest",
      "hosted-pipeline-recipes",
      "hosted-pipeline-handoff",
      "hosted-npo-pipeline-handoff",
      "hosted-openapi",
      "hosted-public-artifacts"
    ]) {
      expect(result.stdout).toMatch(new RegExp(`(PASS|BLOCK) ${hostedStep}`));
    }
    expect(result.stdout).toMatch(/(PASS|BLOCK) hosted-web-artifacts/);
    expect(result.stdout).toContain("BLOCK hosted-media-ingress");
    expect(result.stdout).toContain("BLOCK launch-handoff");
    expect(result.stdout).toContain("BLOCK readiness");
    expect(result.stdout).toContain("BLOCK launch-check");
  }, 20000);

  it("prints machine-readable JSON for agent launch blockers", () => {
    const result = spawnSync("npm", ["run", "--silent", "launch:doctor", "--", "--json"], {
      cwd: resolve("."),
      encoding: "utf8",
      env: { ...process.env, RENDER_API_KEY: "" }
    });
    const payload = JSON.parse(result.stdout);

    expect(result.status).toBe(1);
    expect(payload.ok).toBe(false);
    expect(payload.status).toBe("blocked");
    expect(payload.blockers).toEqual(expect.arrayContaining(["checkout", "checkout-probe", "storage", "storage-probe", "hosted-media-ingress"]));
    expect(payload.results.find((step) => step.id === "hosted-launch-doctor")).toBeTruthy();
    expect(payload.results.find((step) => step.id === "render-web-artifacts")).toMatchObject({
      commandString: "UPLOADCHECK_LIVE_WEB_BASE_URL=https://qcgenie-web.onrender.com npm run live-web-artifacts:verify"
    });
    for (const hostedStep of [
      "hosted-launch-evidence",
      "hosted-cost-basis",
      "hosted-agent-manifest",
      "hosted-pipeline-recipes",
      "hosted-pipeline-handoff",
      "hosted-npo-pipeline-handoff",
      "hosted-openapi",
      "hosted-public-artifacts"
    ]) {
      expect(payload.results.find((step) => step.id === hostedStep)).toBeTruthy();
    }
    expect(payload.results.find((step) => step.id === "checkout-probe").commandString).toBe("UPLOADCHECK_CHECKOUT_PROBE=1 npm run launch:checkout");
    expect(payload.results.find((step) => step.id === "hosted-media-ingress")).toMatchObject({
      commandString: "UPLOADCHECK_MEDIA_INGRESS_BASE_URL=https://qcgenie-api.onrender.com UPLOADCHECK_API_KEY=<private_bearer> npm run media-ingress:verify",
      ok: false
    });
    expect(payload.results.find((step) => step.id === "hosted-media-ingress").stdout).toContain("Missing env: UPLOADCHECK_API_KEY");
  }, 20000);

  it("publishes normalized doctor command coverage for Product Hunt launch-kit verification", () => {
    expect(launchDoctorCommandStrings()).toEqual(expect.arrayContaining([
      "npm run launch:dns",
      "npm run launch:checkout",
      "UPLOADCHECK_CHECKOUT_PROBE=1 npm run launch:checkout",
      "npm run launch:storage",
      "UPLOADCHECK_STORAGE_PROBE=1 npm run launch:storage",
      "npm run media-ingress:verify",
      "npm run live-launch-doctor:verify",
      "npm run live-launch-evidence:verify",
      "npm run live-cost-basis:verify",
      "npm run live-agent-manifest:verify",
      "npm run live-pipeline-recipes:verify",
      "npm run live-pipeline-handoff:verify",
      "npm run live-npo-pipeline-handoff:verify",
      "npm run live-openapi:verify",
      "npm run live-public-artifacts:verify",
      "UPLOADCHECK_LIVE_WEB_BASE_URL=https://qcgenie-web.onrender.com npm run live-web-artifacts:verify",
      "npm run live-web-artifacts:verify",
      "UPLOADCHECK_MEDIA_INGRESS_BASE_URL=https://qcgenie-api.onrender.com UPLOADCHECK_API_KEY=<private_bearer> npm run media-ingress:verify",
      "npm run launch-status:verify",
      "npm run cost-basis:verify",
      "npm run codex:verify-install",
      "npm run roadmap:verify",
      "npm run launch:handoff",
      "npm run readiness:check",
      "npm run launch:check"
    ]));
  });
});
