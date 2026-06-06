import { describe, expect, it } from "vitest";
import { applyCostGuardrail, estimateJobCost, estimateModelCheckCost, summarizeUsageMargins, summarizeObservedProviderUsage, estimateObservedProviderCost } from "../../cost-model.mjs";

describe("cost model", () => {
  it("computes the 95% margin budget for the $99 / 5,000 minute plan", () => {
    const estimate = estimateJobCost({ minutesMetered: 5000 });

    expect(estimate.aiReviewBudgetSeconds).toBe(0);
    expect(estimate.maxCogsCents).toBe(495);
    expect(estimate.maxCostPerMinuteCents).toBe(0.099);
    expect(estimate.revenuePerMinuteCents).toBe(1.98);
    expect(estimate.allocatedRevenueCents).toBe(9900);
    expect(estimate.estimatedGrossMarginPct).toBeGreaterThan(95);
    expect(estimate.estimatedCogsCents).toBeLessThanOrEqual(estimate.maxCogsCents);
    expect(estimate.fullGeminiFlashLiteVideoAudioInputCents).toBeGreaterThan(estimate.maxCogsCents);
    expect(estimate.warning).toContain("Full-video Gemini review exceeds");
  });

  it("exposes conservative AI-review seconds per paid plan", () => {
    expect(estimateJobCost({ planId: "creator", minutesMetered: 1200 }).aiReviewBudgetSeconds).toBe(3600);
    expect(estimateJobCost({ planId: "studio", minutesMetered: 5000 }).aiReviewBudgetSeconds).toBe(7200);
    expect(estimateJobCost({ planId: "network", minutesMetered: 18000 }).aiReviewBudgetSeconds).toBe(21600);
  });

  it("marks sampled AI review as unsafe when it crosses the per-minute budget", () => {
    const estimate = estimateJobCost({ minutesMetered: 10, aiReviewSeconds: 600 });

    expect(estimate.marginSafe).toBe(false);
  });

  it("estimates model-backed check costs separately from deterministic checks", () => {
    const estimate = estimateJobCost({ minutesMetered: 1, checks: "canvas_fill,twins,cheap_broll" });
    const checkCost = estimateModelCheckCost("canvas_fill,twins,cheap_broll", 1);

    expect(estimate.modelBackedChecks).toEqual(["twins", "cheap_broll"]);
    expect(estimate.deterministicChecks).toEqual(["canvas_fill"]);
    expect(estimate.modelCheckCents).toBeCloseTo(checkCost.modelCheckCents);
  });

  it("uses the observed Sonnet vision-call floor for model-backed preflight", () => {
    const checkCost = estimateModelCheckCost("twins", 1);

    expect(checkCost.modelCalls).toBe(12);
    expect(checkCost.modelCheckCents / checkCost.modelCalls).toBe(0.75);
    expect(checkCost.modelCheckCents).toBeGreaterThan(8);
  });

  it("downgrades model-backed checks on Creator when observed call costs break per-job margin", () => {
    const guardrail = applyCostGuardrail({
      planId: "creator",
      minutes: 1,
      checks: "canvas_fill,twins",
      costGuardrail: "downgrade"
    });

    expect(guardrail.action).toBe("downgraded_to_deterministic");
    expect(guardrail.removedChecks).toBe("twins");
    expect(guardrail.originalEstimate.marginSafe).toBe(false);
    expect(guardrail.estimate.marginSafe).toBe(true);
  });

  it("downgrades default model-backed checks when they break the margin budget", () => {
    const guardrail = applyCostGuardrail({
      planId: "stress_99_5000",
      costGuardrail: "downgrade"
    });

    expect(guardrail.ok).toBe(true);
    expect(guardrail.action).toBe("downgraded_to_deterministic");
    expect(guardrail.removedChecks).toContain("twins");
    expect(guardrail.checks).not.toContain("twins");
    expect(guardrail.estimate.marginSafe).toBe(true);
  });

  it("can block unsafe model-backed checks instead of downgrading", () => {
    const guardrail = applyCostGuardrail({
      checks: "canvas_fill,twins",
      planId: "stress_99_5000",
      costGuardrail: "block"
    });

    expect(guardrail.ok).toBe(false);
    expect(guardrail.reason).toContain("model-backed checks");
  });

  it("summarizes usage ledger margin telemetry", () => {
    const first = estimateJobCost({ planId: "creator", minutesMetered: 10, checks: "canvas_fill" });
    const second = estimateJobCost({
      planId: "creator",
      minutesMetered: 5,
      checks: "canvas_fill",
      aiReviewSeconds: 600,
      providerUsage: [{ provider: "anthropic", model: "claude-sonnet-4-5", input_tokens: 1000, output_tokens: 200, audio_seconds: 30, request_count: 2 }]
    });
    const summary = summarizeUsageMargins([
      { roundedMinutes: 10, costSnapshot: first },
      { roundedMinutes: 5, costSnapshot: second }
    ]);

    expect(summary.entries).toBe(2);
    expect(summary.minutes).toBe(15);
    expect(summary.estimatedCostPerMinuteCents).toBeGreaterThan(0);
    expect(summary.allocatedRevenueCents).toBeGreaterThan(summary.estimatedCogsCents);
    expect(summary.observedProviderInputTokens).toBe(1000);
    expect(summary.observedProviderAudioSeconds).toBe(30);
    expect(summary.observedProviderCogsCents).toBeGreaterThan(0);
    expect(summary.observedCostPerMinuteCents).toBeGreaterThan(0);
    expect(summary.marginUnsafeEntries).toBe(1);
  });

  it("rolls up observed provider usage from token and audio providers", () => {
    const summary = summarizeObservedProviderUsage([
      { provider: "anthropic", input_tokens: 1200, output_tokens: 80 },
      { provider: "dashscope", prompt_tokens: 300, completion_tokens: 40, total_tokens: 340 },
      { provider: "elevenlabs", audio_seconds: 22.5, request_count: 1 }
    ]);

    expect(summary.entries).toBe(3);
    expect(summary.inputTokens).toBe(1500);
    expect(summary.outputTokens).toBe(120);
    expect(summary.totalTokens).toBe(340);
    expect(summary.audioSeconds).toBe(22.5);
    expect(summary.requestCount).toBe(3);
  });

  it("estimates observed provider COGS from real token and audio usage", () => {
    const result = estimateObservedProviderCost([
      { provider: "anthropic", model: "claude-sonnet-4-5", input_tokens: 1637, output_tokens: 108 },
      { provider: "dashscope", model: "qwen3.5-omni-flash", prompt_tokens: 10000, completion_tokens: 500, audio_included: false },
      { provider: "elevenlabs", model: "scribe_v1", audio_seconds: 60 }
    ]);

    expect(result.observedProviderCogsCents).toBeCloseTo(1.5298, 4);
    expect(result.details).toHaveLength(3);
    expect(result.details[0]).toMatchObject({
      provider: "anthropic",
      inputTokens: 1637,
      outputTokens: 108
    });
  });
});
