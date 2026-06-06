const TARGET_MARGIN = 0.95;
const DEFAULT_PLAN_PRICE_CENTS = 9900;
const DEFAULT_INCLUDED_MINUTES = 5000;
const DEFAULT_AI_REVIEW_COST_PER_MINUTE_CENTS = 0.2154;
const DEFAULT_DETERMINISTIC_COST_PER_MINUTE_CENTS = 0.0833;
const PLAN_PRESETS = {
  creator: { planPriceCents: 9900, includedMinutes: 1200 },
  studio: { planPriceCents: 29900, includedMinutes: 5000 },
  network: { planPriceCents: 79900, includedMinutes: 18000 },
  stress_99_5000: { planPriceCents: 9900, includedMinutes: 5000 }
};

export function estimateJobCost(input = {}) {
  const minutes = Math.max(0, Number(input.minutesMetered || input.minutes || 0));
  const aiReviewSeconds = Math.max(0, Number(input.aiReviewSeconds || 0));
  const plan = resolvePlanEconomics(input);
  const planPriceCents = plan.planPriceCents;
  const includedMinutes = plan.includedMinutes;
  const cogsBudgetCents = planPriceCents * (1 - TARGET_MARGIN);
  const maxCostPerMinuteCents = cogsBudgetCents / includedMinutes;

  const deterministicComputeCents = minutes * DEFAULT_DETERMINISTIC_COST_PER_MINUTE_CENTS; // Render starter task at about $0.05/hour, 1x realtime.
  const flashLiteVideoAudioInputCents = minutes * 0.2154;
  const flashVideoAudioInputCents = minutes * 0.6654;
  const sampledAiCents = (aiReviewSeconds / 60) * DEFAULT_AI_REVIEW_COST_PER_MINUTE_CENTS;
  const estimatedCogsCents = deterministicComputeCents + sampledAiCents;
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
  const estimate = estimateJobCost({ ...input, minutesMetered: minutes, aiReviewSeconds: requestedAiReviewSeconds });
  if (guardrail === "off" || estimate.marginSafe) {
    return {
      ok: true,
      action: "none",
      aiReviewSeconds: requestedAiReviewSeconds,
      requestedAiReviewSeconds,
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
      costGuardrail: guardrail,
      estimate,
      reason: `Requested AI review (${requestedAiReviewSeconds}s) exceeds the 95% gross-margin budget.`
    };
  }
  return {
    ok: true,
    action: "downgraded_to_deterministic",
    aiReviewSeconds: 0,
    requestedAiReviewSeconds,
    costGuardrail: guardrail,
    estimate,
    reason: `Requested AI review (${requestedAiReviewSeconds}s) exceeds the 95% gross-margin budget, so this job was downgraded to deterministic checks.`
  };
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
