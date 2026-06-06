import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { validateAgentManifest } from "../../scripts/verify-live-agent-manifest.mjs";

function readJson(path) {
  return JSON.parse(readFileSync(resolve(path), "utf8"));
}

describe("live agent manifest verifier", () => {
  it("accepts the current public agent manifest contract", () => {
    expect(validateAgentManifest(readJson("public/agent-manifest.json"))).toEqual([]);
  });

  it("rejects stale manifests missing agent-critical MCP and pricing metadata", () => {
    const manifest = readJson("public/agent-manifest.json");
    manifest.tools = manifest.tools.filter((tool) => tool !== "qc_get_launch_evidence");
    manifest.pricing_guardrail_note.stress_99_5000_remaining_cogs_after_deterministic_cents_per_minute = 99;

    expect(validateAgentManifest(manifest).map((error) => error.reason)).toEqual(expect.arrayContaining([
      "missing_value",
      "missing_margin_guardrail"
    ]));
  });
});
