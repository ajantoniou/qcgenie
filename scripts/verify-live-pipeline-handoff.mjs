#!/usr/bin/env node
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const THIS_FILE = fileURLToPath(import.meta.url);

async function main() {
  const baseUrl = trimTrailingSlash(process.env.UPLOADCHECK_LIVE_PIPELINE_HANDOFF_BASE_URL || "https://api.uploadcheck.app");
  const url = `${baseUrl}/pipeline-handoff.json`;

  try {
    const response = await fetch(url);
    const contentType = response.headers.get("content-type") || "";
    const text = await response.text();
    if (!response.ok) {
      fail(`UploadCheck live pipeline handoff: NOT READY\n${url} returned HTTP ${response.status}`);
    }
    if (!contentType.includes("application/json")) {
      fail(`UploadCheck live pipeline handoff: NOT READY\n${url} returned ${contentType || "unknown content type"} instead of application/json`);
    }

    let payload;
    try {
      payload = JSON.parse(text);
    } catch (error) {
      fail(`UploadCheck live pipeline handoff: NOT READY\n${url} returned invalid JSON: ${error.message}`);
    }

    const errors = validatePipelineHandoff(payload);
    if (errors.length) {
      fail(`UploadCheck live pipeline handoff: NOT READY\n${JSON.stringify({ url, errors }, null, 2)}`);
    }

    console.log(JSON.stringify({
      ok: true,
      url,
      name: payload.name,
      mcpServer: payload.mcp_server,
      mcpTool: payload.mcp_tool,
      profileCount: payload.profiles.length,
      callSequenceSteps: payload.call_sequence.length,
      stressRemainingCogsCentsPerMinute: payload.margin_rules.stress_99_5000_remaining_cogs_after_deterministic_cents_per_minute
    }, null, 2));
  } catch (error) {
    fail(`UploadCheck live pipeline handoff: NOT READY\n${error.message}`);
  }
}

export function validatePipelineHandoff(payload = {}) {
  const errors = [];
  requireEqual(errors, payload.name, "UploadCheck Production Pipeline Handoff", "name");
  requireEqual(errors, payload.mcp_server, "uploadcheck", "mcp_server");
  requireEqual(errors, payload.mcp_tool, "qc_get_pipeline_handoff", "mcp_tool");
  requireEqual(errors, payload.cli_command, "uploadcheck pipeline-handoff --json", "cli_command");
  requireEqual(errors, payload.api_base_url, "https://api.uploadcheck.app/v1", "api_base_url");

  for (const profile of ["nto_long_form", "nto_shorts", "npo_podcast_or_audio", "generic_creator_video", "creator_thumbnail"]) {
    requireIncludes(errors, payload.profiles, profile, "profiles");
  }

  const sequenceText = JSON.stringify(payload.call_sequence || []);
  for (const marker of [
    "qc_get_launch_status",
    "qc_get_launch_handoff",
    "qc_get_pipeline_recipes",
    "qc_get_cost_basis",
    "qc_estimate_cost",
    "qc_run_local_file",
    "qc_run_video",
    "qc_create_upload_url",
    "qc_get_job",
    "qc_get_report",
    "qc_get_marker_csv",
    "Show all QC flags and ask: Fix now?",
    "no BLOCK flags remain"
  ]) {
    if (!sequenceText.includes(marker)) {
      errors.push({ key: "call_sequence", reason: "missing_step_marker", detail: `Expected call sequence to include ${marker}.` });
    }
  }

  requireIncludes(errors, payload.media_ingress?.inline_ephemeral?.proof_fields, "sha256", "media_ingress.inline_ephemeral.proof_fields");
  requireIncludes(errors, payload.media_ingress?.signed_upload?.api_sequence, "POST /v1/uploads", "media_ingress.signed_upload.api_sequence");
  requireIncludes(errors, payload.media_ingress?.remote_sidecar_urls?.fields, "chunk_sidecars_url", "media_ingress.remote_sidecar_urls.fields");
  if (!String(payload.media_ingress?.remote_sidecar_urls?.rule || "").includes("process_async=true")) {
    errors.push({
      key: "media_ingress.remote_sidecar_urls.rule",
      reason: "missing_async_sidecar_rule",
      detail: "Pipeline handoff must explain HTTPS sidecar URLs for queued Render worker jobs."
    });
  }

  if (payload.margin_rules?.target_gross_margin_pct !== 95 || payload.margin_rules?.stress_99_5000_remaining_cogs_after_deterministic_cents_per_minute !== 0.0157) {
    errors.push({
      key: "margin_rules",
      reason: "missing_margin_guardrail",
      detail: "Pipeline handoff must preserve the 95% gross-margin target and $99 / 5,000 stress-plan COGS ceiling."
    });
  }
  if (!String(payload.margin_rules?.stress_99_5000_verdict || "").includes("too generous")) {
    errors.push({
      key: "margin_rules.stress_99_5000_verdict",
      reason: "missing_stress_verdict",
      detail: "Pipeline handoff must warn that $99 / 5,000 is too generous for full-model review."
    });
  }

  const repair = payload.repair_loop_contract || {};
  if (repair.must_show_all_flags !== true || repair.rerun_after_fix !== true || !String(repair.user_prompt || "").includes("Fix now")) {
    errors.push({
      key: "repair_loop_contract",
      reason: "missing_repair_loop_rule",
      detail: "Pipeline handoff must require all flags, the Fix now prompt, and rerun-after-fix."
    });
  }
  if (!String(payload.private_moat_rule || "").includes("exact thresholds")) {
    errors.push({
      key: "private_moat_rule",
      reason: "missing_private_moat_rule",
      detail: "Pipeline handoff must state that exact thresholds/prompts/fixtures stay private."
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
