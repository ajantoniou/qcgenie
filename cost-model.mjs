const TARGET_MARGIN = 0.95;
const DEFAULT_PLAN_PRICE_CENTS = 9900;
const DEFAULT_INCLUDED_MINUTES = 5000;

export function estimateJobCost(input = {}) {
  const minutes = Math.max(0, Number(input.minutesMetered || input.minutes || 0));
  const aiReviewSeconds = Math.max(0, Number(input.aiReviewSeconds || 0));
  const planPriceCents = Number(input.planPriceCents || DEFAULT_PLAN_PRICE_CENTS);
  const includedMinutes = Number(input.includedMinutes || DEFAULT_INCLUDED_MINUTES);
  const cogsBudgetCents = planPriceCents * (1 - TARGET_MARGIN);
  const maxCostPerMinuteCents = cogsBudgetCents / includedMinutes;

  const deterministicComputeCents = minutes * 0.0833; // Render starter task at about $0.05/hour, 1x realtime.
  const flashLiteVideoAudioInputCents = minutes * 0.2154;
  const flashVideoAudioInputCents = minutes * 0.6654;
  const sampledAiCents = (aiReviewSeconds / 60) * 0.2154;
  const estimatedCogsCents = deterministicComputeCents + sampledAiCents;

  return {
    targetGrossMarginPct: TARGET_MARGIN * 100,
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
    marginSafe: estimatedCogsCents <= minutes * maxCostPerMinuteCents,
    fullGeminiFlashLiteVideoAudioInputCents: round(flashLiteVideoAudioInputCents),
    fullGeminiFlashVideoAudioInputCents: round(flashVideoAudioInputCents),
    warning: flashLiteVideoAudioInputCents > minutes * maxCostPerMinuteCents
      ? "Full-video Gemini review exceeds the 95% margin budget at $99 / 5,000 minutes."
      : null
  };
}

function round(value) {
  return Math.round(value * 10000) / 10000;
}
