import { describe, expect, it } from "vitest";
import { formatLaunchDoctor, launchDoctorCommandStrings, LAUNCH_DOCTOR_STEPS, runLaunchDoctor } from "../../launch-doctor.mjs";

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
    const report = runLaunchDoctor({ steps: LAUNCH_DOCTOR_STEPS, runner: launchDoctorFixtureRunner });
    const output = formatLaunchDoctor(report);

    expect(report.ok).toBe(false);
    expect(output).toContain("UploadCheck launch doctor: NOT READY");
    expect(output).toContain("BLOCK checkout");
    expect(output).toContain("BLOCK checkout-probe");
    expect(output).toContain("BLOCK storage");
    expect(output).toMatch(/(PASS|BLOCK) storage-probe/);
    expect(output).toMatch(/(PASS|BLOCK) render-web-artifacts/);
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
      expect(output).toMatch(new RegExp(`(PASS|BLOCK) ${hostedStep}`));
    }
    expect(output).toMatch(/(PASS|BLOCK) hosted-web-artifacts/);
    expect(output).toContain("BLOCK hosted-media-ingress");
    expect(output).toMatch(/(PASS|BLOCK) launch-handoff/);
    expect(output).toMatch(/(PASS|BLOCK) readiness/);
    expect(output).toMatch(/(PASS|BLOCK) launch-check/);
  });

  it("prints machine-readable JSON for agent launch blockers", () => {
    const payload = runLaunchDoctor({ steps: LAUNCH_DOCTOR_STEPS, runner: launchDoctorFixtureRunner });

    expect(payload.ok).toBe(false);
    expect(payload.status).toBe("blocked");
    expect(payload.blockers).toEqual(expect.arrayContaining(["checkout", "checkout-probe", "storage", "hosted-media-ingress"]));
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
      commandString: "UPLOADCHECK_MEDIA_INGRESS_BASE_URL=https://api.uploadcheck.app UPLOADCHECK_API_KEY=<private_bearer> npm run media-ingress:verify",
      ok: false
    });
    expect(payload.results.find((step) => step.id === "hosted-media-ingress").stdout).toContain("Missing env: UPLOADCHECK_API_KEY");
  });

  it("publishes normalized doctor command coverage for Product Hunt launch-kit verification", () => {
    expect(launchDoctorCommandStrings()).toEqual(expect.arrayContaining([
      "npm run launch:dns",
      "npm run launch:checkout",
      "UPLOADCHECK_CHECKOUT_PROBE=1 npm run launch:checkout",
      "npm run launch:storage",
      "UPLOADCHECK_STORAGE_PROBE=hosted npm run launch:storage",
      "npm run media-ingress:verify",
      "npm run live-launch-doctor:verify",
      "npm run live-launch-evidence:verify",
      "npm run live-cost-basis:verify",
      "npm run live-agent-manifest:verify",
      "npm run live-pipeline-recipes:verify",
      "npm run live-pipeline-handoff:verify",
      "npm run live-npo-pipeline-handoff:verify",
      "npm run live-openapi:verify",
      "npm run live-mcp-install:verify",
      "npm run live-public-artifacts:verify",
      "UPLOADCHECK_LIVE_WEB_BASE_URL=https://qcgenie-web.onrender.com npm run live-web-artifacts:verify",
      "npm run live-web-artifacts:verify",
      "UPLOADCHECK_MEDIA_INGRESS_BASE_URL=https://api.uploadcheck.app UPLOADCHECK_API_KEY=<private_bearer> npm run media-ingress:verify",
      "npm run launch-status:verify",
      "npm run cost-basis:verify",
      "npm run saas-basics:verify",
      "npm run mcp-install:verify",
      "npm run private-mcp-beta:verify",
      "npm run private-mcp-beta:evidence",
      "npm run anthropic-directory:verify",
      "npm run product-agent:verify",
      "npm run codex:verify-install",
      "npm run roadmap:verify",
      "npm run launch:handoff",
      "npm run readiness:check",
      "npm run launch:check"
    ]));
  });
});

function launchDoctorFixtureRunner(_command, step) {
  const blocked = new Set(["checkout", "checkout-probe", "storage"]);
  if (step.requiredEnv?.includes("UPLOADCHECK_API_KEY")) {
    return {
      status: 1,
      stdout: [
        `${step.label}: NOT READY`,
        "Missing env: UPLOADCHECK_API_KEY"
      ].join("\n"),
      stderr: ""
    };
  }
  if (blocked.has(step.id)) {
    return { status: 1, stdout: `${step.label}: NOT READY\n`, stderr: "" };
  }
  return { status: 0, stdout: `${step.label}: READY\n`, stderr: "" };
}
