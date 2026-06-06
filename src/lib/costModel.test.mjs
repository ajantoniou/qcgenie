import { describe, expect, it } from "vitest";
import { estimateJobCost } from "../../cost-model.mjs";

describe("cost model", () => {
  it("computes the 95% margin budget for the $99 / 5,000 minute plan", () => {
    const estimate = estimateJobCost({ minutesMetered: 5000 });

    expect(estimate.maxCogsCents).toBe(495);
    expect(estimate.maxCostPerMinuteCents).toBe(0.099);
    expect(estimate.estimatedCogsCents).toBeLessThanOrEqual(estimate.maxCogsCents);
    expect(estimate.fullGeminiFlashLiteVideoAudioInputCents).toBeGreaterThan(estimate.maxCogsCents);
    expect(estimate.warning).toContain("Full-video Gemini review exceeds");
  });

  it("marks sampled AI review as unsafe when it crosses the per-minute budget", () => {
    const estimate = estimateJobCost({ minutesMetered: 10, aiReviewSeconds: 600 });

    expect(estimate.marginSafe).toBe(false);
  });
});
