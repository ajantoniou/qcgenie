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
    expect(longForm.arguments.checks).toContain("script_faithfulness");
    expect(longForm.arguments).toMatchObject({
      manifest_path: "/path/to/storybook.json",
      transcript_path: "/path/to/final-transcript.txt",
      watchlist_path: "/path/to/watchlist.json",
      expected_script_path: "/path/to/locked-script.txt",
      cost_guardrail: "downgrade"
    });

    expect(shorts.arguments.checks).toContain("shorts_format");
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
  });
});
