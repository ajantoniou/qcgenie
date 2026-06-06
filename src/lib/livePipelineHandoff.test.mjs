import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { validatePipelineHandoff } from "../../scripts/verify-live-pipeline-handoff.mjs";

function readJson(path) {
  return JSON.parse(readFileSync(resolve(path), "utf8"));
}

describe("live pipeline handoff verifier", () => {
  it("accepts the current public pipeline handoff contract", () => {
    expect(validatePipelineHandoff(readJson("public/pipeline-handoff.json"))).toEqual([]);
  });

  it("rejects stale handoffs missing call sequence, ingress, and margin rules", () => {
    const handoff = readJson("public/pipeline-handoff.json");
    handoff.call_sequence = handoff.call_sequence.filter((step) => step.mcp_tool !== "qc_estimate_cost");
    handoff.media_ingress.remote_sidecar_urls.fields = [];
    handoff.margin_rules.stress_99_5000_remaining_cogs_after_deterministic_cents_per_minute = 99;

    expect(validatePipelineHandoff(handoff).map((error) => error.reason)).toEqual(expect.arrayContaining([
      "missing_step_marker",
      "missing_value",
      "missing_margin_guardrail"
    ]));
  });
});
