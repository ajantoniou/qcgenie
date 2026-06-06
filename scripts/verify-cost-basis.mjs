#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { estimateJobCost, estimateModelCheckCost } from "../cost-model.mjs";

const PLAN_IDS = ["creator", "studio", "network", "stress_99_5000"];
const COST_BASIS_PATH = "public/cost-basis.json";

export function verifyCostBasis({ basis: suppliedBasis = null, costBasisPath = COST_BASIS_PATH } = {}) {
  const errors = [];
  const basis = suppliedBasis || readJson(costBasisPath, errors);
  if (!basis) return { ok: false, errors };

  if (basis.target_gross_margin_pct !== 95) {
    errors.push({ key: "target_gross_margin_pct", reason: "wrong_target", detail: "Expected 95% gross-margin target." });
  }
  if (!String(basis.verdict?.stress_99_5000 || "").includes("too generous")) {
    errors.push({ key: "verdict.stress_99_5000", reason: "missing_verdict", detail: "Stress-plan verdict must answer that $99 / 5,000 is too generous for full AI review." });
  }
  if (basis.default_guardrail?.mode !== "downgrade") {
    errors.push({ key: "default_guardrail.mode", reason: "wrong_guardrail", detail: "Default cost guardrail should be downgrade." });
  }
  const oneTwinCall = estimateModelCheckCost("twins", 1);
  const modelCheckCallCost = oneTwinCall.modelCheckCents / oneTwinCall.modelCalls;
  if (basis.cost_assumptions?.model_check_call_cost_cents !== modelCheckCallCost) {
    errors.push({ key: "cost_assumptions.model_check_call_cost_cents", reason: "model_call_floor_mismatch", detail: `Expected observed-calibrated floor ${modelCheckCallCost}; found ${basis.cost_assumptions?.model_check_call_cost_cents}.` });
  }
  if (basis.cost_assumptions?.openai_gpt_4o_mini_transcribe_cents_per_minute !== 0.3) {
    errors.push({ key: "cost_assumptions.openai_gpt_4o_mini_transcribe_cents_per_minute", reason: "missing_openai_transcription_baseline", detail: "Expected OpenAI gpt-4o-mini-transcribe at 0.3 cents/minute." });
  }
  if (!Array.isArray(basis.source_audit?.primary_sources) || !basis.source_audit.primary_sources.some((source) => source.provider === "OpenAI")) {
    errors.push({ key: "source_audit.primary_sources", reason: "missing_primary_source", detail: "Cost basis must cite current primary pricing sources, including OpenAI." });
  }
  if (!Array.isArray(basis.transcription_cost_reduction?.options) || !basis.transcription_cost_reduction.options.some((option) => option.model === "gpt-4o-mini-transcribe" && option.stress_99_5000_margin_safe === false)) {
    errors.push({ key: "transcription_cost_reduction.options", reason: "missing_transcription_guardrail", detail: "Cost basis must show cheaper transcription still breaks the $99 / 5,000 stress plan when run on every minute." });
  }
  if (!String(basis.observed_calibration?.source || "").includes("0.654")) {
    errors.push({ key: "observed_calibration.source", reason: "missing_observed_source", detail: "Observed calibration must cite the clone-crowd Sonnet frame-call cost." });
  }
  if (!Array.isArray(basis.telemetry?.mcp_tools) || !basis.telemetry.mcp_tools.includes("qc_get_cost_basis")) {
    errors.push({ key: "telemetry.mcp_tools", reason: "missing_cost_basis_tool", detail: "Cost basis must expose MCP qc_get_cost_basis." });
  }
  if (!Array.isArray(basis.telemetry?.cli_commands) || !basis.telemetry.cli_commands.includes("uploadcheck cost-basis --json")) {
    errors.push({ key: "telemetry.cli_commands", reason: "missing_cost_basis_cli", detail: "Cost basis must expose CLI uploadcheck cost-basis --json." });
  }

  const plans = Array.isArray(basis.plans) ? basis.plans : [];
  if (JSON.stringify(plans.map((plan) => plan.plan_id)) !== JSON.stringify(PLAN_IDS)) {
    errors.push({ key: "plans", reason: "wrong_plan_ids", detail: `Expected plans ${PLAN_IDS.join(", ")}.` });
  }

  for (const planId of PLAN_IDS) {
    const plan = plans.find((candidate) => candidate.plan_id === planId);
    if (!plan) continue;
    const estimate = estimateJobCost({
      planId,
      minutesMetered: plan.included_minutes,
      checks: "canvas_fill"
    });
    compare(errors, plan, "price_cents", estimate.planPriceCents);
    compare(errors, plan, "included_minutes", estimate.includedMinutes);
    compare(errors, plan, "ai_review_budget_seconds", estimate.aiReviewBudgetSeconds);
    compare(errors, plan, "max_ai_review_seconds_at_95_margin_after_deterministic_full_allowance", estimate.maxAiReviewSecondsAtMargin);
    compare(errors, plan, "revenue_per_minute_cents", estimate.revenuePerMinuteCents);
    compare(errors, plan, "max_cogs_cents_at_95_margin", estimate.maxCogsCents);
    compare(errors, plan, "max_cost_per_minute_cents_at_95_margin", estimate.maxCostPerMinuteCents);
    compare(errors, plan, "deterministic_full_allowance_cogs_cents", estimate.deterministicComputeCents);
    compare(errors, plan, "remaining_cogs_after_deterministic_full_allowance_cents", round(estimate.maxCogsCents - estimate.deterministicComputeCents));
    compare(errors, plan, "remaining_cost_per_minute_after_deterministic_full_allowance_cents", round(estimate.maxCostPerMinuteCents - (estimate.deterministicComputeCents / estimate.includedMinutes)));
    compare(errors, plan, "deterministic_full_allowance_gross_margin_pct", estimate.estimatedGrossMarginPct);
    compare(errors, plan, "full_gemini_flash_lite_video_audio_input_cogs_cents", estimate.fullGeminiFlashLiteVideoAudioInputCents);
    compare(errors, plan, "full_gemini_flash_video_audio_input_cogs_cents", estimate.fullGeminiFlashVideoAudioInputCents);
    compare(errors, plan, "deterministic_margin_safe", true);
    compare(errors, plan, "full_flash_input_margin_safe", false);
  }

  const stress = plans.find((plan) => plan.plan_id === "stress_99_5000");
  if (stress?.full_flash_lite_input_margin_safe !== false) {
    errors.push({ key: "stress_99_5000.full_flash_lite_input_margin_safe", reason: "wrong_margin_flag", detail: "$99 / 5,000 must reject full Flash Lite video/audio input at 95% margin." });
  }

  return {
    ok: errors.length === 0,
    costBasisPath,
    targetGrossMarginPct: basis.target_gross_margin_pct,
    defaultGuardrail: basis.default_guardrail?.mode || null,
    planSummary: plans.map((plan) => ({
      planId: plan.plan_id,
      priceCents: plan.price_cents,
      includedMinutes: plan.included_minutes,
      aiReviewBudgetSeconds: plan.ai_review_budget_seconds,
      maxAiReviewSecondsAtMargin: plan.max_ai_review_seconds_at_95_margin_after_deterministic_full_allowance,
      revenuePerMinuteCents: plan.revenue_per_minute_cents,
      maxCostPerMinuteCentsAt95Margin: plan.max_cost_per_minute_cents_at_95_margin,
      remainingCostPerMinuteAfterDeterministicCents: plan.remaining_cost_per_minute_after_deterministic_full_allowance_cents,
      deterministicMarginSafe: plan.deterministic_margin_safe,
      fullFlashLiteInputMarginSafe: plan.full_flash_lite_input_margin_safe,
      fullFlashInputMarginSafe: plan.full_flash_input_margin_safe
    })),
    stressVerdict: basis.verdict?.stress_99_5000 || "",
    errors
  };
}

function round(value) {
  return Math.round((Number(value) + Number.EPSILON) * 10000) / 10000;
}

function readJson(path, errors) {
  try {
    return JSON.parse(readFileSync(resolve(path), "utf8"));
  } catch (error) {
    errors.push({ key: "cost_basis", reason: "read_failed", detail: error.message });
    return null;
  }
}

function compare(errors, actual, key, expected) {
  if (actual[key] !== expected) {
    errors.push({
      key: `${actual.plan_id}.${key}`,
      reason: "mismatch",
      detail: `Expected ${expected}; found ${actual[key]}.`
    });
  }
}

const THIS_FILE = fileURLToPath(import.meta.url);

if (process.argv[1] && resolve(process.argv[1]) === THIS_FILE) {
  const result = verifyCostBasis();
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}
