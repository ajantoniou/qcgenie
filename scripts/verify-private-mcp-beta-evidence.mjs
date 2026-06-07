#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const evidencePath = process.env.UPLOADCHECK_PRIVATE_MCP_BETA_EVIDENCE_PATH || "docs/private-mcp-beta-evidence-template.json";
const payload = JSON.parse(readFileSync(resolve(evidencePath), "utf8"));
const errors = [];

const requiredClients = ["claude_code", "codex", "cursor"];
const requiredChecks = [
  "workspace_api_key_used",
  "credit_gated_workspace",
  "deterministic_publish_readiness_qc",
  "cost_basis_or_estimate_checked",
  "job_created",
  "report_fetched",
  "timestamped_flags_or_pass_evidence_returned",
  "no_secret_leakage",
  "no_internal_oracle_tools"
];
const allowedTools = [
  "qc_get_cost_basis",
  "qc_estimate_cost",
  "qc_run_video",
  "qc_run_local_file",
  "qc_get_job",
  "qc_get_report",
  "qc_get_events",
  "qc_get_artifacts",
  "qc_get_marker_csv",
  "qc_create_upload_url"
];
const forbiddenTools = ["gemini_watch", "omni_watch", "qwen", "anthropic_fallback_oracle", "deep_ai_review"];

if (payload.status !== "template_not_captured" && payload.status !== "captured") {
  errors.push({ field: "status", reason: "must_be_template_not_captured_or_captured" });
}
for (const client of requiredClients) {
  if (!payload.required_clients?.includes(client)) errors.push({ field: "required_clients", reason: "missing_client", client });
  const proof = payload.client_proofs?.find((item) => item.client === client);
  if (!proof) {
    errors.push({ field: "client_proofs", reason: "missing_client_proof", client });
    continue;
  }
  if (proof.api_base_url !== "https://api.uploadcheck.app") errors.push({ client, field: "api_base_url", reason: "wrong_api_base_url" });
  if (proof.install_path !== "local_checkout_or_private_clone" && proof.install_path !== "published_npm_package") {
    errors.push({ client, field: "install_path", reason: "unexpected_install_path" });
  }
}
for (const check of requiredChecks) {
  if (!payload.required_checks?.includes(check)) errors.push({ field: "required_checks", reason: "missing_check", check });
}
for (const tool of allowedTools) {
  if (!payload.allowed_tools?.includes(tool)) errors.push({ field: "allowed_tools", reason: "missing_allowed_tool", tool });
}
for (const tool of forbiddenTools) {
  if (!payload.forbidden_customer_tools?.includes(tool)) errors.push({ field: "forbidden_customer_tools", reason: "missing_forbidden_tool", tool });
  const serialized = JSON.stringify(payload);
  if (payload.allowed_tools?.includes(tool)) errors.push({ field: "allowed_tools", reason: "forbidden_tool_allowed", tool });
  if (/"tools_called"\s*:\s*\[[^\]]*"[^"]*(gemini_watch|omni_watch|qwen|anthropic_fallback_oracle|deep_ai_review)[^"]*"/.test(serialized)) {
    errors.push({ field: "client_proofs.tools_called", reason: "forbidden_customer_tool_in_proof" });
  }
}

if (payload.status === "captured") {
  for (const proof of payload.client_proofs || []) {
    for (const field of ["workspace_id", "job_id", "verdict", "sanitized_evidence_timestamp"]) {
      if (!proof[field]) errors.push({ client: proof.client, field, reason: "required_when_captured" });
    }
    if (!proof.report_id && !proof.report_url) errors.push({ client: proof.client, field: "report_id_or_report_url", reason: "required_when_captured" });
    if (!proof.tools_called?.some((tool) => tool === "qc_get_cost_basis" || tool === "qc_estimate_cost")) {
      errors.push({ client: proof.client, field: "tools_called", reason: "missing_cost_preflight_when_captured" });
    }
    if (!proof.tools_called?.includes("qc_get_report")) {
      errors.push({ client: proof.client, field: "tools_called", reason: "missing_report_fetch_when_captured" });
    }
  }
}

if (errors.length) {
  console.error(JSON.stringify({ ok: false, evidencePath, errors }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  evidencePath,
  status: payload.status,
  requiredClients,
  capturedClients: (payload.client_proofs || []).filter((proof) => proof.status === "captured").map((proof) => proof.client),
  readyForPublicSubmission: payload.status === "captured" && requiredClients.every((client) => payload.client_proofs?.some((proof) => proof.client === client && proof.status === "captured"))
}, null, 2));
