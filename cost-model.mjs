const TARGET_MARGIN = 0.95;
const DEFAULT_PLAN_PRICE_CENTS = 9900;
const DEFAULT_INCLUDED_MINUTES = 5000;
const DEFAULT_AI_REVIEW_COST_PER_MINUTE_CENTS = 0.2154;
const DEFAULT_DETERMINISTIC_COST_PER_MINUTE_CENTS = 0.0833;
const DEFAULT_MODEL_CHECK_CALL_COST_CENTS = 0.75;
const GEMINI_25_FLASH_LITE_VIDEO_AUDIO_INPUT_CENTS_PER_MINUTE = 0.2154;
const GEMINI_25_FLASH_VIDEO_AUDIO_INPUT_CENTS_PER_MINUTE = 0.3327;
const GEMINI_25_FLASH_BATCH_VIDEO_AUDIO_INPUT_CENTS_PER_MINUTE = 0.1664;
const QWEN_35_OMNI_FLASH_VIDEO_AUDIO_INPUT_CENTS_PER_MINUTE = 1.2072;
const PROVIDER_PRICING = {
  anthropic: {
    defaultInputUsdPerMTok: 3,
    defaultOutputUsdPerMTok: 15,
    cacheWrite5mUsdPerMTok: 3.75,
    cacheReadUsdPerMTok: 0.3,
    models: {
      "claude-sonnet-4-5": { inputUsdPerMTok: 3, outputUsdPerMTok: 15 },
      "claude-sonnet-4-6": { inputUsdPerMTok: 3, outputUsdPerMTok: 15 },
      "claude-haiku-4-5": { inputUsdPerMTok: 1, outputUsdPerMTok: 5 }
    }
  },
  dashscope: {
    "qwen3.5-omni-flash": {
      textImageVideoInputUsdPerMTok: 0.4,
      textOutputUsdPerMTok: 2.2,
      audioInputUsdPerMTok: 3,
      audioOutputUsdPerMTok: 11.9
    }
  },
  openrouter: {
    "qwen3.5-omni-flash": {
      textImageVideoInputUsdPerMTok: 0.4,
      textOutputUsdPerMTok: 2.2,
      audioInputUsdPerMTok: 3,
      audioOutputUsdPerMTok: 11.9
    }
  },
  elevenlabs: {
    scribeUsdPerHour: 0.22
  },
  openai: {
    transcriptionUsdPerMinute: {
      "gpt-4o-mini-transcribe": 0.003,
      "gpt-4o-transcribe": 0.006,
      "gpt-realtime-whisper": 0.017,
      "gpt-realtime-translate": 0.034
    }
  }
};
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
  creator: { planPriceCents: 9900, includedMinutes: 2400, aiReviewBudgetSeconds: 0 },
  studio: { planPriceCents: 29900, includedMinutes: 10000, aiReviewBudgetSeconds: 0 },
  network: { planPriceCents: 79900, includedMinutes: 36000, aiReviewBudgetSeconds: 0 },
  stress_99_5000: { planPriceCents: 9900, includedMinutes: 5000, aiReviewBudgetSeconds: 0 }
};

export function estimateJobCost(input = {}) {
  const minutes = Math.max(0, Number(input.minutesMetered || input.minutes || 0));
  const aiReviewSeconds = Math.max(0, Number(input.aiReviewSeconds || 0));
  const observedUsage = summarizeObservedProviderUsage(input.providerUsage || input.provider_usage || []);
  const observedProviderCost = estimateObservedProviderCost(input.providerUsage || input.provider_usage || []);
  const checkCost = estimateModelCheckCost(input.checks, minutes || 1);
  const plan = resolvePlanEconomics(input);
  const planPriceCents = plan.planPriceCents;
  const includedMinutes = plan.includedMinutes;
  const cogsBudgetCents = planPriceCents * (1 - TARGET_MARGIN);
  const maxCostPerMinuteCents = cogsBudgetCents / includedMinutes;
  const revenuePerMinuteCents = includedMinutes > 0 ? planPriceCents / includedMinutes : 0;

  const deterministicComputeCents = minutes * DEFAULT_DETERMINISTIC_COST_PER_MINUTE_CENTS; // Render starter task at about $0.05/hour, 1x realtime.
  const flashLiteVideoAudioInputCents = minutes * GEMINI_25_FLASH_LITE_VIDEO_AUDIO_INPUT_CENTS_PER_MINUTE;
  const flashVideoAudioInputCents = minutes * GEMINI_25_FLASH_VIDEO_AUDIO_INPUT_CENTS_PER_MINUTE;
  const flashBatchVideoAudioInputCents = minutes * GEMINI_25_FLASH_BATCH_VIDEO_AUDIO_INPUT_CENTS_PER_MINUTE;
  const qwenOmniVideoAudioInputCents = minutes * QWEN_35_OMNI_FLASH_VIDEO_AUDIO_INPUT_CENTS_PER_MINUTE;
  const sampledAiCents = (aiReviewSeconds / 60) * DEFAULT_AI_REVIEW_COST_PER_MINUTE_CENTS;
  const estimatedCogsCents = deterministicComputeCents + sampledAiCents + checkCost.modelCheckCents;
  const observedTotalCogsCents = deterministicComputeCents + observedProviderCost.observedProviderCogsCents;
  const allowedCogsForJobCents = minutes * maxCostPerMinuteCents;
  const allocatedRevenueCents = minutes * revenuePerMinuteCents;
  const estimatedGrossMarginPct = allocatedRevenueCents > 0
    ? ((allocatedRevenueCents - estimatedCogsCents) / allocatedRevenueCents) * 100
    : 0;
  const observedGrossMarginPct = allocatedRevenueCents > 0
    ? ((allocatedRevenueCents - observedTotalCogsCents) / allocatedRevenueCents) * 100
    : 0;
  const remainingAiBudgetCents = Math.max(0, allowedCogsForJobCents - deterministicComputeCents);
  const maxAiReviewSecondsAtMargin = DEFAULT_AI_REVIEW_COST_PER_MINUTE_CENTS > 0
    ? Math.floor((remainingAiBudgetCents / DEFAULT_AI_REVIEW_COST_PER_MINUTE_CENTS) * 60)
    : 0;

  return {
    targetGrossMarginPct: TARGET_MARGIN * 100,
    planId: plan.planId,
    planPriceCents,
    includedMinutes,
    aiReviewBudgetSeconds: plan.aiReviewBudgetSeconds,
    maxCogsCents: round(cogsBudgetCents),
    maxCostPerMinuteCents: round(maxCostPerMinuteCents),
    revenuePerMinuteCents: round(revenuePerMinuteCents),
    minutesMetered: minutes,
    aiReviewSeconds,
    deterministicComputeCents: round(deterministicComputeCents),
    sampledAiCents: round(sampledAiCents),
    modelCheckCents: round(checkCost.modelCheckCents),
    modelBackedChecks: checkCost.modelBackedChecks,
    deterministicChecks: checkCost.deterministicChecks,
    observedProviderUsageEntries: observedUsage.entries,
    observedProviderInputTokens: observedUsage.inputTokens,
    observedProviderOutputTokens: observedUsage.outputTokens,
    observedProviderTotalTokens: observedUsage.totalTokens,
    observedProviderAudioSeconds: observedUsage.audioSeconds,
    observedProviderRequestCount: observedUsage.requestCount,
    observedProviderCogsCents: observedProviderCost.observedProviderCogsCents,
    observedProviderCostPerMinuteCents: round(minutes ? observedProviderCost.observedProviderCogsCents / minutes : 0),
    observedTotalCogsCents: round(observedTotalCogsCents),
    observedCostPerMinuteCents: round(minutes ? observedTotalCogsCents / minutes : 0),
    observedGrossMarginPct: round(observedGrossMarginPct),
    observedMarginSafe: observedUsage.entries ? observedTotalCogsCents <= allowedCogsForJobCents : null,
    observedProviderCostDetails: observedProviderCost.details,
    estimatedCogsCents: round(estimatedCogsCents),
    estimatedCostPerMinuteCents: round(minutes ? estimatedCogsCents / minutes : 0),
    allocatedRevenueCents: round(allocatedRevenueCents),
    estimatedGrossMarginPct: round(estimatedGrossMarginPct),
    allowedCogsForJobCents: round(allowedCogsForJobCents),
    maxAiReviewSecondsAtMargin,
    marginSafe: estimatedCogsCents <= allowedCogsForJobCents,
    fullGeminiFlashLiteVideoAudioInputCents: round(flashLiteVideoAudioInputCents),
    fullGeminiFlashVideoAudioInputCents: round(flashVideoAudioInputCents),
    fullGeminiFlashBatchVideoAudioInputCents: round(flashBatchVideoAudioInputCents),
    fullQwenOmniFlashVideoAudioInputCents: round(qwenOmniVideoAudioInputCents),
    warning: flashLiteVideoAudioInputCents > minutes * maxCostPerMinuteCents
      ? `Full-video Gemini review exceeds the 95% margin budget for ${plan.planId || "this plan"}.`
      : null
  };
}

export function summarizeUsageMargins(entries = []) {
  const summary = entries.reduce((acc, entry) => {
    const snapshot = entry.costSnapshot || entry.costEstimate || {};
    const minutes = Number(entry.roundedMinutes || snapshot.minutesMetered || 0) || 0;
    const cogs = Number(snapshot.estimatedCogsCents || 0) || 0;
    const revenue = Number(snapshot.allocatedRevenueCents || 0) || 0;
    const allowed = Number(snapshot.allowedCogsForJobCents || 0) || 0;
    acc.observedProviderUsageEntries += Number(snapshot.observedProviderUsageEntries || 0) || 0;
    acc.observedProviderInputTokens += Number(snapshot.observedProviderInputTokens || 0) || 0;
    acc.observedProviderOutputTokens += Number(snapshot.observedProviderOutputTokens || 0) || 0;
    acc.observedProviderTotalTokens += Number(snapshot.observedProviderTotalTokens || 0) || 0;
    acc.observedProviderAudioSeconds += Number(snapshot.observedProviderAudioSeconds || 0) || 0;
    acc.observedProviderRequestCount += Number(snapshot.observedProviderRequestCount || 0) || 0;
    acc.observedProviderCogsCents += Number(snapshot.observedProviderCogsCents || 0) || 0;
    acc.observedTotalCogsCents += Number(snapshot.observedTotalCogsCents || 0) || 0;
    acc.entries += 1;
    acc.minutes += minutes;
    acc.estimatedCogsCents += cogs;
    acc.allocatedRevenueCents += revenue;
    acc.allowedCogsCents += allowed;
    if (snapshot.marginSafe === false) acc.marginUnsafeEntries += 1;
    if (snapshot.observedMarginSafe === false) acc.observedMarginUnsafeEntries += 1;
    return acc;
  }, {
    entries: 0,
    minutes: 0,
    estimatedCogsCents: 0,
    allocatedRevenueCents: 0,
    allowedCogsCents: 0,
    marginUnsafeEntries: 0,
    observedProviderUsageEntries: 0,
    observedProviderInputTokens: 0,
    observedProviderOutputTokens: 0,
    observedProviderTotalTokens: 0,
    observedProviderAudioSeconds: 0,
    observedProviderRequestCount: 0,
    observedProviderCogsCents: 0,
    observedTotalCogsCents: 0,
    observedMarginUnsafeEntries: 0
  });

  const grossMarginPct = summary.allocatedRevenueCents > 0
    ? ((summary.allocatedRevenueCents - summary.estimatedCogsCents) / summary.allocatedRevenueCents) * 100
    : 0;
  const observedGrossMarginPct = summary.allocatedRevenueCents > 0
    ? ((summary.allocatedRevenueCents - summary.observedTotalCogsCents) / summary.allocatedRevenueCents) * 100
    : 0;

  return {
    entries: summary.entries,
    minutes: round(summary.minutes),
    estimatedCogsCents: round(summary.estimatedCogsCents),
    estimatedCogsUsd: round(summary.estimatedCogsCents / 100),
    allocatedRevenueCents: round(summary.allocatedRevenueCents),
    allocatedRevenueUsd: round(summary.allocatedRevenueCents / 100),
    allowedCogsCents: round(summary.allowedCogsCents),
    observedProviderUsageEntries: summary.observedProviderUsageEntries,
    observedProviderInputTokens: summary.observedProviderInputTokens,
    observedProviderOutputTokens: summary.observedProviderOutputTokens,
    observedProviderTotalTokens: summary.observedProviderTotalTokens,
    observedProviderAudioSeconds: round(summary.observedProviderAudioSeconds),
    observedProviderRequestCount: summary.observedProviderRequestCount,
    observedProviderCogsCents: round(summary.observedProviderCogsCents),
    observedProviderCogsUsd: round(summary.observedProviderCogsCents / 100),
    observedProviderCostPerMinuteCents: round(summary.minutes ? summary.observedProviderCogsCents / summary.minutes : 0),
    observedTotalCogsCents: round(summary.observedTotalCogsCents),
    observedTotalCogsUsd: round(summary.observedTotalCogsCents / 100),
    observedCostPerMinuteCents: round(summary.minutes ? summary.observedTotalCogsCents / summary.minutes : 0),
    observedGrossMarginPct: round(observedGrossMarginPct),
    observedMarginSafe: summary.observedProviderUsageEntries > 0 ? summary.observedMarginUnsafeEntries === 0 && summary.observedTotalCogsCents <= summary.allowedCogsCents : null,
    observedMarginUnsafeEntries: summary.observedMarginUnsafeEntries,
    estimatedCostPerMinuteCents: round(summary.minutes ? summary.estimatedCogsCents / summary.minutes : 0),
    estimatedGrossMarginPct: round(grossMarginPct),
    marginSafe: summary.marginUnsafeEntries === 0 && summary.estimatedCogsCents <= summary.allowedCogsCents,
    marginUnsafeEntries: summary.marginUnsafeEntries
  };
}

export function estimateObservedProviderCost(entries = []) {
  const details = (Array.isArray(entries) ? entries : [])
    .filter((entry) => entry && typeof entry === "object")
    .map((entry) => estimateObservedProviderEntryCost(entry));
  return {
    observedProviderCogsCents: round(details.reduce((sum, detail) => sum + detail.cogsCents, 0)),
    details
  };
}

function estimateObservedProviderEntryCost(entry) {
  const provider = String(entry.provider || "").toLowerCase();
  if (provider === "anthropic") return estimateAnthropicEntryCost(entry);
  if (provider === "dashscope" || provider === "openrouter") return estimateQwenOmniEntryCost(entry, provider);
  if (provider === "elevenlabs") return estimateElevenLabsEntryCost(entry);
  if (provider === "openai") return estimateOpenAiEntryCost(entry);
  return { provider: provider || "unknown", model: entry.model || null, cogsCents: 0, pricingSource: "unknown_provider" };
}

function estimateAnthropicEntryCost(entry) {
  const model = String(entry.model || "");
  const modelPricing = PROVIDER_PRICING.anthropic.models[model] || {};
  const inputRate = modelPricing.inputUsdPerMTok || PROVIDER_PRICING.anthropic.defaultInputUsdPerMTok;
  const outputRate = modelPricing.outputUsdPerMTok || PROVIDER_PRICING.anthropic.defaultOutputUsdPerMTok;
  const inputTokens = number(entry.input_tokens ?? entry.inputTokens);
  const outputTokens = number(entry.output_tokens ?? entry.outputTokens);
  const cacheReadTokens = number(entry.cache_read_input_tokens ?? entry.cacheReadInputTokens);
  const cacheWriteTokens = number(entry.cache_creation_input_tokens ?? entry.cacheCreationInputTokens);
  const uncachedInputTokens = Math.max(0, inputTokens - cacheReadTokens - cacheWriteTokens);
  const cogsUsd =
    mtok(uncachedInputTokens) * inputRate +
    mtok(outputTokens) * outputRate +
    mtok(cacheReadTokens) * PROVIDER_PRICING.anthropic.cacheReadUsdPerMTok +
    mtok(cacheWriteTokens) * PROVIDER_PRICING.anthropic.cacheWrite5mUsdPerMTok;
  return {
    provider: "anthropic",
    model: model || null,
    operation: entry.operation || null,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    cogsCents: round(cogsUsd * 100),
    pricingSource: "anthropic_sonnet_haiku_official_api_pricing"
  };
}

function estimateQwenOmniEntryCost(entry, provider) {
  const model = String(entry.model || "qwen3.5-omni-flash");
  const pricing = PROVIDER_PRICING[provider]?.[model] || PROVIDER_PRICING.dashscope["qwen3.5-omni-flash"];
  const inputTokens = number(entry.input_tokens ?? entry.prompt_tokens ?? entry.inputTokens ?? entry.promptTokens);
  const outputTokens = number(entry.output_tokens ?? entry.completion_tokens ?? entry.outputTokens ?? entry.completionTokens);
  const inputRate = entry.audio_included ? pricing.audioInputUsdPerMTok : pricing.textImageVideoInputUsdPerMTok;
  const outputRate = entry.audio_output_included ? pricing.audioOutputUsdPerMTok : pricing.textOutputUsdPerMTok;
  const cogsUsd = mtok(inputTokens) * inputRate + mtok(outputTokens) * outputRate;
  return {
    provider,
    model,
    operation: entry.operation || null,
    inputTokens,
    outputTokens,
    audioIncluded: Boolean(entry.audio_included),
    cogsCents: round(cogsUsd * 100),
    pricingSource: "qwencloud_qwen3_5_omni_flash_pricing"
  };
}

function estimateElevenLabsEntryCost(entry) {
  const audioSeconds = number(entry.audio_seconds ?? entry.audioSeconds);
  const cogsUsd = (audioSeconds / 3600) * PROVIDER_PRICING.elevenlabs.scribeUsdPerHour;
  return {
    provider: "elevenlabs",
    model: entry.model || "scribe_v1",
    operation: entry.operation || null,
    audioSeconds,
    cogsCents: round(cogsUsd * 100),
    pricingSource: "elevenlabs_scribe_official_pricing"
  };
}

function estimateOpenAiEntryCost(entry) {
  const model = String(entry.model || "gpt-4o-mini-transcribe");
  const audioSeconds = number(entry.audio_seconds ?? entry.audioSeconds ?? entry.window_seconds ?? entry.windowSeconds);
  const rate = PROVIDER_PRICING.openai.transcriptionUsdPerMinute[model] || 0;
  const cogsUsd = (audioSeconds / 60) * rate;
  return {
    provider: "openai",
    model,
    operation: entry.operation || null,
    audioSeconds,
    cogsCents: round(cogsUsd * 100),
    pricingSource: rate ? "openai_official_transcription_pricing" : "openai_unknown_model"
  };
}

export function summarizeObservedProviderUsage(entries = []) {
  const list = Array.isArray(entries) ? entries : [];
  return list.reduce((acc, entry) => {
    if (!entry || typeof entry !== "object") return acc;
    acc.entries += 1;
    acc.inputTokens += number(entry.input_tokens ?? entry.prompt_tokens ?? entry.inputTokens ?? entry.promptTokens);
    acc.outputTokens += number(entry.output_tokens ?? entry.completion_tokens ?? entry.outputTokens ?? entry.completionTokens);
    acc.totalTokens += number(entry.total_tokens ?? entry.totalTokens);
    acc.audioSeconds += number(entry.audio_seconds ?? entry.audioSeconds ?? entry.window_seconds ?? entry.windowSeconds);
    acc.requestCount += number(entry.request_count ?? entry.requestCount ?? 1);
    return acc;
  }, {
    entries: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    audioSeconds: 0,
    requestCount: 0
  });
}

export function resolvePlanEconomics(input = {}) {
  const planId = String(input.planId || input.plan_id || "").toLowerCase();
  const preset = PLAN_PRESETS[planId] || {};
  return {
    planId: planId || null,
    planPriceCents: Number(input.planPriceCents || input.plan_price_cents || preset.planPriceCents || DEFAULT_PLAN_PRICE_CENTS),
    includedMinutes: Number(input.includedMinutes || input.included_minutes || preset.includedMinutes || DEFAULT_INCLUDED_MINUTES),
    aiReviewBudgetSeconds: Number(input.aiReviewBudgetSeconds ?? input.ai_review_budget_seconds ?? preset.aiReviewBudgetSeconds ?? 0)
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

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function mtok(tokens) {
  return number(tokens) / 1000000;
}

function round(value) {
  return Math.round(value * 10000) / 10000;
}
