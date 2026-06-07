#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const draftPath = resolve("docs/anthropic-directory-draft.json");
const prepPath = resolve("docs/ANTHROPIC-DIRECTORY.md");
const betaPath = resolve("docs/PRIVATE-MCP-BETA.md");
const betaEvidencePath = resolve("docs/private-mcp-beta-evidence-template.json");
const installPath = resolve("mcp-server/mcp-install.json");

const draft = JSON.parse(readFileSync(draftPath, "utf8"));
const prep = readFileSync(prepPath, "utf8");
const beta = readFileSync(betaPath, "utf8");
const betaEvidence = JSON.parse(readFileSync(betaEvidencePath, "utf8"));
const install = JSON.parse(readFileSync(installPath, "utf8"));

const expectedTools = [
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

const forbiddenPublic = [
  "qc_run_gemini_backtest",
  "gemini_watch",
  "omni_watch",
  "qwen",
  "anthropic_fallback_oracle",
  "deep_ai_review"
];

const requiredEvidenceCommands = [
  "npm run packages:verify",
  "npm run packages:install-smoke",
  "npm run npm-publish:preflight",
  "npm run mcp-install:verify",
  "npm run product-agent:verify",
  "npm run private-mcp-beta:verify",
  "npm run private-mcp-beta:evidence",
  "npm run private-mcp-beta:capture -- /path/to/sanitized-client-proof.json",
  "npm run checkout-launch:verify",
  "npm run saas-basics:verify",
  "npm run codex:verify-install",
  "npm run build",
  "npm run readiness:check",
  "npm run live-mcp-install:verify"
];

const requiredSubmissionEvidence = [
  "Registry proof that @drantoniou/uploadcheck and @drantoniou/uploadcheck-mcp are published.",
  "Read-only npm publish preflight proof from npm run npm-publish:preflight.",
  "Hosted /mcp-install.json proof from npm run live-mcp-install:verify after Render redeploy.",
  "Paid workspace API-key proof from hosted QC job creation through report fetch.",
  "Checkout proof from configured Lemon Squeezy checkout URLs or Creator, Studio, and Network variants.",
  "Webhook proof that X-Signature HMAC-SHA256 is verified with UPLOADCHECK_LEMONSQUEEZY_WEBHOOK_SECRET before API-key provisioning.",
  "Abuse-limit proof that over-limit usage blocks before QC compute and records operator-reviewable abuse events.",
  "Spend-alert proof that GET /v1/spend-alerts returns a Resend-backed alert after billable extra-minute spend crosses subscription value, with COGS retained as audit context.",
  "Public npm MCP client evidence from Claude Code, Codex, and Cursor using workspace API keys, captured in docs/private-mcp-beta-evidence-template.json.",
  "No-public-oracle proof that package files, MCP manifests, README copy, and Directory copy do not expose gemini_watch, omni_watch, qwen, anthropic_fallback_oracle, or deep_ai_review as customer tools."
];

const errors = [];

if (draft.status !== "public_npm_mcp_not_ready_for_directory") {
  errors.push({ key: "status", reason: "must_not_claim_directory_ready" });
}
if (draft.mcp_server_name !== "uploadcheck") errors.push({ key: "mcp_server_name", reason: "expected_uploadcheck" });
if (draft.distribution?.package !== "@drantoniou/uploadcheck-mcp") errors.push({ key: "distribution.package", reason: "expected_mcp_package" });
if (draft.distribution?.requires_workspace_api_key !== true) errors.push({ key: "distribution.requires_workspace_api_key", reason: "must_require_workspace_api_key" });
if (draft.distribution?.requires_included_minutes_workspace !== true) errors.push({ key: "distribution.requires_included_minutes_workspace", reason: "must_require_included_minutes_workspace" });
if (JSON.stringify(draft.public_tools) !== JSON.stringify(expectedTools)) {
  errors.push({ key: "public_tools", reason: "unexpected_public_tool_scope", expected: expectedTools, actual: draft.public_tools });
}
if (draft.billing_boundary?.included_unit !== "deterministic publish-readiness QC minutes") {
  errors.push({ key: "billing_boundary.included_unit", reason: "must_sell_deterministic_minutes" });
}
if (draft.billing_boundary?.public_ai_review_budget_seconds !== 0) {
  errors.push({ key: "billing_boundary.public_ai_review_budget_seconds", reason: "public_ai_budget_must_be_zero" });
}
if (!Array.isArray(draft.submission_blockers) || draft.submission_blockers.length < 5) {
  errors.push({ key: "submission_blockers", reason: "missing_submission_blockers" });
}
if (!draft.submission_blockers?.some((blocker) => blocker.includes("saas-basics:verify"))) {
  errors.push({ key: "submission_blockers", reason: "missing_saas_basics_submission_blocker" });
}
if (!draft.submission_blockers?.some((blocker) => blocker.includes("docs/private-mcp-beta-evidence-template.json"))) {
  errors.push({ key: "submission_blockers", reason: "missing_beta_evidence_submission_blocker" });
}
if (JSON.stringify(draft.required_evidence_commands) !== JSON.stringify(requiredEvidenceCommands)) {
  errors.push({
    key: "required_evidence_commands",
    reason: "unexpected_required_evidence_commands",
    expected: requiredEvidenceCommands,
    actual: draft.required_evidence_commands
  });
}
if (JSON.stringify(draft.submission_evidence) !== JSON.stringify(requiredSubmissionEvidence)) {
  errors.push({
    key: "submission_evidence",
    reason: "unexpected_submission_evidence",
    expected: requiredSubmissionEvidence,
    actual: draft.submission_evidence
  });
}
if (draft.connector_decision?.chatgpt_or_openai_connector !== "defer") {
  errors.push({ key: "connector_decision.chatgpt_or_openai_connector", reason: "openai_connector_must_be_deferred" });
}
if (!draft.connector_decision?.reason?.includes("hosted HTTPS MCP")) {
  errors.push({ key: "connector_decision.reason", reason: "missing_hosted_https_mcp_connector_gate" });
}
if (draft.connector_decision?.next_channel !== "Anthropic Directory after public npm MCP install proof") {
  errors.push({ key: "connector_decision.next_channel", reason: "unexpected_next_channel" });
}

const publicScope = JSON.stringify({
  public_tools: draft.public_tools,
  short_description: draft.short_description,
  long_description: draft.long_description
}).toLowerCase();
for (const forbidden of forbiddenPublic) {
  if (publicScope.includes(forbidden.toLowerCase())) {
    errors.push({ key: "public_scope", reason: "forbidden_internal_oracle_leak", forbidden });
  }
}

for (const tool of expectedTools) {
  if (!prep.includes(`- \`${tool}\``)) errors.push({ key: "docs/ANTHROPIC-DIRECTORY.md", reason: "missing_tool_in_prep_doc", tool });
}

if (!prep.includes("UploadCheck is currently a public npm MCP install with public GitHub/local checkout fallback, not an Anthropic Directory-ready public listing.")) {
  errors.push({ key: "docs/ANTHROPIC-DIRECTORY.md", reason: "missing_not_ready_warning" });
}
if (!prep.includes("docs/PRIVATE-MCP-BETA.md")) {
  errors.push({ key: "docs/ANTHROPIC-DIRECTORY.md", reason: "missing_private_beta_handoff_link" });
}
if (!prep.includes("npm run saas-basics:verify")) {
  errors.push({ key: "docs/ANTHROPIC-DIRECTORY.md", reason: "missing_saas_basics_evidence_command" });
}
for (const command of requiredEvidenceCommands) {
  if (!prep.includes(command)) {
    errors.push({ key: "docs/ANTHROPIC-DIRECTORY.md", reason: "missing_required_evidence_command", command });
  }
}
for (const evidence of [
  "GET /v1/spend-alerts",
  "billable extra-minute spend",
  "Public npm MCP proof from Claude Code, Codex, and Cursor using workspace API keys and the public MCP tool surface only, captured in `docs/private-mcp-beta-evidence-template.json`",
  "Do not apply for a broad connector or ChatGPT app yet.",
  "Hosted HTTPS MCP endpoint"
]) {
  if (!prep.includes(evidence)) {
    errors.push({ key: "docs/ANTHROPIC-DIRECTORY.md", reason: "missing_directory_decision_or_evidence", evidence });
  }
}
if (!beta.includes("External Claude Code, Codex, Cursor, and MCP clients must use a workspace API key")) {
  errors.push({ key: "docs/PRIVATE-MCP-BETA.md", reason: "missing_workspace_key_rule" });
}
if (!beta.includes("Run `npm run private-mcp-beta:evidence` before treating the proof contract as valid.")) {
  errors.push({ key: "docs/PRIVATE-MCP-BETA.md", reason: "missing_beta_evidence_contract_command" });
}
if (!beta.includes("npm run private-mcp-beta:capture -- /path/to/sanitized-client-proof.json")) {
  errors.push({ key: "docs/PRIVATE-MCP-BETA.md", reason: "missing_beta_evidence_capture_command" });
}
for (const client of ["claude_code", "codex", "cursor"]) {
  if (!betaEvidence.required_clients?.includes(client)) {
    errors.push({ key: "docs/private-mcp-beta-evidence-template.json", reason: "missing_required_client", client });
  }
}
for (const forbidden of ["gemini_watch", "omni_watch", "qwen", "anthropic_fallback_oracle", "deep_ai_review"]) {
  if (betaEvidence.allowed_tools?.includes(forbidden)) {
    errors.push({ key: "docs/private-mcp-beta-evidence-template.json", reason: "forbidden_tool_allowed", forbidden });
  }
  if (!betaEvidence.forbidden_customer_tools?.includes(forbidden)) {
    errors.push({ key: "docs/private-mcp-beta-evidence-template.json", reason: "missing_forbidden_tool", forbidden });
  }
}
if (install.distribution_status !== "public_npm_mcp_ready") {
  errors.push({ key: "mcp-server/mcp-install.json", reason: "missing_public_npm_distribution_status" });
}
if (install.current_install !== "public_npm_or_github_checkout") {
  errors.push({ key: "mcp-server/mcp-install.json", reason: "missing_public_npm_or_github_current_install" });
}
if (!install.notes?.some((note) => note.includes("workspace API key tied to included plan minutes"))) {
  errors.push({ key: "mcp-server/mcp-install.json", reason: "missing_included_minutes_workspace_key_note" });
}
if (!install.codex_local?.toml?.includes('UPLOADCHECK_API_KEY = "<workspace_api_key>"')) {
  errors.push({ key: "mcp-server/mcp-install.json", reason: "missing_codex_api_key_placeholder" });
}

if (errors.length) {
  console.error(JSON.stringify({ ok: false, errors }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  draft: "docs/anthropic-directory-draft.json",
  status: draft.status,
  publicTools: draft.public_tools
}, null, 2));
