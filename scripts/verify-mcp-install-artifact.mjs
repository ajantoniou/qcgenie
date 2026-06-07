#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const packageManifestPath = "mcp-server/mcp-install.json";
const publicManifestPath = "public/mcp-install.json";
const agentManifestPath = "public/agent-manifest.json";
const openapiPath = "public/openapi.json";

const packageManifest = readJson(packageManifestPath);
const publicManifest = readJson(publicManifestPath);
const agentManifest = readJson(agentManifestPath);
const openapi = readJson(openapiPath);
const errors = [];

if (JSON.stringify(publicManifest) !== JSON.stringify(packageManifest)) {
  errors.push({ key: "public/mcp-install.json", reason: "manifest_drift", detail: "Public MCP install artifact must match mcp-server/mcp-install.json semantically." });
}

if (agentManifest.mcp_install_url !== "https://api.uploadcheck.app/mcp-install.json") {
  errors.push({ key: "agent-manifest.mcp_install_url", reason: "missing_public_mcp_install_url" });
}
if (agentManifest.distribution?.status !== "public_npm_mcp_ready") {
  errors.push({ key: "agent-manifest.distribution.status", reason: "missing_public_npm_status" });
}
if (agentManifest.distribution?.current_install !== "public_npm_or_github_checkout") {
  errors.push({ key: "agent-manifest.distribution.current_install", reason: "missing_public_npm_or_github_install" });
}
if (agentManifest.distribution?.public_download_ready !== true) {
  errors.push({ key: "agent-manifest.distribution.public_download_ready", reason: "must_claim_public_github_download_ready" });
}
if (agentManifest.distribution?.anthropic_directory_ready !== false) {
  errors.push({ key: "agent-manifest.distribution.anthropic_directory_ready", reason: "must_not_claim_directory_ready" });
}
if (!String(agentManifest.distribution?.npm_install || agentManifest.distribution?.future_npm_install || "").includes("npx -y @drantoniou/uploadcheck-mcp")) {
  errors.push({ key: "agent-manifest.distribution.npm_install", reason: "missing_npm_install" });
}
if (!String(agentManifest.distribution?.openai_connector || "").includes("defer")) {
  errors.push({ key: "agent-manifest.distribution.openai_connector", reason: "missing_connector_defer_rule" });
}
if (agentManifest.workspace_key_contract?.private_beta_required !== false) {
  errors.push({ key: "agent-manifest.workspace_key_contract.private_beta_required", reason: "must_not_require_private_beta" });
}
if (!String(agentManifest.workspace_key_contract?.external_users_need || "").includes("workspace API key tied to included plan minutes")) {
  errors.push({ key: "agent-manifest.workspace_key_contract.external_users_need", reason: "missing_included_minutes_workspace_key_rule" });
}
const workspaceKeyBehavior = (agentManifest.workspace_key_contract?.stored_key_behavior || []).join("\n");
for (const marker of [
  "Returned once, stored hashed",
  "Forces server-side workspace, owner, plan",
  "Can only read, report, cancel",
  "API-key review or provisioning scopes"
]) {
  if (!workspaceKeyBehavior.includes(marker)) {
    errors.push({ key: "agent-manifest.workspace_key_contract.stored_key_behavior", reason: "missing_behavior_marker", marker });
  }
}
for (const endpoint of [
  "GET /v1/api-keys?workspace_id=",
  "GET /v1/abuse-events?workspace_id=&limit=",
  "GET /v1/spend-alerts?workspace_id=&limit=",
  "POST /v1/checkout/provision-api-key",
  "POST /v1/webhooks/lemonsqueezy"
]) {
  const lists = [
    ...(agentManifest.workspace_key_contract?.operator_review_endpoints || []),
    ...(agentManifest.workspace_key_contract?.checkout_provisioning_endpoints || []),
    ...(agentManifest.primary_endpoints || [])
  ];
  if (!lists.includes(endpoint)) {
    errors.push({ key: "agent-manifest.workspace_key_contract", reason: "missing_endpoint", endpoint });
  }
}

if (!openapi.paths?.["/mcp-install.json"]?.get) {
  errors.push({ key: "openapi.paths./mcp-install.json", reason: "missing_public_metadata_endpoint" });
}

for (const [label, manifest] of [["package", packageManifest], ["public", publicManifest]]) {
  if (manifest.name !== "uploadcheck") errors.push({ key: `${label}.name`, reason: "wrong_server_name" });
  if (manifest.package !== "@drantoniou/uploadcheck-mcp") errors.push({ key: `${label}.package`, reason: "wrong_package" });
  if (manifest.binary !== "uploadcheck-mcp") errors.push({ key: `${label}.binary`, reason: "wrong_binary" });
  if (manifest.distribution_status !== "public_npm_mcp_ready") errors.push({ key: `${label}.distribution_status`, reason: "missing_public_npm_status" });
  if (manifest.current_install !== "public_npm_or_github_checkout") errors.push({ key: `${label}.current_install`, reason: "missing_public_npm_or_github_install" });
  if (!String(manifest.npm_install || manifest.future_npm_install || "").includes("npx -y @drantoniou/uploadcheck-mcp")) errors.push({ key: `${label}.npm_install`, reason: "missing_npm_install" });
  if (manifest.environment?.UPLOADCHECK_API_KEY !== "<workspace_api_key>") errors.push({ key: `${label}.environment.UPLOADCHECK_API_KEY`, reason: "missing_workspace_key_placeholder" });
  if (!manifest.codex_local?.toml?.includes('UPLOADCHECK_API_KEY = "<workspace_api_key>"')) errors.push({ key: `${label}.codex_local.toml`, reason: "missing_codex_workspace_key_placeholder" });
  if (manifest.claude_desktop_local?.json?.mcpServers?.uploadcheck?.command !== "node") errors.push({ key: `${label}.claude_desktop_local`, reason: "missing_claude_local_node_install" });
  if (manifest.claude_desktop_local?.json?.mcpServers?.uploadcheck?.env?.UPLOADCHECK_API_KEY !== "<workspace_api_key>") errors.push({ key: `${label}.claude_desktop_local`, reason: "missing_claude_local_workspace_key_placeholder" });
  if (manifest.cursor_local?.json?.mcpServers?.uploadcheck?.command !== "node") errors.push({ key: `${label}.cursor_local`, reason: "missing_cursor_local_node_install" });
  if (manifest.cursor_local?.json?.mcpServers?.uploadcheck?.env?.UPLOADCHECK_API_KEY !== "<workspace_api_key>") errors.push({ key: `${label}.cursor_local`, reason: "missing_cursor_local_workspace_key_placeholder" });
  if (manifest.claude_desktop?.json?.mcpServers?.uploadcheck?.env?.UPLOADCHECK_API_KEY !== "<workspace_api_key>") errors.push({ key: `${label}.claude_desktop`, reason: "missing_claude_workspace_key_placeholder" });
  if (manifest.cursor?.json?.mcpServers?.uploadcheck?.env?.UPLOADCHECK_API_KEY !== "<workspace_api_key>") errors.push({ key: `${label}.cursor`, reason: "missing_cursor_workspace_key_placeholder" });
  if (!manifest.notes?.some((note) => note.includes("workspace API key tied to included plan minutes"))) errors.push({ key: `${label}.notes`, reason: "missing_workspace_key_note" });
  if (!manifest.notes?.some((note) => note.includes("Npm install readiness is live"))) errors.push({ key: `${label}.notes`, reason: "missing_npm_ready_rule" });
}

if (errors.length) {
  console.error(JSON.stringify({ ok: false, errors }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  publicArtifact: publicManifestPath,
  packageArtifact: packageManifestPath,
  hostedUrl: agentManifest.mcp_install_url
}, null, 2));

function readJson(path) {
  return JSON.parse(readFileSync(resolve(path), "utf8"));
}
