import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { MCP_TOOLS } from "./agentic";

function readJson(path) {
  return JSON.parse(readFileSync(resolve(path), "utf8"));
}

describe("UploadCheck pipeline recipes", () => {
  it("publishes machine-readable NTO/NPO profiles for agent pipelines", () => {
    const recipes = readJson("public/pipeline-recipes.json");

    expect(recipes.mcp_server).toBe("uploadcheck");
    expect(recipes.launch_preflight).toMatchObject({
      tool: "qc_get_launch_status",
      fallback_cli: "uploadcheck launch-status --json"
    });
    expect(recipes.launch_preflight.rule).toContain("remaining_blockers");
    expect(recipes.cost_preflight).toMatchObject({
      tool: "qc_estimate_cost",
      default_cost_guardrail: "downgrade"
    });
    expect(recipes.repair_loop_contract).toMatchObject({
      required_fetches: ["qc_get_report", "qc_get_marker_csv"],
      severity_order: ["BLOCK", "WATCH", "PASS"],
      must_show_all_flags: true,
      user_prompt: "Show all QC flags and ask: Fix now?",
      rerun_after_fix: true
    });
    expect(recipes.repair_loop_contract.fixable_scopes).toContain("captions");
    expect(recipes.repair_loop_contract.source_or_render_scopes).toContain("duplicate characters");
    expect(recipes.repair_loop_contract.completion_rule).toContain("no BLOCK flags remain");
    expect(recipes.nto_replacement_qc.purpose).toContain("production-pipeline QC");
    expect(recipes.nto_replacement_qc.private_moat_rule).toContain("keep exact thresholds");
    expect(Object.keys(recipes.profiles)).toEqual([
      "nto_long_form",
      "nto_shorts",
      "npo_podcast_or_audio",
      "generic_creator_video"
    ]);
  });

  it("keeps NTO/NPO profile arguments aligned with sidecar-aware qc_run_local_file", () => {
    const recipes = readJson("public/pipeline-recipes.json");
    const longForm = recipes.profiles.nto_long_form.mcp_call;
    const shorts = recipes.profiles.nto_shorts.mcp_call;
    const audio = recipes.profiles.npo_podcast_or_audio.mcp_call;
    const runLocalFile = MCP_TOOLS.find((tool) => tool.name === "qc_run_local_file");

    expect(longForm.tool).toBe("qc_run_local_file");
    expect(longForm.arguments.checks).toContain("repeat_fatigue");
    expect(longForm.arguments.checks).toContain("speaker_visual_binding");
    expect(longForm.arguments.checks).toContain("static_head_dominance");
    expect(longForm.arguments.checks).toContain("literal_subject_match");
    expect(longForm.arguments.checks).toContain("script_faithfulness");
    expect(longForm.arguments).toMatchObject({
      manifest_path: "/path/to/storybook.json",
      transcript_path: "/path/to/final-transcript.txt",
      watchlist_path: "/path/to/watchlist.json",
      expected_script_path: "/path/to/locked-script.txt",
      cost_guardrail: "downgrade"
    });

    expect(shorts.arguments.checks).toContain("shorts_format");
    expect(shorts.arguments.checks).toContain("sentence_boundary");
    expect(shorts.arguments.checks).toContain("text_safe_area");
    expect(audio.arguments.file_path).toBe("/path/to/episode.wav");
    expect(audio.arguments.checks).toContain("pronunciation_watchlist");
    expect(audio.arguments.checks).toContain("script_faithfulness");

    for (const call of [longForm, shorts, audio]) {
      for (const key of Object.keys(call.arguments)) {
        if (key.endsWith("_path")) expect(runLocalFile?.inputs).toContain(key);
      }
    }
  });

  it("links pipeline recipes from the public agent manifest", () => {
    const manifest = readJson("public/agent-manifest.json");

    expect(manifest.pipeline_recipes_url).toBe("https://qcgenie-api.onrender.com/pipeline-recipes.json");
    expect(manifest.pipeline_profiles.map((profile) => profile.id)).toEqual([
      "nto_long_form",
      "nto_shorts",
      "npo_podcast_or_audio",
      "generic_creator_video"
    ]);
    expect(manifest.response_fields.qc_job).toContain("mediaIngress");
    expect(manifest.response_fields.qc_job).toContain("costEstimate");
    expect(manifest.response_fields.mediaIngress).toMatchObject({
      inline_mode: "inline_ephemeral",
      signed_upload_mode: "signed_upload"
    });
    expect(manifest.response_fields.mediaIngress.safe_to_show).toContain("sha256");
    expect(manifest.response_fields.mediaIngress.never_exposes).toContain("temporary server file paths");
    expect(manifest.repair_loop_contract).toEqual(readJson("public/pipeline-recipes.json").repair_loop_contract);
  });

  it("exposes NTO replacement QC tasks without publishing private implementation details", () => {
    const recipes = readJson("public/pipeline-recipes.json");
    const replacement = recipes.nto_replacement_qc;
    const implemented = Object.fromEntries(replacement.implemented_gates.map((gate) => [gate.id, gate]));
    const planned = new Set(replacement.planned_product_gates.map((gate) => gate.id));

    expect(implemented.text_contrast).toMatchObject({
      callable_check: "text_contrast"
    });
    expect(implemented.text_contrast.covers).toContain("Poorly contrasting overlay text");
    expect(implemented.twins.covers).toContain("more character variation");
    expect(implemented.narration_match.covers).toContain("Visual/narration mismatch");
    expect(implemented.sentence_boundary).toMatchObject({
      callable_check: "sentence_boundary"
    });
    expect(implemented.sentence_boundary.covers).toContain("mid-sentence");
    expect(implemented.speaker_visual_binding).toMatchObject({
      callable_check: "speaker_visual_binding"
    });
    expect(implemented.speaker_visual_binding.covers).toContain("speaker");
    expect(implemented.static_head_dominance).toMatchObject({
      callable_check: "static_head_dominance"
    });
    expect(implemented.static_head_dominance.covers).toContain("Held talking-head");
    expect(implemented.literal_subject_match).toMatchObject({
      callable_check: "literal_subject_match"
    });
    expect(implemented.literal_subject_match.covers).toContain("generic mood footage");

    for (const id of [
      "first_three_seconds",
      "rehook_cadence",
      "end_screen_tease",
      "contact_sheet_evidence"
    ]) {
      expect(planned.has(id)).toBe(true);
    }

    expect(JSON.stringify(replacement)).not.toContain("/Applications/");
    expect(JSON.stringify(replacement)).not.toContain("personas/");
  });
});
