import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { AGENT_API_ENDPOINTS, JOB_STATUSES, MCP_TOOLS, buildQcJobRequest, getMcpToolNames } from "./agentic";

describe("agentic integration contract", () => {
  it("exposes a programmatic job lifecycle for external agents", () => {
    expect(AGENT_API_ENDPOINTS.map((endpoint) => endpoint.methodPath)).toEqual([
      "GET /v1/launch-status",
      "GET /v1/launch-handoff",
      "GET /pipeline-handoff.json",
      "POST /v1/qc/estimate",
      "POST /v1/qc/jobs",
      "POST /v1/qc/jobs/drain",
      "GET /v1/qc/jobs/{job_id}",
      "GET /v1/qc/jobs/{job_id}/report",
      "GET /v1/qc/jobs/{job_id}/events",
      "GET /v1/qc/jobs/{job_id}/artifacts",
      "GET /v1/qc/jobs/{job_id}/artifacts/markers",
      "POST /v1/qc/jobs/{job_id}/gate-verdict",
      "POST /v1/qc/jobs/{job_id}/cancel",
      "POST /v1/uploads",
      "PUT /v1/uploads/{upload_id}/content",
      "GET /v1/uploads/{upload_id}",
      "GET /v1/qc/jobs?limit=&status=&source_url=",
      "GET /v1/usage/margins?billing_period=&limit="
    ]);
  });

  it("defines MCP tools for Claude and Codex QC workflows", () => {
    expect(getMcpToolNames()).toEqual([
      "qc_get_launch_status",
      "qc_get_launch_handoff",
      "qc_get_pipeline_handoff",
      "qc_get_pipeline_recipes",
      "qc_get_cost_basis",
      "qc_estimate_cost",
      "qc_run_video",
      "qc_run_local_file",
      "qc_get_job",
      "qc_get_report",
      "qc_get_events",
      "qc_get_artifacts",
      "qc_get_marker_csv",
      "qc_submit_gate_verdict",
      "qc_list_recent_jobs",
      "qc_get_margin_telemetry",
      "qc_create_upload_url"
    ]);
    const launchStatus = MCP_TOOLS.find((tool) => tool.name === "qc_get_launch_status");
    expect(launchStatus?.outputs).toContain("remaining_blockers");
    const launchHandoff = MCP_TOOLS.find((tool) => tool.name === "qc_get_launch_handoff");
    expect(launchHandoff?.outputs).toContain("blockerProofCommands");
    expect(launchHandoff?.outputs).toContain("rule");
    const pipelineHandoff = MCP_TOOLS.find((tool) => tool.name === "qc_get_pipeline_handoff");
    expect(pipelineHandoff?.outputs).toContain("call_sequence");
    expect(pipelineHandoff?.outputs).toContain("media_ingress");
    expect(pipelineHandoff?.outputs).toContain("repair_loop_contract");
    const pipelineRecipes = MCP_TOOLS.find((tool) => tool.name === "qc_get_pipeline_recipes");
    expect(pipelineRecipes?.outputs).toContain("profiles");
    expect(pipelineRecipes?.outputs).toContain("repair_loop_contract");
    const costBasis = MCP_TOOLS.find((tool) => tool.name === "qc_get_cost_basis");
    expect(costBasis?.outputs).toContain("target_gross_margin_pct");
    expect(costBasis?.outputs).toContain("plans");
    const runVideo = MCP_TOOLS.find((tool) => tool.name === "qc_run_video");
    expect(runVideo?.inputs).toContain("youtube_url");
    expect(runVideo?.outputs).toContain("verdict");
    expect(runVideo?.outputs).toContain("media_ingress");
    const runLocalFile = MCP_TOOLS.find((tool) => tool.name === "qc_run_local_file");
    expect(runLocalFile?.inputs).toContain("file_path");
    expect(runLocalFile?.inputs).toContain("manifest_path");
    expect(runLocalFile?.inputs).toContain("transcript_path");
    expect(runLocalFile?.inputs).toContain("watchlist_path");
    expect(runLocalFile?.inputs).toContain("expected_script_path");
    expect(runLocalFile?.inputs).toContain("sidecar_dir");
    expect(runLocalFile?.outputs).toContain("media_ingress");
    expect(runLocalFile?.purpose).toContain("local media file");
    const getJob = MCP_TOOLS.find((tool) => tool.name === "qc_get_job");
    expect(getJob?.outputs).toContain("media_ingress");
  });

  it("publishes job observability fields for agent debugging", () => {
    const manifest = JSON.parse(readFileSync("public/agent-manifest.json", "utf8"));

    expect(manifest.launch_handoff_command).toBe("npm run launch:handoff -- --text");
    expect(manifest.response_fields.qc_job).toEqual(expect.arrayContaining([
      "startedAt",
      "completedAt",
      "processingDurationMs",
      "failureReason",
      "observability"
    ]));
    expect(manifest.response_fields.observability.safe_to_show).toContain("providerUsageEntries");
    expect(manifest.response_fields.observability.safe_to_show).toContain("stages");
  });

  it("defines a real async job lifecycle", () => {
    expect(JOB_STATUSES).toEqual([
      "queued",
      "ingesting",
      "metadata_probe",
      "transcribing",
      "deterministic_qc",
      "agent_review",
      "reporting",
      "completed",
      "failed",
      "cancelled"
    ]);
  });

  it("publishes a structured repair-loop contract for agent workflows", () => {
    const manifest = JSON.parse(readFileSync("public/agent-manifest.json", "utf8"));

    expect(manifest.repair_loop_contract).toMatchObject({
      required_fetches: ["qc_get_report", "qc_get_marker_csv"],
      severity_order: ["BLOCK", "WATCH", "PASS"],
      must_show_all_flags: true,
      user_prompt: "Show all QC flags and ask: Fix now?",
      rerun_after_fix: true
    });
    expect(manifest.repair_loop_contract.fixable_scopes).toContain("reachable source files");
    expect(manifest.repair_loop_contract.source_or_render_instruction).toContain("timestamped source/render patch instructions");
    expect(manifest.repair_loop_contract.completion_rule).toContain("no BLOCK flags remain");
  });

  it("publishes fail-fast abuse limits for agent workflows", () => {
    const manifest = JSON.parse(readFileSync("public/agent-manifest.json", "utf8"));

    expect(manifest.abuse_limits).toMatchObject({
      max_duration_minutes_default: 240,
      max_upload_mb_default: 2048,
      max_active_jobs_default: 25
    });
    expect(manifest.abuse_limits.fail_fast_errors).toEqual([
      "duration_limit_exceeded",
      "upload_size_limit_exceeded",
      "active_job_limit_exceeded"
    ]);
  });

  it("publishes pricing guardrails so agents do not treat checked minutes as unlimited AI review", () => {
    const manifest = JSON.parse(readFileSync("public/agent-manifest.json", "utf8"));

    expect(manifest.pricing_guardrail_note).toMatchObject({
      included_minutes_mean: "deterministic pre-upload QC minutes",
      stress_99_5000_remaining_cogs_after_deterministic_cents_per_minute: 0.0157
    });
    expect(manifest.pricing_guardrail_note.model_backed_deep_review).toContain("95% gross-margin target");
    expect(manifest.pricing_guardrail_note.stress_99_5000_verdict).toContain("too generous");
  });

  it("normalizes a YouTube QC request without exposing internal model rails", () => {
    const request = buildQcJobRequest({
      source: "https://youtube.com/watch?v=abc123",
      sourceType: "youtube",
      requestedBy: "codex",
      callbackUrl: "https://agent.example.com/qc-callback"
    });

    expect(request).toMatchObject({
      sourceType: "youtube",
      requestedBy: "codex",
      gates: ["freeze", "garble", "caption", "aspect", "transcript_grounding", "agent_review"]
    });
    expect(JSON.stringify(request).toLowerCase()).not.toContain("qwen");
    expect(JSON.stringify(request).toLowerCase()).not.toContain("omni");
  });
});
