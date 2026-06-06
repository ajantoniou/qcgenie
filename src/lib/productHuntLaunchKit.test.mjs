import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { launchDoctorCommandStrings } from "../../launch-doctor.mjs";
import { buildProductHuntLaunchKit } from "../../product-hunt-launch-kit.mjs";

function readJson(path) {
  return JSON.parse(readFileSync(resolve(path), "utf8"));
}

describe("Product Hunt launch kit", () => {
  it("publishes machine-readable launch copy, proof links, and go/no-go inputs", () => {
    const kit = readJson("public/product-hunt-launch-kit.json");
    const status = readJson("public/launch-status.json");
    const manifest = readJson("public/agent-manifest.json");

    expect(kit).toEqual(buildProductHuntLaunchKit(status));
    expect(kit.product.name).toBe("UploadCheck.app");
    expect(kit.product.tagline).toBe("Quality check videos, podcasts, and clips before you upload.");
    expect(kit.launch_copy.headline).toContain("Catch upload mistakes");
    expect(kit.demo_flow).toHaveLength(4);
    expect(kit.demo_flow.map((step) => step.title)).toEqual(["Preflight cost", "Run /check", "Show the block", "Ask to fix now"]);
    expect(kit.public_links.sample_reports_index).toBe(status.public_artifacts.sample_reports);
    expect(kit.public_links.cost_basis).toBe(status.public_artifacts.cost_basis);
    expect(kit.public_links.launch_status).toBe(status.public_artifacts.launch_status);
    expect(kit.public_links.live_launch_doctor).toBe(status.public_artifacts.live_launch_doctor);
    expect(kit.current_state_snapshot).toMatchObject({
      source: status.public_artifacts.launch_status,
      product_hunt_ready: status.product_hunt_ready,
      remaining_blockers: status.remaining_blockers.map((blocker) => blocker.id)
    });
    expect(kit.current_state_snapshot.note).toContain("Static snapshot only");
    expect(kit.ready_when.source_of_truth).toBe(status.public_artifacts.live_launch_status);
    expect(kit.ready_when.required_commands).toContain("npm run launch:doctor");
    expect(kit.ready_when.required_commands).toContain("npm run launch:evidence -- --json");
    expect(kit.ready_when.required_commands).toContain("npm run launch:handoff");
    expect(kit.ready_when.required_commands).toContain("npm run live-launch-doctor:verify");
    expect(kit.ready_when.required_commands).toContain("npm run live-launch-evidence:verify");
    expect(kit.ready_when.required_commands).toContain("npm run live-cost-basis:verify");
    expect(kit.ready_when.required_commands).toContain("npm run live-agent-manifest:verify");
    expect(kit.ready_when.required_commands).toContain("npm run live-pipeline-recipes:verify");
    expect(kit.ready_when.required_commands).toContain("npm run live-pipeline-handoff:verify");
    expect(kit.ready_when.required_commands).toContain("npm run live-npo-pipeline-handoff:verify");
    expect(kit.ready_when.required_commands).toContain("npm run live-openapi:verify");
    expect(kit.ready_when.required_commands).toContain("npm run live-public-artifacts:verify");
    expect(kit.ready_when.required_commands).toContain("UPLOADCHECK_LIVE_WEB_BASE_URL=https://qcgenie-web.onrender.com npm run live-web-artifacts:verify");
    expect(kit.ready_when.required_commands).toContain("npm run live-web-artifacts:verify");
    expect(kit.ready_when.required_commands).toContain("npm run media-ingress:verify");
    expect(kit.ready_when.required_commands).toContain("UPLOADCHECK_MEDIA_INGRESS_BASE_URL=https://qcgenie-api.onrender.com UPLOADCHECK_API_KEY=<private_bearer> npm run media-ingress:verify");
    expect(kit.ready_when.required_commands).toContain("npm run launch-status:generate");
    expect(kit.ready_when.required_commands).toContain("npm run render:validate-env-file -- /tmp/uploadcheck-render-launch.env");
    expect(kit.ready_when.required_commands).toContain("npm run launch:dns");
    expect(kit.ready_when.required_commands).toContain("npm run launch:checkout");
    expect(kit.ready_when.required_commands).toContain("UPLOADCHECK_CHECKOUT_PROBE=1 npm run launch:checkout");
    expect(kit.ready_when.required_commands).toContain("npm run launch:storage");
    expect(kit.ready_when.required_commands).toContain("UPLOADCHECK_STORAGE_PROBE=1 npm run launch:storage");
    expect(kit.ready_when.required_commands).toContain("npm run launch:check");
    expect(kit.pricing_position.margin_rule).toContain("95% gross-margin target");
    expect(manifest.product_hunt_launch_kit_url).toBe(status.public_artifacts.product_hunt_launch_kit);
  });

  it("keeps launch-kit required commands covered by launch doctor or explicit standalone handoff", () => {
    const kit = readJson("public/product-hunt-launch-kit.json");
    const doctorCommands = new Set(launchDoctorCommandStrings());
    const standaloneCommands = new Set([
      "npm run launch:doctor",
      "npm run launch:evidence -- --json",
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
      "npm run launch-status:generate",
      "npm run render:validate-env-file -- /tmp/uploadcheck-render-launch.env"
    ]);

    for (const command of kit.ready_when.required_commands) {
      expect(doctorCommands.has(command) || standaloneCommands.has(command), `${command} is not covered by launch doctor or standalone handoff`).toBe(true);
    }
  });
});
