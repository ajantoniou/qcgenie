#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const evidencePath = resolve(process.env.UPLOADCHECK_PRIVATE_MCP_BETA_EVIDENCE_PATH || "docs/private-mcp-beta-evidence-template.json");
const inputPath = process.argv[2] ? resolve(process.argv[2]) : "";

if (!inputPath) {
  console.error("Usage: npm run private-mcp-beta:capture -- /path/to/sanitized-client-proof.json");
  process.exit(1);
}

const evidence = JSON.parse(readFileSync(evidencePath, "utf8"));
const proof = JSON.parse(readFileSync(inputPath, "utf8"));
const errors = validateProof(proof, evidence);

if (errors.length) {
  console.error(JSON.stringify({ ok: false, inputPath, errors }, null, 2));
  process.exit(1);
}

const index = evidence.client_proofs.findIndex((item) => item.client === proof.client);
if (index === -1) {
  console.error(JSON.stringify({ ok: false, inputPath, errors: [{ field: "client", reason: "unexpected_client", client: proof.client }] }, null, 2));
  process.exit(1);
}

evidence.client_proofs[index] = {
  client: proof.client,
  status: "captured",
  workspace_id: proof.workspace_id,
  install_path: proof.install_path,
  api_base_url: proof.api_base_url,
  package_or_command: proof.package_or_command,
  tools_called: proof.tools_called,
  checks: proof.checks,
  job_id: proof.job_id,
  report_id: proof.report_id || null,
  report_url: proof.report_url || null,
  verdict: proof.verdict,
  sanitized_evidence_timestamp: proof.sanitized_evidence_timestamp,
  notes: proof.notes || "Sanitized external public GitHub MCP evidence captured."
};

const capturedClients = evidence.client_proofs.filter((item) => item.status === "captured").map((item) => item.client);
evidence.status = evidence.required_clients.every((client) => capturedClients.includes(client)) ? "captured" : "template_not_captured";

writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);

console.log(JSON.stringify({
  ok: true,
  evidencePath,
  capturedClient: proof.client,
  capturedClients,
  readyForPublicSubmission: evidence.status === "captured"
}, null, 2));

function validateProof(proof, evidence) {
  const errors = [];
  const requiredFields = [
    "client",
    "workspace_id",
    "install_path",
    "api_base_url",
    "package_or_command",
    "tools_called",
    "checks",
    "job_id",
    "verdict",
    "sanitized_evidence_timestamp"
  ];
  for (const field of requiredFields) {
    if (proof[field] == null || proof[field] === "" || (Array.isArray(proof[field]) && proof[field].length === 0)) {
      errors.push({ field, reason: "required" });
    }
  }
  if (!proof.report_id && !proof.report_url) errors.push({ field: "report_id_or_report_url", reason: "required" });
  if (!evidence.required_clients?.includes(proof.client)) errors.push({ field: "client", reason: "must_be_required_client" });
  if (proof.api_base_url !== "https://api.uploadcheck.app") errors.push({ field: "api_base_url", reason: "must_use_hosted_api" });
  if (!["public_github_clone_or_local_checkout", "published_npm_package"].includes(proof.install_path)) {
    errors.push({ field: "install_path", reason: "unexpected_install_path" });
  }
  if (!["PASS", "WATCH", "BLOCK", "NEEDS_REVIEW"].includes(proof.verdict)) {
    errors.push({ field: "verdict", reason: "unexpected_verdict" });
  }
  if (!/^\d{4}-\d{2}-\d{2}T/.test(String(proof.sanitized_evidence_timestamp || ""))) {
    errors.push({ field: "sanitized_evidence_timestamp", reason: "must_be_iso_timestamp" });
  }
  const allowedTools = new Set(evidence.allowed_tools || []);
  const forbiddenTools = new Set(evidence.forbidden_customer_tools || []);
  for (const tool of proof.tools_called || []) {
    if (!allowedTools.has(tool)) errors.push({ field: "tools_called", reason: "tool_not_allowed", tool });
    if (forbiddenTools.has(tool)) errors.push({ field: "tools_called", reason: "forbidden_tool", tool });
  }
  if (!proof.tools_called?.some((tool) => tool === "qc_get_cost_basis" || tool === "qc_estimate_cost")) {
    errors.push({ field: "tools_called", reason: "missing_cost_preflight" });
  }
  if (!proof.tools_called?.includes("qc_get_report")) {
    errors.push({ field: "tools_called", reason: "missing_report_fetch" });
  }
  const serialized = JSON.stringify(proof);
  const secretPatterns = [
    /uck_[A-Za-z0-9_-]{8,}/,
    /sk-[A-Za-z0-9_-]{8,}/,
    /api[_-]?key["':=\s]+[A-Za-z0-9_-]{8,}/i,
    /token["':=\s]+[A-Za-z0-9_-]{8,}/i,
    /sha256[:=][a-f0-9]{32,}/i
  ];
  for (const pattern of secretPatterns) {
    if (pattern.test(serialized)) errors.push({ field: "proof", reason: "possible_secret_or_hash_leak", pattern: String(pattern) });
  }
  for (const forbidden of evidence.forbidden_customer_tools || []) {
    if (serialized.includes(forbidden)) errors.push({ field: "proof", reason: "forbidden_internal_tool_mentioned", forbidden });
  }
  return errors;
}
