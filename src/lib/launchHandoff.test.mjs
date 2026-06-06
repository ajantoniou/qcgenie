import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildLaunchHandoff, formatLaunchHandoff } from "../../launch-handoff.mjs";

describe("launch handoff", () => {
  it("builds an actionable operator packet from readiness checks", () => {
    const handoff = buildLaunchHandoff({
      generatedAt: "2026-06-06T00:00:00.000Z",
      readyForProductHunt: false,
      checks: {
        checkout: { ok: false, reason: "missing", plans: { creator: { configured: false } } },
        storage: { ok: false, mode: "render_temp_storage", objectStorage: {} },
        apiAuth: { ok: true },
        productHunt: { ok: false }
      }
    }, {
      apiBaseUrl: "https://qcgenie-api.onrender.com",
      generatedAt: "2026-06-06T00:00:00.000Z"
    });

    expect(handoff.productHuntReady).toBe(false);
    expect(handoff.remainingBlockers.map((blocker) => blocker.id)).toEqual(["checkout", "storage"]);
    expect(handoff.requiredActions.map((action) => action.id)).toEqual(["render-env-template", "checkout", "storage"]);
    expect(handoff.blockerProofCommands).toEqual([{
      id: "checkout",
      commands: [
        "npm run launch:checkout",
        "UPLOADCHECK_CHECKOUT_PROBE=1 npm run launch:checkout"
      ]
    }, {
      id: "storage",
      commands: [
        "npm run launch:storage",
        "UPLOADCHECK_STORAGE_PROBE=1 npm run launch:storage",
        "UPLOADCHECK_MEDIA_INGRESS_BASE_URL=https://api.uploadcheck.app UPLOADCHECK_API_KEY=<private_bearer> npm run media-ingress:verify"
      ]
    }]);
    expect(handoff.operatorCommandSequence).toContain("npm run launch:doctor");
    expect(handoff.operatorCommandSequence).toContain("UPLOADCHECK_MEDIA_INGRESS_BASE_URL=https://api.uploadcheck.app UPLOADCHECK_API_KEY=<private_bearer> npm run media-ingress:verify");
    expect(handoff.launchDoctorCommands).toContain("npm run media-ingress:verify");
    expect(handoff.launchDoctorCommands).toContain("UPLOADCHECK_MEDIA_INGRESS_BASE_URL=https://api.uploadcheck.app UPLOADCHECK_API_KEY=<private_bearer> npm run media-ingress:verify");
    expect(handoff.rule).toContain("launch:doctor exits 0");
    expect(handoff.blockerFixPlan).toMatchObject({
      status: "blocked",
      blockers: ["checkout", "storage"],
      completionRule: expect.stringContaining("productHuntReady=true")
    });
    expect(handoff.blockerFixPlan.phases.map((phase) => phase.id)).toEqual([
      "prepare-render-env",
      "configure-checkout",
      "configure-upload-storage",
      "final-launch-proof"
    ]);
    expect(handoff.blockerFixPlan.phases.find((phase) => phase.id === "configure-checkout").env).toContain("UPLOADCHECK_CREATOR_CHECKOUT_URL");
    expect(handoff.blockerFixPlan.phases.find((phase) => phase.id === "configure-checkout").proof_commands).toContain("UPLOADCHECK_CHECKOUT_PROBE=1 npm run launch:checkout");
    expect(handoff.blockerFixPlan.phases.find((phase) => phase.id === "configure-upload-storage").env).toContain("UPLOADCHECK_DURABLE_STORAGE_DIR=/mnt/uploadcheck/uploads");
    expect(handoff.blockerFixPlan.phases.find((phase) => phase.id === "final-launch-proof").proof_commands).toContain("npm run launch:doctor");

    const text = formatLaunchHandoff(handoff);
    expect(text).toContain("UploadCheck launch handoff: NOT READY");
    expect(text).toContain("Blockers: checkout, storage");
    expect(text).toContain("Required actions:");
    expect(text).toContain("Proof commands after fixing blockers:");
    expect(text).toContain("Launch doctor commands:");
    expect(text).toContain("Fix plan:");
    expect(text).toContain("Configure checkout URLs: configure-checkout");
    expect(text).toContain("UPLOADCHECK_STORAGE_PROBE=1 npm run launch:storage");
    expect(text).toContain("UPLOADCHECK_MEDIA_INGRESS_BASE_URL=https://api.uploadcheck.app UPLOADCHECK_API_KEY=<private_bearer> npm run media-ingress:verify");
  });

  it("returns nonzero in the current live unready launch state", () => {
    const result = spawnSync("npm", ["run", "--silent", "launch:handoff"], {
      cwd: resolve("."),
      encoding: "utf8"
    });

    expect(result.status).toBe(1);
    const payload = JSON.parse(result.stdout);
    expect(payload.name).toBe("UploadCheck.app Launch Handoff");
    expect(payload.productHuntReady).toBe(false);
    expect(payload.remainingBlockers.length).toBeGreaterThan(0);
    expect(payload.launchDoctorCommands).toContain("UPLOADCHECK_MEDIA_INGRESS_BASE_URL=https://api.uploadcheck.app UPLOADCHECK_API_KEY=<private_bearer> npm run media-ingress:verify");
    expect(payload.blockerFixPlan.status).toBe("blocked");
    expect(payload.blockerFixPlan.phases.map((phase) => phase.id)).toContain("final-launch-proof");
  });
});
