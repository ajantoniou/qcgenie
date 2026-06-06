import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { validateNpoPipelineHandoff } from "../../scripts/verify-live-npo-pipeline-handoff.mjs";

function readJson(path) {
  return JSON.parse(readFileSync(resolve(path), "utf8"));
}

describe("NPO pipeline handoff", () => {
  it("publishes a focused audio production sequence for NPO pipelines", () => {
    const handoff = readJson("public/npo-pipeline-handoff.json");

    expect(validateNpoPipelineHandoff(handoff)).toEqual([]);
    expect(handoff.profile_id).toBe("npo_podcast_or_audio");
    expect(handoff.cost_preflight.checks).toBe("dead_air,spoken_leaks,pronunciation_watchlist,script_faithfulness,chunk_sidecar_failures");
    expect(handoff.media_ingress.large_audio).toContain("signed upload");
    expect(handoff.media_ingress.queued_render_worker).toContain("process_async=true");
    expect(handoff.mcp_sequence.map((step) => step.tool)).toEqual([
      "qc_get_pipeline_handoff",
      "qc_get_pipeline_recipes",
      "qc_estimate_cost",
      "qc_run_local_file",
      "qc_get_job",
      "qc_get_report",
      "qc_get_marker_csv"
    ]);
    expect(handoff.mcp_sequence.find((step) => step.tool === "qc_run_local_file").arguments).toMatchObject({
      file_path: "/path/to/episode.wav",
      transcript_path: "/path/to/final-transcript.txt",
      watchlist_path: "/path/to/watchlist.json",
      expected_script_path: "/path/to/locked-script.txt",
      sidecar_dir: "/path/to/_dialogue-chunks",
      cost_guardrail: "downgrade"
    });
    expect(handoff.repair_loop_contract.user_prompt).toContain("Fix now");
    expect(handoff.repair_loop_contract.completion_rule).toContain("no BLOCK flags remain");
  });

  it("rejects stale NPO handoffs missing sidecars and repair loop", () => {
    const handoff = readJson("public/npo-pipeline-handoff.json");
    delete handoff.required_sidecars.watchlist_path;
    handoff.mcp_sequence = handoff.mcp_sequence.filter((step) => step.tool !== "qc_get_marker_csv");
    handoff.repair_loop_contract.user_prompt = "Review flags";

    expect(validateNpoPipelineHandoff(handoff).map((error) => error.reason)).toEqual(expect.arrayContaining([
      "missing_sidecar",
      "missing_tool",
      "missing_repair_loop"
    ]));
  });

  it("links the handoff from public discovery metadata", () => {
    const manifest = readJson("public/agent-manifest.json");
    const openapi = readJson("public/openapi.json");
    const status = readJson("public/launch-status.json");
    const llms = readFileSync(resolve("public/llms.txt"), "utf8");

    expect(manifest.npo_pipeline_handoff_url).toBe("https://qcgenie-api.onrender.com/npo-pipeline-handoff.json");
    expect(manifest.primary_endpoints).toContain("GET /npo-pipeline-handoff.json");
    expect(manifest.agent_workflow.join("\n")).toContain("NPO podcast/audio pipelines");
    expect(openapi.paths["/npo-pipeline-handoff.json"].get.security).toEqual([]);
    expect(status.public_artifacts.npo_pipeline_handoff).toBe("https://qcgenie-api.onrender.com/npo-pipeline-handoff.json");
    expect(status.verified_controls.find((control) => control.id === "npo_pipeline_handoff")?.evidence).toContain("live-npo-pipeline-handoff:verify");
    expect(llms).toContain("https://qcgenie-api.onrender.com/npo-pipeline-handoff.json");
  });
});
