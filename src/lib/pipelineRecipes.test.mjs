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
      handoff_tool: "qc_get_launch_handoff",
      fallback_cli: "uploadcheck launch-status --json",
      handoff_fallback_cli: "uploadcheck launch-handoff --json"
    });
    expect(recipes.launch_preflight.rule).toContain("remaining_blockers");
    expect(recipes.launch_preflight.rule).toContain("proof commands");
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
      "generic_creator_video",
      "creator_thumbnail"
    ]);
  });

  it("keeps NTO/NPO profile arguments aligned with sidecar-aware qc_run_local_file", () => {
    const recipes = readJson("public/pipeline-recipes.json");
    const longForm = recipes.profiles.nto_long_form.mcp_call;
    const shorts = recipes.profiles.nto_shorts.mcp_call;
    const audio = recipes.profiles.npo_podcast_or_audio.mcp_call;
    const thumbnail = recipes.profiles.creator_thumbnail.mcp_call;
    const runLocalFile = MCP_TOOLS.find((tool) => tool.name === "qc_run_local_file");

    expect(longForm.tool).toBe("qc_run_local_file");
    expect(longForm.arguments.checks).toContain("repeat_fatigue");
    expect(longForm.arguments.checks).toContain("speaker_visual_binding");
    expect(longForm.arguments.checks).toContain("static_head_dominance");
    expect(longForm.arguments.checks).toContain("literal_subject_match");
    expect(longForm.arguments.checks).toContain("first_three_seconds");
    expect(longForm.arguments.checks).toContain("end_screen_tease");
    expect(longForm.arguments.checks).toContain("rehook_cadence");
    expect(longForm.arguments.checks).toContain("contact_sheet_evidence");
    expect(longForm.arguments.checks).toContain("text_crop_jitter");
    expect(longForm.arguments.checks).toContain("chunk_sidecar_failures");
    expect(longForm.arguments.checks).toContain("script_faithfulness");
    expect(longForm.arguments).toMatchObject({
      manifest_path: "/path/to/storybook.json",
      transcript_path: "/path/to/final-transcript.txt",
      watchlist_path: "/path/to/watchlist.json",
      expected_script_path: "/path/to/locked-script.txt",
      sidecar_dir: "/path/to/_dialogue-chunks",
      cost_guardrail: "downgrade"
    });

    expect(shorts.arguments.checks).toContain("shorts_format");
    expect(shorts.arguments.checks).toContain("opening_footer_text_presence");
    expect(shorts.arguments.checks).toContain("first_three_seconds");
    expect(shorts.arguments.checks).toContain("end_screen_tease");
    expect(shorts.arguments.checks).toContain("sentence_boundary");
    expect(shorts.arguments.checks).toContain("dialogue_in_music_short");
    expect(shorts.arguments.checks).toContain("text_crop_jitter");
    expect(shorts.arguments.checks).toContain("text_safe_area");
    expect(audio.arguments.file_path).toBe("/path/to/episode.wav");
    expect(audio.arguments.checks).toContain("pronunciation_watchlist");
    expect(audio.arguments.checks).toContain("script_faithfulness");
    expect(audio.arguments.checks).toContain("chunk_sidecar_failures");
    expect(thumbnail.arguments.file_path).toBe("/path/to/thumbnail.jpg");
    expect(thumbnail.arguments.checks).toBe("thumbnail_text_readability");

    for (const call of [longForm, shorts, audio]) {
      for (const key of Object.keys(call.arguments)) {
        if (key.endsWith("_path")) expect(runLocalFile?.inputs).toContain(key);
      }
    }
  });

  it("links pipeline recipes from the public agent manifest", () => {
    const manifest = readJson("public/agent-manifest.json");

    expect(manifest.pipeline_recipes_url).toBe("https://qcgenie-api.onrender.com/pipeline-recipes.json");
    expect(manifest.tools).toContain("qc_get_pipeline_recipes");
    expect(manifest.primary_endpoints).toContain("GET /pipeline-recipes.json");
    expect(manifest.pipeline_profiles.map((profile) => profile.id)).toEqual([
      "nto_long_form",
      "nto_shorts",
      "npo_podcast_or_audio",
      "generic_creator_video",
      "creator_thumbnail"
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
    const planned = Object.fromEntries(replacement.planned_product_gates.map((gate) => [gate.id, gate]));

    expect(implemented.text_contrast).toMatchObject({
      callable_check: "text_contrast"
    });
    expect(implemented.text_contrast.covers).toContain("Poorly contrasting overlay text");
    expect(implemented.text_crop_jitter).toMatchObject({
      callable_check: "text_crop_jitter"
    });
    expect(implemented.text_crop_jitter.covers).toContain("jittering");
    expect(implemented.thumbnail_text_readability).toMatchObject({
      callable_check: "thumbnail_text_readability"
    });
    expect(implemented.thumbnail_text_readability.covers).toContain("low-contrast");
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
    expect(implemented.first_three_seconds).toMatchObject({
      callable_check: "first_three_seconds"
    });
    expect(implemented.first_three_seconds.covers).toContain("Generic openings");
    expect(implemented.opening_footer_text_presence).toMatchObject({
      callable_check: "opening_footer_text_presence"
    });
    expect(implemented.opening_footer_text_presence.covers).toContain("0-3s hook card");
    expect(implemented.end_screen_tease).toMatchObject({
      callable_check: "end_screen_tease"
    });
    expect(implemented.end_screen_tease.covers).toContain("Missing next-video tease");
    expect(implemented.rehook_cadence).toMatchObject({
      callable_check: "rehook_cadence"
    });
    expect(implemented.rehook_cadence.covers).toContain("pattern interrupt");
    expect(implemented.contact_sheet_evidence).toMatchObject({
      callable_check: "contact_sheet_evidence"
    });
    expect(implemented.contact_sheet_evidence.covers).toContain("Before/after visual proof");
    expect(implemented.dialogue_in_music_short).toMatchObject({
      callable_check: "dialogue_in_music_short"
    });
    expect(implemented.dialogue_in_music_short.covers).toContain("unintended spoken dialogue");
    expect(implemented.chunk_sidecar_failures).toMatchObject({
      callable_check: "chunk_sidecar_failures"
    });
    expect(implemented.chunk_sidecar_failures.covers).toContain("garble sidecars");

    expect(planned.visual_authenticity.covers).toContain("casting/style authenticity");
    expect(planned.ai_plate_artifacts.covers).toContain("melted hands");
    expect(planned.unwanted_lip_movement.covers).toContain("lip-sync");
    expect(planned.historical_period_fit.covers).toContain("Wrong era");
    expect(planned.sensitive_framing.covers).toContain("anti-Jewish coding");

    expect(JSON.stringify(replacement)).not.toContain("/Applications/");
    expect(JSON.stringify(replacement)).not.toContain("personas/");
  });
});
