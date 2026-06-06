#!/usr/bin/env node

const DEFAULT_BASE_URL = "https://api.uploadcheck.app";

export function validateNpoPipelineHandoff(payload = {}) {
  const errors = [];
  requireEqual(errors, payload.name, "UploadCheck NPO Pipeline Handoff", "name");
  requireEqual(errors, payload.profile_id, "npo_podcast_or_audio", "profile_id");
  requireEqual(errors, payload.mcp_server, "uploadcheck", "mcp_server");
  requireEqual(errors, payload.api_base_url, "https://api.uploadcheck.app/v1", "api_base_url");
  requireIncludes(errors, payload.source_recipe, "pipeline-recipes.json#profiles.npo_podcast_or_audio", "source_recipe");
  requireEqual(errors, payload.launch_preflight?.mcp_tool, "qc_get_launch_status", "launch_preflight.mcp_tool");
  requireEqual(errors, payload.launch_preflight?.handoff_tool, "qc_get_launch_handoff", "launch_preflight.handoff_tool");
  requireEqual(errors, payload.cost_preflight?.mcp_tool, "qc_estimate_cost", "cost_preflight.mcp_tool");
  requireEqual(errors, payload.cost_preflight?.cost_guardrail, "downgrade", "cost_preflight.cost_guardrail");

  const checks = String(payload.cost_preflight?.checks || "");
  for (const check of ["dead_air", "spoken_leaks", "pronunciation_watchlist", "script_faithfulness", "chunk_sidecar_failures"]) {
    requireIncludes(errors, checks, check, "cost_preflight.checks");
  }

  for (const key of ["transcript_path", "watchlist_path", "expected_script_path", "sidecar_dir"]) {
    if (!payload.required_sidecars?.[key]) {
      errors.push(error(`required_sidecars.${key}`, "missing_sidecar", `Missing NPO sidecar ${key}.`));
    }
  }

  const sequenceTools = (payload.mcp_sequence || []).map((step) => step.tool);
  for (const tool of ["qc_get_pipeline_handoff", "qc_get_pipeline_recipes", "qc_estimate_cost", "qc_run_local_file", "qc_get_job", "qc_get_report", "qc_get_marker_csv"]) {
    if (!sequenceTools.includes(tool)) {
      errors.push(error("mcp_sequence", "missing_tool", `Missing MCP sequence tool ${tool}.`));
    }
  }

  const runLocal = (payload.mcp_sequence || []).find((step) => step.tool === "qc_run_local_file");
  requireEqual(errors, runLocal?.arguments?.file_path, "/path/to/episode.wav", "mcp_sequence.qc_run_local_file.file_path");
  for (const key of ["transcript_path", "watchlist_path", "expected_script_path", "sidecar_dir", "idempotency_key"]) {
    if (!runLocal?.arguments?.[key]) {
      errors.push(error(`mcp_sequence.qc_run_local_file.${key}`, "missing_argument", `Missing qc_run_local_file argument ${key}.`));
    }
  }
  requireEqual(errors, runLocal?.arguments?.cost_guardrail, "downgrade", "mcp_sequence.qc_run_local_file.cost_guardrail");

  const ingress = JSON.stringify(payload.media_ingress || {});
  for (const value of ["inline", "signed upload", "process_async=true", "transcript_url", "sidecarIngress", "temporary server paths"]) {
    requireIncludes(errors, ingress, value, "media_ingress");
  }

  const repair = payload.repair_loop_contract || {};
  if (repair.must_show_all_flags !== true || repair.rerun_after_fix !== true || !String(repair.user_prompt || "").includes("Fix now")) {
    errors.push(error("repair_loop_contract", "missing_repair_loop", "NPO handoff must require all flags, Fix now, and rerun after fix."));
  }
  requireIncludes(errors, JSON.stringify(repair.source_or_render_required || []), "garbled audio", "repair_loop_contract.source_or_render_required");
  requireIncludes(errors, payload.margin_rule, "model-backed garble or omni_watch", "margin_rule");
  requireIncludes(errors, payload.public_moat_rule, "do not publish private thresholds", "public_moat_rule");
  return errors;
}

async function main() {
  const baseUrl = trimTrailingSlash(process.env.UPLOADCHECK_LIVE_NPO_PIPELINE_HANDOFF_BASE_URL || DEFAULT_BASE_URL);
  const url = `${baseUrl}/npo-pipeline-handoff.json`;
  try {
    const response = await fetch(url);
    const contentType = response.headers.get("content-type") || "";
    const text = await response.text();
    if (!response.ok) fail(`UploadCheck live NPO pipeline handoff: NOT READY\n${url} returned HTTP ${response.status}`);
    if (!contentType.includes("application/json")) fail(`UploadCheck live NPO pipeline handoff: NOT READY\n${url} returned ${contentType || "unknown content type"} instead of application/json`);
    let payload;
    try {
      payload = JSON.parse(text);
    } catch (err) {
      fail(`UploadCheck live NPO pipeline handoff: NOT READY\n${url} returned invalid JSON: ${err.message}`);
    }
    const errors = validateNpoPipelineHandoff(payload);
    if (errors.length) {
      fail(`UploadCheck live NPO pipeline handoff: NOT READY\n${JSON.stringify({ url, errors }, null, 2)}`);
    }
    console.log(JSON.stringify({
      ok: true,
      url,
      name: payload.name,
      profileId: payload.profile_id,
      sequenceLength: payload.mcp_sequence.length,
      checks: payload.cost_preflight.checks
    }, null, 2));
  } catch (err) {
    fail(`UploadCheck live NPO pipeline handoff: NOT READY\n${err.message}`);
  }
}

function requireEqual(errors, actual, expected, key) {
  if (actual !== expected) errors.push(error(key, "mismatch", `Expected ${JSON.stringify(expected)}; found ${JSON.stringify(actual)}.`));
}

function requireIncludes(errors, actual, expected, key) {
  if (!String(actual || "").includes(expected)) errors.push(error(key, "missing_value", `Expected ${key} to include ${expected}.`));
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

if (process.argv[1] && import.meta.url === new URL(process.argv[1], "file://").href) {
  await main();
}
