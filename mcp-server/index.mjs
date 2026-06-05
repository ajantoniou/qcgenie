#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const apiBaseUrl = process.env.QCGENIE_API_BASE_URL || "https://qcgenie-api.onrender.com";
const apiKey = process.env.QCGENIE_API_KEY;

const server = new McpServer({
  name: "qcgenie",
  version: "0.1.0"
});

server.tool(
  "qc_run_video",
  "Start a QC Genie video QC job from a YouTube URL, upload id, or signed URL.",
  {
    youtube_url: z.string().optional(),
    upload_id: z.string().optional(),
    signed_url: z.string().optional(),
    callback_url: z.string().optional(),
    idempotency_key: z.string().optional()
  },
  async (input) => jsonTool(await apiFetch("/v1/qc/jobs", { method: "POST", body: input }))
);

server.tool(
  "qc_get_job",
  "Poll QC job status, progress, verdict, and metered minutes.",
  { job_id: z.string() },
  async ({ job_id }) => jsonTool(await apiFetch(`/v1/qc/jobs/${job_id}`))
);

server.tool(
  "qc_get_report",
  "Retrieve timestamped QC report with evidence and artifacts.",
  { job_id: z.string() },
  async ({ job_id }) => jsonTool(await apiFetch(`/v1/qc/jobs/${job_id}/report`))
);

server.tool(
  "qc_list_recent_jobs",
  "List recent QC jobs in the workspace.",
  { limit: z.number().optional() },
  async ({ limit }) => jsonTool(await apiFetch(`/v1/qc/jobs${limit ? `?limit=${limit}` : ""}`))
);

server.tool(
  "qc_create_upload_url",
  "Create a signed upload URL for a local video file.",
  {
    filename: z.string(),
    content_type: z.string(),
    size_bytes: z.number()
  },
  async (input) => jsonTool(await apiFetch("/v1/uploads", { method: "POST", body: input }))
);

const transport = new StdioServerTransport();
await server.connect(transport);

async function apiFetch(path, options = {}) {
  if (!apiKey) {
    throw new Error("Set QCGENIE_API_KEY before running the MCP server.");
  }

  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: options.method || "GET",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(`QC Genie API ${response.status}: ${JSON.stringify(payload)}`);
  }
  return payload;
}

function jsonTool(payload) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(payload, null, 2)
      }
    ]
  };
}
