import { describe, expect, it } from "vitest";
import { AGENT_API_ENDPOINTS, JOB_STATUSES, MCP_TOOLS, buildQcJobRequest, getMcpToolNames } from "./agentic";

describe("agentic integration contract", () => {
  it("exposes a programmatic job lifecycle for external agents", () => {
    expect(AGENT_API_ENDPOINTS.map((endpoint) => endpoint.methodPath)).toEqual([
      "GET /v1/launch-status",
      "POST /v1/qc/estimate",
      "POST /v1/qc/jobs",
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
    expect(runLocalFile?.outputs).toContain("media_ingress");
    expect(runLocalFile?.purpose).toContain("local media file");
    const getJob = MCP_TOOLS.find((tool) => tool.name === "qc_get_job");
    expect(getJob?.outputs).toContain("media_ingress");
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
