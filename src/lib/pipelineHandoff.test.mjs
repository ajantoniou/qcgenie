import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readJson(path) {
  return JSON.parse(readFileSync(resolve(path), "utf8"));
}

describe("UploadCheck production pipeline handoff", () => {
  it("publishes a callable NTO/NPO runbook across launch, cost, media, and repair steps", () => {
    const handoff = readJson("public/pipeline-handoff.json");
    const sequenceText = JSON.stringify(handoff.call_sequence);

    expect(handoff.mcp_server).toBe("uploadcheck");
    expect(handoff.mcp_tool).toBe("qc_get_pipeline_handoff");
    expect(handoff.cli_command).toBe("uploadcheck pipeline-handoff --json");
    expect(handoff.profiles).toEqual([
      "nto_long_form",
      "nto_shorts",
      "npo_podcast_or_audio",
      "generic_creator_video",
      "creator_thumbnail"
    ]);
    for (const marker of [
      "qc_get_launch_status",
      "qc_get_launch_handoff",
      "qc_get_pipeline_recipes",
      "qc_get_cost_basis",
      "qc_estimate_cost",
      "qc_run_local_file",
      "qc_run_video",
      "qc_create_upload_url",
      "qc_get_job",
      "qc_get_report",
      "qc_get_marker_csv"
    ]) {
      expect(sequenceText).toContain(marker);
    }
    expect(sequenceText).toContain("Show all QC flags and ask: Fix now?");
    expect(sequenceText).toContain("no BLOCK flags remain");
    expect(handoff.media_ingress.inline_ephemeral.rule).toContain("Render temp storage");
    expect(handoff.media_ingress.signed_upload.api_sequence).toContain("POST /v1/uploads");
    expect(handoff.media_ingress.remote_sidecar_urls.fields).toContain("chunk_sidecars_url");
    expect(handoff.media_ingress.remote_sidecar_urls.rule).toContain("process_async=true");
    expect(handoff.margin_rules.target_gross_margin_pct).toBe(95);
    expect(handoff.margin_rules.stress_99_5000_remaining_cogs_after_deterministic_cents_per_minute).toBe(0.0157);
    expect(handoff.margin_rules.stress_99_5000_verdict).toContain("too generous");
    expect(handoff.margin_rules.internal_capture_rate_oracle).toContain("gemini_watch.py");
    expect(handoff.repair_loop_contract.user_prompt).toBe("Show all QC flags and ask: Fix now?");
    expect(handoff.private_moat_rule).toContain("exact thresholds");
  });

  it("is discoverable from manifest, OpenAPI, launch status, launch kit, and llms metadata", () => {
    const manifest = readJson("public/agent-manifest.json");
    const openapi = readJson("public/openapi.json");
    const launchStatus = readJson("public/launch-status.json");
    const launchKit = readJson("public/product-hunt-launch-kit.json");
    const llms = readFileSync(resolve("public/llms.txt"), "utf8");

    expect(manifest.pipeline_handoff_url).toBe("https://api.uploadcheck.app/pipeline-handoff.json");
    expect(manifest.tools).toContain("qc_get_pipeline_handoff");
    expect(manifest.primary_endpoints).toContain("GET /pipeline-handoff.json");
    expect(manifest.agent_workflow.join("\n")).toContain("GET /pipeline-handoff.json");
    expect(openapi.paths["/pipeline-handoff.json"].get.security).toEqual([]);
    expect(launchStatus.public_artifacts.pipeline_handoff).toBe("https://api.uploadcheck.app/pipeline-handoff.json");
    expect(launchKit.public_links.pipeline_handoff).toBe("https://api.uploadcheck.app/pipeline-handoff.json");
    expect(llms).toContain("https://api.uploadcheck.app/pipeline-handoff.json");
    expect(llms).toContain("launch status, launch handoff, recipes, cost basis");
  });
});
