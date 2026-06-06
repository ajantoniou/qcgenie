import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { validatePipelineRecipes } from "../../scripts/verify-live-pipeline-recipes.mjs";

function readJson(path) {
  return JSON.parse(readFileSync(resolve(path), "utf8"));
}

describe("live pipeline recipes verifier", () => {
  it("accepts the current public pipeline recipe contract", () => {
    expect(validatePipelineRecipes(readJson("public/pipeline-recipes.json"))).toEqual([]);
  });

  it("rejects stale recipes missing NPO profile and NTO gates", () => {
    const recipes = readJson("public/pipeline-recipes.json");
    delete recipes.profiles.npo_podcast_or_audio;
    recipes.nto_replacement_qc.implemented_gates = recipes.nto_replacement_qc.implemented_gates.filter((gate) => gate.id !== "twins");
    recipes.repair_loop_contract.rerun_after_fix = false;

    expect(validatePipelineRecipes(recipes).map((error) => error.reason)).toEqual(expect.arrayContaining([
      "missing_profile",
      "missing_gate",
      "missing_repair_loop_rule"
    ]));
  });
});
