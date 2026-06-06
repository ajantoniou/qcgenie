#!/usr/bin/env node
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const THIS_FILE = fileURLToPath(import.meta.url);

async function main() {
  const baseUrl = trimTrailingSlash(process.env.UPLOADCHECK_LIVE_AGENT_MANIFEST_BASE_URL || "https://api.uploadcheck.app");
  const url = `${baseUrl}/agent-manifest.json`;

  try {
    const response = await fetch(url);
    const contentType = response.headers.get("content-type") || "";
    const text = await response.text();
    if (!response.ok) {
      fail(`UploadCheck live agent manifest: NOT READY\n${url} returned HTTP ${response.status}`);
    }
    if (!contentType.includes("application/json")) {
      fail(`UploadCheck live agent manifest: NOT READY\n${url} returned ${contentType || "unknown content type"} instead of application/json`);
    }

    let payload;
    try {
      payload = JSON.parse(text);
    } catch (error) {
      fail(`UploadCheck live agent manifest: NOT READY\n${url} returned invalid JSON: ${error.message}`);
    }

    const errors = validateAgentManifest(payload);
    if (errors.length) {
      fail(`UploadCheck live agent manifest: NOT READY\n${JSON.stringify({ url, errors }, null, 2)}`);
    }

    console.log(JSON.stringify({
      ok: true,
      url,
      name: payload.name,
      mcpServer: payload.mcp_server,
      packages: payload.packages,
      toolCount: payload.tools.length,
      profileCount: payload.pipeline_profiles.length,
      apiBaseUrl: payload.api_base_url,
      costBasisUrl: payload.cost_basis_url,
      liveLaunchEvidenceUrl: payload.live_launch_evidence_url
    }, null, 2));
  } catch (error) {
    fail(`UploadCheck live agent manifest: NOT READY\n${error.message}`);
  }
}

export function validateAgentManifest(payload = {}) {
  const errors = [];
  requireEqual(errors, payload.name, "UploadCheck.app", "name");
  requireEqual(errors, payload.mcp_server, "uploadcheck", "mcp_server");
  requireEqual(errors, payload.slash_command, "/check", "slash_command");
  requireEqual(errors, payload.api_base_url, "https://api.uploadcheck.app/v1", "api_base_url");
  requireEqual(errors, payload.live_launch_evidence_url, "https://api.uploadcheck.app/v1/launch-evidence", "live_launch_evidence_url");
  requireEqual(errors, payload.cost_basis_url, "https://api.uploadcheck.app/cost-basis.json", "cost_basis_url");
  requireEqual(errors, payload.npo_pipeline_handoff_url, "https://api.uploadcheck.app/npo-pipeline-handoff.json", "npo_pipeline_handoff_url");
  requireIncludes(errors, payload.packages, "@uploadcheck/cli", "packages");
  requireIncludes(errors, payload.packages, "@uploadcheck/mcp", "packages");
  for (const tool of [
    "qc_get_launch_evidence",
    "qc_get_pipeline_handoff",
    "qc_get_npo_pipeline_handoff",
    "qc_get_pipeline_recipes",
    "qc_get_cost_basis",
    "qc_estimate_cost",
    "qc_run_local_file",
    "qc_get_margin_telemetry"
  ]) {
    requireIncludes(errors, payload.tools, tool, "tools");
  }
  for (const endpoint of [
    "GET /v1/launch-evidence",
    "GET /pipeline-handoff.json",
    "GET /pipeline-recipes.json",
    "GET /npo-pipeline-handoff.json",
    "GET /cost-basis.json",
    "POST /v1/qc/jobs/drain",
    "GET /v1/usage/margins"
  ]) {
    requireIncludes(errors, payload.primary_endpoints, endpoint, "primary_endpoints");
  }
  if (payload.pricing_guardrail_note?.stress_99_5000_remaining_cogs_after_deterministic_cents_per_minute !== 0.0157) {
    errors.push({
      key: "pricing_guardrail_note.stress_99_5000_remaining_cogs_after_deterministic_cents_per_minute",
      reason: "missing_margin_guardrail",
      detail: "Agent manifest must expose the $99 / 5,000 post-deterministic COGS ceiling."
    });
  }
  if (!String(payload.pricing_guardrail_note?.stress_99_5000_verdict || "").includes("too generous")) {
    errors.push({
      key: "pricing_guardrail_note.stress_99_5000_verdict",
      reason: "missing_stress_verdict",
      detail: "Agent manifest must warn that $99 / 5,000 is too generous for full-model review."
    });
  }
  if (!Array.isArray(payload.pipeline_profiles) || !payload.pipeline_profiles.some((profile) => profile.id === "npo_podcast_or_audio")) {
    errors.push({
      key: "pipeline_profiles",
      reason: "missing_npo_profile",
      detail: "Agent manifest must expose the NPO podcast/audio production profile."
    });
  }
  if (payload.repair_loop_contract?.must_show_all_flags !== true || payload.repair_loop_contract?.rerun_after_fix !== true) {
    errors.push({
      key: "repair_loop_contract",
      reason: "missing_repair_loop_rule",
      detail: "Agent manifest must require all flags, fix prompt, and rerun-after-fix behavior."
    });
  }
  return errors;
}

function requireEqual(errors, actual, expected, key) {
  if (actual !== expected) {
    errors.push({ key, reason: "mismatch", detail: `Expected ${JSON.stringify(expected)}; found ${JSON.stringify(actual)}.` });
  }
}

function requireIncludes(errors, values, expected, key) {
  if (!Array.isArray(values) || !values.includes(expected)) {
    errors.push({ key, reason: "missing_value", detail: `Expected ${key} to include ${JSON.stringify(expected)}.` });
  }
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function trimTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

if (process.argv[1] && resolve(process.argv[1]) === THIS_FILE) {
  await main();
}
