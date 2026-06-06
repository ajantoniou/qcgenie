#!/usr/bin/env node
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const THIS_FILE = fileURLToPath(import.meta.url);

async function main() {
  const baseUrl = trimTrailingSlash(process.env.UPLOADCHECK_LIVE_PIPELINE_RECIPES_BASE_URL || "https://api.uploadcheck.app");
  const url = `${baseUrl}/pipeline-recipes.json`;

  try {
    const response = await fetch(url);
    const contentType = response.headers.get("content-type") || "";
    const text = await response.text();
    if (!response.ok) {
      fail(`UploadCheck live pipeline recipes: NOT READY\n${url} returned HTTP ${response.status}`);
    }
    if (!contentType.includes("application/json")) {
      fail(`UploadCheck live pipeline recipes: NOT READY\n${url} returned ${contentType || "unknown content type"} instead of application/json`);
    }

    let payload;
    try {
      payload = JSON.parse(text);
    } catch (error) {
      fail(`UploadCheck live pipeline recipes: NOT READY\n${url} returned invalid JSON: ${error.message}`);
    }

    const errors = validatePipelineRecipes(payload);
    if (errors.length) {
      fail(`UploadCheck live pipeline recipes: NOT READY\n${JSON.stringify({ url, errors }, null, 2)}`);
    }

    console.log(JSON.stringify({
      ok: true,
      url,
      name: payload.name,
      mcpServer: payload.mcp_server,
      profileIds: Object.keys(payload.profiles || {}),
      implementedGateCount: payload.nto_replacement_qc.implemented_gates.length,
      plannedGateCount: payload.nto_replacement_qc.planned_product_gates.length,
      costGuardrail: payload.cost_preflight.default_cost_guardrail
    }, null, 2));
  } catch (error) {
    fail(`UploadCheck live pipeline recipes: NOT READY\n${error.message}`);
  }
}

export function validatePipelineRecipes(payload = {}) {
  const errors = [];
  requireEqual(errors, payload.name, "UploadCheck Pipeline Recipes", "name");
  requireEqual(errors, payload.mcp_server, "uploadcheck", "mcp_server");
  requireEqual(errors, payload.api_base_url, "https://api.uploadcheck.app/v1", "api_base_url");
  requireEqual(errors, payload.launch_preflight?.tool, "qc_get_launch_status", "launch_preflight.tool");
  requireEqual(errors, payload.launch_preflight?.handoff_tool, "qc_get_launch_handoff", "launch_preflight.handoff_tool");
  requireEqual(errors, payload.cost_preflight?.tool, "qc_estimate_cost", "cost_preflight.tool");
  requireEqual(errors, payload.cost_preflight?.default_cost_guardrail, "downgrade", "cost_preflight.default_cost_guardrail");

  for (const profile of ["nto_long_form", "nto_shorts", "npo_podcast_or_audio", "generic_creator_video", "creator_thumbnail"]) {
    if (!payload.profiles?.[profile]) {
      errors.push({ key: "profiles", reason: "missing_profile", detail: `Expected profile ${profile}.` });
    }
  }

  const repair = payload.repair_loop_contract || {};
  if (repair.must_show_all_flags !== true || repair.rerun_after_fix !== true || !String(repair.user_prompt || "").includes("Fix now")) {
    errors.push({
      key: "repair_loop_contract",
      reason: "missing_repair_loop_rule",
      detail: "Recipes must require all flags, the Fix now prompt, and rerun-after-fix."
    });
  }

  const implemented = new Map((payload.nto_replacement_qc?.implemented_gates || []).map((gate) => [gate.id, gate]));
  for (const gate of [
    "text_contrast",
    "thumbnail_text_readability",
    "clean_segment_source_scrub",
    "hallucinated_plate_text",
    "asset_triage_reuse_manifest",
    "twins",
    "sentence_boundary",
    "speaker_visual_binding",
    "literal_subject_match",
    "rehook_cadence"
  ]) {
    if (!implemented.has(gate)) {
      errors.push({ key: "nto_replacement_qc.implemented_gates", reason: "missing_gate", detail: `Expected implemented gate ${gate}.` });
    }
  }
  if (!String(implemented.get("text_contrast")?.covers || "").includes("Poorly contrasting overlay text")) {
    errors.push({
      key: "nto_replacement_qc.implemented_gates.text_contrast",
      reason: "missing_text_contrast_contract",
      detail: "Recipes must publish the low-contrast overlay text QC task."
    });
  }
  if (!String(implemented.get("twins")?.covers || "").includes("more distinct characters")) {
    errors.push({
      key: "nto_replacement_qc.implemented_gates.twins",
      reason: "missing_clone_crowd_contract",
      detail: "Recipes must publish the clone-crowd/more-distinct-characters QC task."
    });
  }

  const longFormChecks = String(payload.profiles?.nto_long_form?.mcp_call?.arguments?.checks || "");
  for (const check of ["text_contrast", "hallucinated_plate_text", "chunk_sidecar_failures", "script_faithfulness"]) {
    if (!longFormChecks.includes(check)) {
      errors.push({ key: "profiles.nto_long_form.mcp_call.arguments.checks", reason: "missing_check", detail: `Expected ${check} in nto_long_form checks.` });
    }
  }
  const longFormBacktest = JSON.stringify(payload.profiles?.nto_long_form?.internal_capture_rate_backtest || {});
  const shortsBacktest = JSON.stringify(payload.profiles?.nto_shorts?.internal_capture_rate_backtest || {});
  for (const [key, value] of [["profiles.nto_long_form.internal_capture_rate_backtest", longFormBacktest], ["profiles.nto_shorts.internal_capture_rate_backtest", shortsBacktest]]) {
    if (!value.includes("gemini_watch.py") || !value.includes("90")) {
      errors.push({ key, reason: "missing_gemini_capture_rate_backtest", detail: "NTO profiles must publish the Gemini capture-rate backtest contract." });
    }
  }
  if (!String(payload.nto_replacement_qc?.internal_capture_rate_metric?.oracle || "").includes("gemini_watch.py")) {
    errors.push({ key: "nto_replacement_qc.internal_capture_rate_metric", reason: "missing_capture_rate_metric", detail: "Recipes must identify Gemini as the internal capture-rate oracle." });
  }
  const audioChecks = String(payload.profiles?.npo_podcast_or_audio?.mcp_call?.arguments?.checks || "");
  for (const check of ["spoken_leaks", "pronunciation_watchlist", "script_faithfulness", "chunk_sidecar_failures"]) {
    if (!audioChecks.includes(check)) {
      errors.push({ key: "profiles.npo_podcast_or_audio.mcp_call.arguments.checks", reason: "missing_check", detail: `Expected ${check} in npo_podcast_or_audio checks.` });
    }
  }
  return errors;
}

function requireEqual(errors, actual, expected, key) {
  if (actual !== expected) {
    errors.push({ key, reason: "mismatch", detail: `Expected ${JSON.stringify(expected)}; found ${JSON.stringify(actual)}.` });
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
