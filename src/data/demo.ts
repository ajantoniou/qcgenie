import { calculateUsage, PLANS } from "../lib/billing";
import { buildQcRun, type QcFlag } from "../lib/qcEngine";
import { AGENT_API_ENDPOINTS, MCP_TOOLS } from "../lib/agentic";

export const gates = [
  { id: "freeze", name: "Freeze / loop", state: "Clean", detail: "Full timeline scan, no held frames over 2.5s." },
  { id: "garble", name: "Audio garble", state: "Clean", detail: "Speech track clear enough for transcript alignment." },
  { id: "caption", name: "Caption safe area", state: "Warn", detail: "One lower-third sits close to mobile UI chrome." },
  { id: "aspect", name: "Aspect ratio", state: "Clean", detail: "16:9 master and 9:16 shorts validate against deliverable type." },
  { id: "transcript", name: "Transcript grounding", state: "Clean", detail: "Defect notes must quote real transcript evidence." }
] as const;

const deterministicFlags: QcFlag[] = [
  { gate: "caption", severity: "warn", timestamp: "00:09:12", summary: "Caption sits near mobile-safe boundary." }
];

const omniFlags: QcFlag[] = [
  {
    gate: "omni",
    severity: "warn",
    timestamp: "00:09:14",
    summary: "Agent review agrees the caption is readable but tight.",
    transcriptEvidence: "the payment failed twice"
  },
  {
    gate: "omni",
    severity: "block",
    timestamp: "00:12:03",
    summary: "Ungrounded historical mismatch suppressed by transcript filter.",
    transcriptEvidence: "Salem Witch Trials"
  }
];

export const activeRun = buildQcRun({
  title: "Creator upload: refund-policy walkthrough",
  minutes: 18.4,
  deterministicFlags,
  omniFlags,
  transcript: "The creator explains the payment failed twice, then shows the refund-policy screen."
});

export const recentJobs = [
  { title: "Episode 2 English master", type: "YouTube master", minutes: 42.2, verdict: "PASS", date: "Today" },
  { title: "Short 04 - Spanish", type: "Short", minutes: 0.8, verdict: "PASS", date: "Today" },
  { title: "Launch demo cut", type: "Product video", minutes: 7.01, verdict: "BLOCK", date: "Yesterday" },
  { title: "Paid ad v3", type: "Ad", minutes: 1.4, verdict: "WATCH", date: "Yesterday" }
] as const;

export const usage = calculateUsage(PLANS.studio, recentJobs.map((job) => job.minutes));

export const editorHandoff = [
  {
    timestamp: "00:09:12",
    issue: "Caption close to Shorts UI",
    action: "Copy editor note",
    export: "Premiere marker"
  },
  {
    timestamp: "00:11:48",
    issue: "Loudness peak needs review",
    action: "Open 5s preview",
    export: "Resolve marker"
  },
  {
    timestamp: "00:15:03",
    issue: "Client-safe approval note",
    action: "Share report link",
    export: "PDF summary"
  }
] as const;

export const expertPanels = [
  {
    title: "Creator upload panel",
    experts: "video editor, YouTube producer, audio engineer, MicroSaaS operator",
    recommendations: [
      "Make WATCH a real outcome for warning-only runs, not a hidden PASS.",
      "Add editor handoff: preview clips, contact sheets, marker exports, copyable notes.",
      "Package value as fewer revision loops and safer publishing, with minutes as metering."
    ]
  },
  {
    title: "Agentic workflow panel",
    experts: "MCP designer, API architect, Claude/Codex automation user",
    recommendations: [
      "Expose job creation, polling, reports, and webhooks through stable API endpoints.",
      "Ship UploadCheck MCP tools for qc_run_video, qc_get_report, and qc_list_recent_jobs.",
      "Keep internal model/provider rails hidden from customer-facing tools."
    ]
  },
  {
    title: "Growth UX panel",
    experts: "frontend designer, conversion strategist, mobile UX, SEO, AEO",
    recommendations: [
      "Add a proof-driven homepage before checkout, but keep dashboard as the product center.",
      "Publish machine-readable docs: llms.txt, OpenAPI, MCP tool manifest, and report examples.",
      "Make mobile usable for reviewing and sharing reports, while upload/editing stays desktop-first."
    ]
  }
] as const;

export const agentApiEndpoints = AGENT_API_ENDPOINTS;
export const mcpTools = MCP_TOOLS;

export const readinessTasks = [
  { phase: "Trust", item: "Persist gate thresholds, source hash, frame rate, coverage, and suppressed agent notes.", status: "Next" },
  { phase: "Ingest", item: "Replace demo input with YouTube OAuth, signed upload URLs, and transcript import.", status: "Next" },
  { phase: "Editor", item: "Generate preview clips, thumbnails, marker exports, and copyable editor notes.", status: "Next" },
  { phase: "Agentic", item: "Deploy API worker, API keys, webhooks, OpenAPI spec, CLI, and MCP server package.", status: "In design" },
  { phase: "Growth", item: "Add pricing, proof examples, SEO pages, llms.txt, and public sample reports.", status: "In design" },
  { phase: "Retention", item: "Weekly channel digest, saved presets, re-run reminders, trend alerts.", status: "Backlog" }
] as const;
