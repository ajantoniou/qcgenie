import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readJson(path) {
  return JSON.parse(readFileSync(resolve(path), "utf8"));
}

describe("Product Hunt launch kit", () => {
  it("publishes machine-readable launch copy, proof links, and go/no-go inputs", () => {
    const kit = readJson("public/product-hunt-launch-kit.json");
    const status = readJson("public/launch-status.json");
    const manifest = readJson("public/agent-manifest.json");

    expect(kit.product.name).toBe("UploadCheck.app");
    expect(kit.product.tagline).toBe("Quality check videos, podcasts, and clips before you upload.");
    expect(kit.launch_copy.headline).toContain("Catch upload mistakes");
    expect(kit.demo_flow).toHaveLength(4);
    expect(kit.demo_flow.map((step) => step.title)).toEqual(["Preflight cost", "Run /check", "Show the block", "Ask to fix now"]);
    expect(kit.public_links.sample_reports_index).toBe(status.public_artifacts.sample_reports);
    expect(kit.public_links.cost_basis).toBe(status.public_artifacts.cost_basis);
    expect(kit.public_links.launch_status).toBe(status.public_artifacts.launch_status);
    expect(kit.ready_when.source_of_truth).toBe(status.public_artifacts.live_launch_status);
    expect(kit.ready_when.required_commands).toContain("npm run launch:dns");
    expect(kit.ready_when.required_commands).toContain("npm run launch:checkout");
    expect(kit.ready_when.required_commands).toContain("npm run launch:storage");
    expect(kit.ready_when.required_commands).toContain("npm run launch:check");
    expect(kit.pricing_position.margin_rule).toContain("95% gross-margin target");
    expect(manifest.product_hunt_launch_kit_url).toBe(status.public_artifacts.product_hunt_launch_kit);
  });
});
