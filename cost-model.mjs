const TARGET_MARGIN = 0.95;
const DEFAULT_PLAN_PRICE_CENTS = 9900;
const DEFAULT_INCLUDED_MINUTES = 5000;
const DEFAULT_AI_REVIEW_COST_PER_MINUTE_CENTS = 0.2154;
const DEFAULT_DETERMINISTIC_COST_PER_MINUTE_CENTS = 0.0833;
const DEFAULT_MODEL_CHECK_CALL_COST_CENTS = 0.05;
const MODEL_BACKED_CHECKS = new Set(["twins", "cheap_broll", "narration_match", "omni_watch", "garble"]);
const DEFAULT_CHECKS = [
  "canvas_fill",
  "loop_freeze",
  "repeat_fatigue",
  "spoken_leaks",
  "pronunciation_watchlist",
  "script_faithfulness",
  "dead_air",
  "cheap_broll",
  "text_contrast",
  "text_safe_area",
  "garble",
  "twins",
  "narration_match",
  "omni_watch"
];
const MODEL_CHECK_CALLS_PER_MINUTE = {
  twins: 12,
  cheap_broll: 12,
  narration_match: 4,
  omni_watch: 2,
  garble: 2
};
const PLAN_PRESETS = {
  creator: { planPriceCents: 9900, includedMinutes: 1200 },
  studio: { planPriceCents: 29900, includedMinutes: 5000 },
  network: { planPriceCents: 79900, includedMinutes: 18000 },
  stress_99_5000: { planPriceCents: 9900, includedMinutes: 5000 }
};

export function estimateJobCost(input = {}) {
  const minutes = Math.max(0, Number(input.minutesMetered || input.minutes || 0));
  const aiReviewSeconds = Math.max(0, Number(input.aiReviewSeconds || 0));
  const checkCost = estimateModelCheckCost(input.checks, minutes || 1);
  const plan = resolvePlanEconomics(input);
  const planPriceCents = plan.planPriceCents;
  const includedMinutes = plan.includedMinutes;
  const cogsBudgetCents = planPriceCents * (1 - TARGET_MARGIN);
  const maxCostPerMinuteCents = cogsBudgetCents / includedMinutes;

  const deterministicComputeCents = minutes * DEFAULT_DETERMINISTIC_COST_PER_MINUTE_CENTS; // Render starter task at about $0.05/hour, 1x realtime.
  const flashLiteVideoAudioInputCents = minutes * 0.2154;
  const flashVideoAudioInputCents = minutes * 0.6654;
  const sampledAiCents = (aiReviewSeconds / 60) * DEFAULT_AI_REVIEW_COST_PER_MINUTE_CENTS;
  const estimatedCogsCents = deterministicComputeCents + sampledAiCents + checkCost.modelCheckCents;
  const allowedCogsForJobCents = minutes * maxCostPerMinuteCents;
  const remainingAiBudgetCents = Math.max(0, allowedCogsForJobCents - deterministicComputeCents);
  const maxAiReviewSecondsAtMargin = DEFAULT_AI_REVIEW_COST_PER_MINUTE_CENTS > 0
    ? Math.floor((remainingAiBudgetCents / DEFAULT_AI_REVIEW_COST_PER_MINUTE_CENTS) * 60)
    : 0;

  return {
    targetGrossMarginPct: TARGET_MARGIN * 100,
    planId: plan.planId,
    planPriceCents,
    includedMinutes,
    maxCogsCents: round(cogsBudgetCents),
    maxCostPerMinuteCents: round(maxCostPerMinuteCents),
    minutesMetered: minutes,
    aiReviewSeconds,
    deterministicComputeCents: round(deterministicComputeCents),
    sampledAiCents: round(sampledAiCents),
    modelCheckCents: round(checkCost.modelCheckCents),
    modelBackedChecks: checkCost.modelBackedChecks,
    deterministicChecks: checkCost.deterministicChecks,
    estimatedCogsCents: round(estimatedCogsCents),
    estimatedCostPerMinuteCents: round(minutes ? estimatedCogsCents / minutes : 0),
    allowedCogsForJobCents: round(allowedCogsForJobCents),
    maxAiReviewSecondsAtMargin,
    marginSafe: estimatedCogsCents <= allowedCogsForJobCents,
    fullGeminiFlashLiteVideoAudioInputCents: round(flashLiteVideoAudioInputCents),
    fullGeminiFlashVideoAudioInputCents: round(flashVideoAudioInputCents),
    warning: flashLiteVideoAudioInputCents > minutes * maxCostPerMinuteCents
      ? `Full-video Gemini review exceeds the 95% margin budget for ${plan.planId || "this plan"}.`
      : null
  };
}

export function resolvePlanEconomics(input = {}) {
  const planId = String(input.planId || input.plan_id || "").toLowerCase();
  const preset = PLAN_PRESETS[planId] || {};
  return {
    planId: planId || null,
    planPriceCents: Number(input.planPriceCents || input.plan_price_cents || preset.planPriceCents || DEFAULT_PLAN_PRICE_CENTS),
    includedMinutes: Number(input.includedMinutes || input.included_minutes || preset.includedMinutes || DEFAULT_INCLUDED_MINUTES)
  };
}

export function applyCostGuardrail(input = {}) {
  const guardrail = normalizeGuardrail(input.costGuardrail || input.cost_guardrail || "downgrade");
  const requestedAiReviewSeconds = Math.max(0, Number(input.aiReviewSeconds || input.ai_review_seconds || 0));
  const minutes = Math.max(1, Number(input.minutesMetered || input.minutes || 1));
  const requestedChecks = normalizeChecks(input.checks, { useDefault: true });
  const estimate = estimateJobCost({ ...input, checks: requestedChecks, minutesMetered: minutes, aiReviewSeconds: requestedAiReviewSeconds });
  if (guardrail === "off" || estimate.marginSafe) {
    return {
      ok: true,
      action: "none",
      aiReviewSeconds: requestedAiReviewSeconds,
      requestedAiReviewSeconds,
      checks: requestedChecks.join(","),
      requestedChecks: requestedChecks.join(","),
      removedChecks: "",
      costGuardrail: guardrail,
      estimate
    };
  }
  if (guardrail === "block") {
    return {
      ok: false,
      action: "blocked",
      aiReviewSeconds: 0,
      requestedAiReviewSeconds,
      checks: requestedChecks.join(","),
      requestedChecks: requestedChecks.join(","),
      removedChecks: "",
      costGuardrail: guardrail,
      estimate,
      reason: guardrailReason(requestedAiReviewSeconds, estimate)
    };
  }
  const deterministicChecks = requestedChecks.filter((check) => !MODEL_BACKED_CHECKS.has(check));
  const downgradedEstimate = estimateJobCost({ ...input, checks: deterministicChecks, minutesMetered: minutes, aiReviewSeconds: 0 });
  return {
    ok: true,
    action: "downgraded_to_deterministic",
    aiReviewSeconds: 0,
    requestedAiReviewSeconds,
    checks: deterministicChecks.join(","),
    requestedChecks: requestedChecks.join(","),
    removedChecks: requestedChecks.filter((check) => MODEL_BACKED_CHECKS.has(check)).join(","),
    costGuardrail: guardrail,
    estimate: downgradedEstimate,
    originalEstimate: estimate,
    reason: `${guardrailReason(requestedAiReviewSeconds, estimate)} The job was downgraded to deterministic checks.`
  };
}

export function normalizeChecks(checks, opts = {}) {
  if (Array.isArray(checks)) return checks.map(String).map((check) => check.trim()).filter(Boolean);
  if (typeof checks === "string" && checks.trim()) return checks.split(",").map((check) => check.trim()).filter(Boolean);
  return opts.useDefault ? [...DEFAULT_CHECKS] : [];
}

export function estimateModelCheckCost(checks, minutes = 1) {
  const normalized = normalizeChecks(checks);
  const modelBackedChecks = normalized.filter((check) => MODEL_BACKED_CHECKS.has(check));
  const deterministicChecks = normalized.filter((check) => !MODEL_BACKED_CHECKS.has(check));
  const modelCalls = modelBackedChecks.reduce((sum, check) => {
    return sum + Math.max(1, Math.ceil(minutes * (MODEL_CHECK_CALLS_PER_MINUTE[check] || 1)));
  }, 0);
  return {
    modelBackedChecks,
    deterministicChecks,
    modelCalls,
    modelCheckCents: modelCalls * DEFAULT_MODEL_CHECK_CALL_COST_CENTS
  };
}

function guardrailReason(requestedAiReviewSeconds, estimate) {
  const parts = [];
  if (requestedAiReviewSeconds > 0) parts.push(`requested AI review (${requestedAiReviewSeconds}s)`);
  if (estimate.modelBackedChecks?.length) parts.push(`model-backed checks (${estimate.modelBackedChecks.join(",")})`);
  return `${parts.length ? parts.join(" and ") : "requested work"} exceed the 95% gross-margin budget.`;
}

function normalizeGuardrail(value) {
  const normalized = String(value || "").toLowerCase();
  if (["off", "none", "disabled"].includes(normalized)) return "off";
  if (["block", "enforce", "strict"].includes(normalized)) return "block";
  return "downgrade";
}

function round(value) {
  return Math.round(value * 10000) / 10000;
}
