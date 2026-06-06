import { describe, expect, it } from "vitest";
import { applyCostGuardrail, estimateJobCost, estimateModelCheckCost, summarizeUsageMargins } from "../../cost-model.mjs";

describe("cost model", () => {
  it("computes the 95% margin budget for the $99 / 5,000 minute plan", () => {
    const estimate = estimateJobCost({ minutesMetered: 5000 });

    expect(estimate.maxCogsCents).toBe(495);
    expect(estimate.maxCostPerMinuteCents).toBe(0.099);
    expect(estimate.revenuePerMinuteCents).toBe(1.98);
    expect(estimate.allocatedRevenueCents).toBe(9900);
    expect(estimate.estimatedGrossMarginPct).toBeGreaterThan(95);
    expect(estimate.estimatedCogsCents).toBeLessThanOrEqual(estimate.maxCogsCents);
    expect(estimate.fullGeminiFlashLiteVideoAudioInputCents).toBeGreaterThan(estimate.maxCogsCents);
    expect(estimate.warning).toContain("Full-video Gemini review exceeds");
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
    const second = estimateJobCost({ planId: "creator", minutesMetered: 5, checks: "canvas_fill", aiReviewSeconds: 600 });
    const summary = summarizeUsageMargins([
      { roundedMinutes: 10, costSnapshot: first },
      { roundedMinutes: 5, costSnapshot: second }
    ]);

    expect(summary.entries).toBe(2);
    expect(summary.minutes).toBe(15);
    expect(summary.estimatedCostPerMinuteCents).toBeGreaterThan(0);
    expect(summary.allocatedRevenueCents).toBeGreaterThan(summary.estimatedCogsCents);
    expect(summary.marginUnsafeEntries).toBe(1);
  });
});
