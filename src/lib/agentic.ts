export type AgentSourceType = "youtube" | "upload" | "signed_url";
export type AgentClient = "claude" | "codex" | "api" | "web";

export interface ApiEndpoint {
  methodPath: string;
  purpose: string;
}

export interface McpTool {
  name: string;
  purpose: string;
  inputs: string[];
  outputs: string[];
}

export const JOB_STATUSES = [
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
] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];

export interface BuildQcJobRequestInput {
  source: string;
  sourceType: AgentSourceType;
  requestedBy: AgentClient;
  callbackUrl?: string;
}

export interface QcJobRequest {
  source: string;
  sourceType: AgentSourceType;
  requestedBy: AgentClient;
  callbackUrl?: string;
  gates: string[];
  reportMode: "timestamps_and_summary";
}

export const AGENT_API_ENDPOINTS: ApiEndpoint[] = [
  { methodPath: "POST /v1/qc/jobs", purpose: "Create a QC job from a YouTube URL, upload id, or signed asset URL." },
  { methodPath: "GET /v1/qc/jobs/{job_id}", purpose: "Poll job status, verdict, gate progress, and minute usage." },
  { methodPath: "GET /v1/qc/jobs/{job_id}/report", purpose: "Fetch shareable JSON/PDF-ready defects, timestamps, and evidence." },
  { methodPath: "POST /v1/qc/jobs/{job_id}/cancel", purpose: "Cancel queued or active work before minutes are finalized." },
  { methodPath: "POST /v1/uploads", purpose: "Create a signed upload target for agents and self-serve users." },
  { methodPath: "GET /v1/uploads/{upload_id}", purpose: "Check upload processing and metadata probe status." },
  { methodPath: "GET /v1/qc/jobs?limit=&status=&source_url=", purpose: "List recent jobs and avoid duplicate agent runs." }
];

export const MCP_TOOLS: McpTool[] = [
  {
    name: "qc_run_video",
    purpose: "Start a full-timeline QC run from Claude, Codex, or another agent workspace.",
    inputs: ["youtube_url", "upload_id", "signed_url", "callback_url"],
    outputs: ["job_id", "verdict", "status_url", "report_url", "minutes_metered"]
  },
  {
    name: "qc_get_job",
    purpose: "Poll status, stage, progress, current verdict, and minutes for an active job.",
    inputs: ["job_id"],
    outputs: ["status", "stage", "progress_pct", "verdict", "minutes_metered"]
  },
  {
    name: "qc_get_report",
    purpose: "Retrieve a finished QC report with evidence-grounded timestamp flags.",
    inputs: ["job_id"],
    outputs: ["verdict", "flags", "timestamps", "transcript_evidence", "share_url"]
  },
  {
    name: "qc_list_recent_jobs",
    purpose: "Let an agent inspect recent jobs before re-running duplicate QC work.",
    inputs: ["workspace_id", "limit"],
    outputs: ["jobs", "verdicts", "created_at", "minutes_metered"]
  },
  {
    name: "qc_create_upload_url",
    purpose: "Create a signed upload URL so agents can send local files without handling QC storage directly.",
    inputs: ["filename", "content_type", "size_bytes"],
    outputs: ["upload_id", "signed_put_url", "expires_at"]
  }
];

export function getMcpToolNames(): string[] {
  return MCP_TOOLS.map((tool) => tool.name);
}

export function buildQcJobRequest(input: BuildQcJobRequestInput): QcJobRequest {
  return {
    source: input.source,
    sourceType: input.sourceType,
    requestedBy: input.requestedBy,
    callbackUrl: input.callbackUrl,
    gates: ["freeze", "garble", "caption", "aspect", "transcript_grounding", "agent_review"],
    reportMode: "timestamps_and_summary"
  };
}
