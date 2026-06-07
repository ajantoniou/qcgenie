#!/usr/bin/env node

const DEFAULT_BASE_URL = "https://api.uploadcheck.app";

export function validateLaunchStatusArtifact(payload) {
  const errors = [];
  if (payload?.name !== "UploadCheck.app Launch Status") {
    errors.push(error("launch_status.name", "wrong_name", "Launch status must identify UploadCheck.app."));
  }
  if (payload?.canonical_surfaces?.mcp_server !== "uploadcheck") {
    errors.push(error("launch_status.canonical_surfaces.mcp_server", "missing_uploadcheck_mcp", "Launch status must expose the uploadcheck MCP identity."));
  }
  if (payload?.canonical_surfaces?.cli_package !== "@drantoniou/uploadcheck" || payload?.canonical_surfaces?.mcp_package !== "@drantoniou/uploadcheck-mcp") {
    errors.push(error("launch_status.canonical_surfaces.packages", "missing_packages", "Launch status must expose @drantoniou/uploadcheck and @drantoniou/uploadcheck-mcp."));
  }
  if (payload?.product_hunt_ready !== true) {
    errors.push(error("launch_status.product_hunt_ready", "not_ready", "Static launch status must reflect the current launch-ready state."));
  }
  const blockers = (payload?.remaining_blockers || []).map((blocker) => blocker.id);
  if (blockers.length !== 0) {
    errors.push(error("launch_status.remaining_blockers", "stale_blockers", "Launch status must not preserve stale blockers after live readiness is clear."));
  }
  const commands = payload?.operator_commands || [];
  for (const command of [
    "npm run launch:doctor",
    "npm run saas-basics:verify",
    "npm run mcp-install:verify",
    "npm run private-mcp-beta:verify",
    "npm run private-mcp-beta:evidence",
    "npm run anthropic-directory:verify",
      "npm run product-agent:verify",
    "npm run live-public-artifacts:verify",
    "npm run live-launch-evidence:verify",
    "npm run live-cost-basis:verify",
    "npm run live-openapi:verify",
    "UPLOADCHECK_MEDIA_INGRESS_BASE_URL=https://api.uploadcheck.app UPLOADCHECK_API_KEY=<private_bearer> npm run media-ingress:verify"
  ]) {
    if (!commands.includes(command)) {
      errors.push(error("launch_status.operator_commands", "missing_command", `Missing operator command: ${command}`));
    }
  }
  const artifacts = payload?.public_artifacts || {};
  for (const key of ["launch_status", "product_hunt_launch_kit", "sample_reports", "cost_basis", "agent_manifest", "openapi", "npo_pipeline_handoff", "mcp_install", "live_launch_evidence"]) {
    if (!String(artifacts[key] || "").startsWith(DEFAULT_BASE_URL)) {
      errors.push(error(`launch_status.public_artifacts.${key}`, "missing_artifact_url", `Missing public artifact URL for ${key}.`));
    }
  }
  if (!String(payload?.go_no_go_rule || "").includes("readyForProductHunt=true") || !String(payload?.go_no_go_rule || "").includes("launch:doctor")) {
    errors.push(error("launch_status.go_no_go_rule", "weak_go_no_go", "Launch status must preserve the live go/no-go rule."));
  }
  return errors;
}

export function validateProductHuntLaunchKitArtifact(payload) {
  const errors = [];
  if (payload?.name !== "UploadCheck.app Product Hunt Launch Kit") {
    errors.push(error("product_hunt_launch_kit.name", "wrong_name", "Product Hunt kit must identify UploadCheck.app."));
  }
  if (payload?.product?.tagline !== "Quality check videos, podcasts, and clips before you upload.") {
    errors.push(error("product_hunt_launch_kit.product.tagline", "wrong_tagline", "Product Hunt kit must publish the canonical tagline."));
  }
  const proof = JSON.stringify(payload?.launch_copy?.proof_points || []);
  for (const required of ["Global Codex MCP server: uploadcheck", "Public PASS, WATCH, and BLOCK sample reports", "95% gross-margin target"]) {
    if (!proof.includes(required)) {
      errors.push(error("product_hunt_launch_kit.launch_copy.proof_points", "missing_proof_point", `Missing proof point: ${required}`));
    }
  }
  const links = payload?.public_links || {};
  for (const key of ["sample_reports_index", "block_sample_report", "cost_basis", "pipeline_handoff", "pipeline_recipes", "npo_pipeline_handoff", "mcp_install", "agent_manifest", "openapi", "launch_status", "live_launch_status", "live_launch_doctor", "live_launch_evidence"]) {
    if (!String(links[key] || "").startsWith(DEFAULT_BASE_URL)) {
      errors.push(error(`product_hunt_launch_kit.public_links.${key}`, "missing_public_link", `Missing public link for ${key}.`));
    }
  }
  if (payload?.pricing_position?.studio !== "$299/mo for 10,000 checked minutes") {
    errors.push(error("product_hunt_launch_kit.pricing_position.studio", "wrong_studio_price", "Product Hunt kit must preserve Studio $299 / 10,000 checked minutes."));
  }
  if (!String(payload?.pricing_position?.stress_plan_verdict || "").includes("too generous")) {
    errors.push(error("product_hunt_launch_kit.pricing_position.stress_plan_verdict", "missing_stress_verdict", "Product Hunt kit must preserve the $99 / 5,000 warning."));
  }
  const requiredCommands = payload?.ready_when?.required_commands || [];
  for (const command of ["npm run launch:doctor", "npm run saas-basics:verify", "npm run mcp-install:verify", "npm run private-mcp-beta:verify", "npm run private-mcp-beta:evidence", "npm run anthropic-directory:verify",
      "npm run product-agent:verify", "npm run live-public-artifacts:verify", "npm run live-launch-evidence:verify", "npm run launch:check"]) {
    if (!requiredCommands.includes(command)) {
      errors.push(error("product_hunt_launch_kit.ready_when.required_commands", "missing_required_command", `Missing required command: ${command}`));
    }
  }
  if (payload?.current_state_snapshot?.product_hunt_ready !== true || (payload?.current_state_snapshot?.remaining_blockers || []).length !== 0) {
    errors.push(error("product_hunt_launch_kit.current_state_snapshot", "stale_snapshot", "Product Hunt kit current snapshot must reflect launch-ready static status."));
  }
  return errors;
}

export function validateSampleReportsArtifact(payload) {
  const errors = [];
  if (payload?.name !== "UploadCheck Public Sample Reports") {
    errors.push(error("sample_reports.name", "wrong_name", "Sample reports index must identify UploadCheck public reports."));
  }
  const reports = payload?.reports || [];
  const verdicts = new Map(reports.map((report) => [report.verdict, report]));
  for (const verdict of ["PASS", "WATCH", "BLOCK"]) {
    if (!verdicts.has(verdict)) {
      errors.push(error("sample_reports.reports", "missing_verdict", `Sample reports must include ${verdict}.`));
    }
  }
  const block = reports.find((report) => report.id === "duplicate-characters-block");
  if (!block || !String(block.purpose || "").includes("more character variation")) {
    errors.push(error("sample_reports.reports.duplicate-characters-block", "missing_clone_crowd_sample", "Sample reports must keep duplicate-character BLOCK proof."));
  }
  for (const report of reports) {
    if (!String(report.url || "").startsWith(`${DEFAULT_BASE_URL}/sample-reports/`)) {
      errors.push(error(`sample_reports.reports.${report.id || "unknown"}.url`, "wrong_report_url", "Sample report URLs must point at hosted sample reports."));
    }
  }
  return errors;
}

export function validateSampleReportDetailsArtifact(index, detailsById) {
  const errors = [];
  const reports = index?.reports || [];
  for (const report of reports) {
    const detail = detailsById?.[report.id];
    if (!detail) {
      errors.push(error(`sample_report_details.${report.id || "unknown"}`, "missing_detail", `Missing sample report detail for ${report.id}.`));
      continue;
    }
    if (detail.verdict !== report.verdict || detail.gateVerdict !== report.verdict) {
      errors.push(error(`sample_report_details.${report.id}.verdict`, "verdict_mismatch", `Detail verdict must match index verdict ${report.verdict}.`));
    }
    if (!detail.mediaIngress?.sha256 || String(detail.mediaIngress.sha256).length < 32) {
      errors.push(error(`sample_report_details.${report.id}.mediaIngress.sha256`, "missing_source_hash", "Sample detail must include checked-byte source hash proof."));
    }
    if (!detail.costEstimate?.targetGrossMarginPct || !Number.isFinite(Number(detail.costEstimate?.estimatedCostPerMinuteCents ?? detail.costEstimate?.observedCostPerMinuteCents))) {
      errors.push(error(`sample_report_details.${report.id}.costEstimate`, "missing_cost_proof", "Sample detail must include cost/minute and margin proof."));
    }
    if (!Array.isArray(detail.artifacts) || !detail.artifacts.some((artifact) => artifact.artifactType === "marker_export")) {
      errors.push(error(`sample_report_details.${report.id}.artifacts`, "missing_marker_export", "Sample detail must expose marker export proof."));
    }
    if (!String(detail.repairLoop?.nextAction || "").length) {
      errors.push(error(`sample_report_details.${report.id}.repairLoop`, "missing_repair_loop", "Sample detail must include repair-loop next action."));
    }
  }

  const pass = detailsById?.["clean-upload"];
  if (pass && (!Array.isArray(pass.flags) || pass.flags.length !== 0 || pass.verdict !== "PASS")) {
    errors.push(error("sample_report_details.clean-upload", "bad_pass_sample", "Clean sample must be PASS with zero flags."));
  }

  const watch = detailsById?.["caption-warning"];
  if (watch) {
    if (watch.verdict !== "WATCH" || !watch.flags?.some((flag) => flag.severity === "warn" && flag.fixability === "agent_fixable")) {
      errors.push(error("sample_report_details.caption-warning", "bad_watch_sample", "Caption sample must be WATCH with an agent-fixable warning."));
    }
    if (!String(watch.repairLoop?.nextAction || "").includes("Fix now")) {
      errors.push(error("sample_report_details.caption-warning.repairLoop", "missing_fix_now", "WATCH sample must preserve the Fix now repair loop."));
    }
  }

  const block = detailsById?.["duplicate-characters-block"];
  if (block) {
    const serialized = JSON.stringify(block);
    if (block.verdict !== "BLOCK" || !block.flags?.some((flag) => flag.gate === "twins" && flag.severity === "block")) {
      errors.push(error("sample_report_details.duplicate-characters-block", "bad_block_sample", "Duplicate-character sample must be BLOCK on the twins gate."));
    }
    for (const value of ["needs_more_character_variation=true", "more distinct characters", "source_or_render_required"]) {
      if (!serialized.includes(value)) {
        errors.push(error("sample_report_details.duplicate-characters-block", "missing_clone_crowd_detail", `Duplicate-character BLOCK sample missing ${value}.`));
      }
    }
    if (block.costEstimate?.observedMarginSafe !== false || !String(block.costEstimate?.marginNote || "").includes("not unlimited")) {
      errors.push(error("sample_report_details.duplicate-characters-block.costEstimate", "missing_model_cost_warning", "BLOCK sample must show model-backed review is not unlimited on included minutes."));
    }
  }

  return errors;
}

export function validateLlmsArtifact(text) {
  const errors = [];
  const required = [
    "UploadCheck.app",
    "Quality check videos, podcasts, and clips before you upload.",
    "MCP server name: uploadcheck.",
    "Current distribution state: public npm MCP install plus public GitHub/local checkout.",
    "Current install path: public npm or GitHub checkout.",
    "Use @drantoniou/uploadcheck and @drantoniou/uploadcheck-mcp from npm.",
    "https://api.uploadcheck.app/product-hunt-launch-kit.json",
    "https://api.uploadcheck.app/mcp-install.json",
    "https://api.uploadcheck.app/sample-reports/index.json",
    "https://api.uploadcheck.app/v1/launch-evidence",
    "Checked minutes are deterministic publish-readiness QC minutes",
    "Internal AI helps improve the QC engine",
    "report feeds back to the user's LLM",
    "Included minutes reset monthly and do not roll over",
    "no public self-serve extra-minute or credit purchase flow yet",
    "NTO/NPO pipeline profiles"
  ];
  for (const value of required) {
    if (!String(text || "").includes(value)) {
      errors.push(error("llms.txt", "missing_text", `llms.txt missing: ${value}`));
    }
  }
  return errors;
}

export function validateMcpInstallArtifact(payload) {
  const errors = [];
  if (payload?.name !== "uploadcheck") {
    errors.push(error("mcp_install.name", "wrong_server_name", "MCP install artifact must identify the uploadcheck server."));
  }
  if (payload?.package !== "@drantoniou/uploadcheck-mcp" || payload?.binary !== "uploadcheck-mcp") {
    errors.push(error("mcp_install.package", "wrong_package", "MCP install artifact must expose @drantoniou/uploadcheck-mcp and @drantoniou/uploadcheck-mcp."));
  }
  if (payload?.distribution_status !== "public_npm_mcp_ready") {
    errors.push(error("mcp_install.distribution_status", "missing_public_npm_status", "MCP install artifact must identify the current public npm status."));
  }
  if (payload?.current_install !== "public_npm_or_github_checkout") {
    errors.push(error("mcp_install.current_install", "missing_current_public_npm_install", "MCP install artifact must keep npm/GitHub checkout as the current install path."));
  }
  if (!String(payload?.future_npm_install || "").includes("npx -y @drantoniou/uploadcheck-mcp")) {
    errors.push(error("mcp_install.future_npm_install", "missing_npm_install", "MCP install artifact must expose the npm install command."));
  }
  if (payload?.environment?.UPLOADCHECK_API_BASE_URL !== DEFAULT_BASE_URL) {
    errors.push(error("mcp_install.environment.UPLOADCHECK_API_BASE_URL", "wrong_api_base", "MCP install artifact must default to the hosted API."));
  }
  if (payload?.environment?.UPLOADCHECK_API_KEY !== "<workspace_api_key>") {
    errors.push(error("mcp_install.environment.UPLOADCHECK_API_KEY", "missing_workspace_key_placeholder", "MCP install artifact must require a workspace API key."));
  }
  if (!payload?.codex_local?.toml?.includes('UPLOADCHECK_API_KEY = "<workspace_api_key>"')) {
    errors.push(error("mcp_install.codex_local.toml", "missing_codex_workspace_key_placeholder", "Codex install snippet must include the workspace API-key placeholder."));
  }
  if (payload?.claude_desktop_local?.json?.mcpServers?.uploadcheck?.command !== "node") {
    errors.push(error("mcp_install.claude_desktop_local", "missing_claude_local_node_install", "Claude local snippet must use a public GitHub/local checkout path."));
  }
  if (payload?.cursor_local?.json?.mcpServers?.uploadcheck?.command !== "node") {
    errors.push(error("mcp_install.cursor_local", "missing_cursor_local_node_install", "Cursor local snippet must use a public GitHub/local checkout path."));
  }
  if (payload?.claude_desktop?.json?.mcpServers?.uploadcheck?.env?.UPLOADCHECK_API_KEY !== "<workspace_api_key>") {
    errors.push(error("mcp_install.claude_desktop", "missing_claude_workspace_key_placeholder", "Claude install snippet must include the workspace API-key placeholder."));
  }
  if (payload?.cursor?.json?.mcpServers?.uploadcheck?.env?.UPLOADCHECK_API_KEY !== "<workspace_api_key>") {
    errors.push(error("mcp_install.cursor", "missing_cursor_workspace_key_placeholder", "Cursor install snippet must include the workspace API-key placeholder."));
  }
  if (!payload?.notes?.some((note) => String(note).includes("workspace API key tied to included plan minutes"))) {
    errors.push(error("mcp_install.notes", "missing_included_minutes_workspace_key_note", "MCP install artifact must state public GitHub/local users need workspace keys tied to included plan minutes."));
  }
  return errors;
}

export function validatePublicArtifacts({ launchStatus, productHuntLaunchKit, sampleReports, sampleReportDetails = {}, mcpInstall, llms }) {
  return [
    ...validateLaunchStatusArtifact(launchStatus),
    ...validateProductHuntLaunchKitArtifact(productHuntLaunchKit),
    ...validateSampleReportsArtifact(sampleReports),
    ...validateSampleReportDetailsArtifact(sampleReports, sampleReportDetails),
    ...validateMcpInstallArtifact(mcpInstall),
    ...validateLlmsArtifact(llms)
  ];
}

async function main() {
  const baseUrl = trimTrailingSlash(process.env.UPLOADCHECK_LIVE_PUBLIC_ARTIFACTS_BASE_URL || DEFAULT_BASE_URL);
  const urls = {
    launchStatus: `${baseUrl}/launch-status.json`,
    productHuntLaunchKit: `${baseUrl}/product-hunt-launch-kit.json`,
    sampleReports: `${baseUrl}/sample-reports/index.json`,
    mcpInstall: `${baseUrl}/mcp-install.json`,
    llms: `${baseUrl}/llms.txt`
  };

  try {
    const [launchStatus, productHuntLaunchKit, sampleReports, mcpInstall, llms] = await Promise.all([
      fetchJson(urls.launchStatus, "launch status"),
      fetchJson(urls.productHuntLaunchKit, "Product Hunt launch kit"),
      fetchJson(urls.sampleReports, "sample reports"),
      fetchJson(urls.mcpInstall, "MCP install"),
      fetchText(urls.llms, "llms.txt")
    ]);
    const sampleReportDetails = {};
    for (const report of sampleReports.reports || []) {
      sampleReportDetails[report.id] = await fetchJson(rewriteReportUrl(report.url, baseUrl), `sample report ${report.id}`);
    }
    const errors = validatePublicArtifacts({ launchStatus, productHuntLaunchKit, sampleReports, sampleReportDetails, mcpInstall, llms });
    if (errors.length) {
      fail(`UploadCheck live public artifacts: NOT READY\n${JSON.stringify({ urls, sampleReportUrls: Object.fromEntries((sampleReports.reports || []).map((report) => [report.id, rewriteReportUrl(report.url, baseUrl)])), errors }, null, 2)}`);
    }
    console.log(JSON.stringify({
      ok: true,
      urls,
      launchStatusReady: Boolean(launchStatus.product_hunt_ready),
      blockerCount: launchStatus.remaining_blockers?.length || 0,
      sampleReportCount: sampleReports.reports?.length || 0,
      sampleReportDetailCount: Object.keys(sampleReportDetails).length,
      mcpInstallPackage: mcpInstall.package,
      llmsBytes: Buffer.byteLength(llms)
    }, null, 2));
  } catch (err) {
    fail(`UploadCheck live public artifacts: NOT READY\n${err.message}`);
  }
}

async function fetchJson(url, label) {
  const response = await fetch(url);
  const contentType = response.headers.get("content-type") || "";
  const text = await response.text();
  if (!response.ok) throw new Error(`${label} ${url} returned HTTP ${response.status}`);
  if (!contentType.includes("application/json")) throw new Error(`${label} ${url} returned ${contentType || "unknown content type"} instead of application/json`);
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${label} ${url} returned invalid JSON: ${error.message}`);
  }
}

async function fetchText(url, label) {
  const response = await fetch(url);
  const text = await response.text();
  if (!response.ok) throw new Error(`${label} ${url} returned HTTP ${response.status}`);
  return text;
}

function error(key, reason, detail) {
  return { key, reason, detail };
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function trimTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

function rewriteReportUrl(url, baseUrl) {
  try {
    const parsed = new URL(url);
    const base = new URL(baseUrl);
    parsed.protocol = base.protocol;
    parsed.host = base.host;
    return parsed.toString();
  } catch {
    return new URL(String(url || "").replace(/^\/+/, ""), `${baseUrl}/`).toString();
  }
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], "file://").href) {
  await main();
}
