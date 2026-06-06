import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { estimateJobCost } from "../../cost-model.mjs";

function readJson(path) {
  return JSON.parse(readFileSync(resolve(path), "utf8"));
}

describe("public cost basis", () => {
  it("publishes the stress-plan answer for $99 / 5,000 checked minutes", () => {
    const basis = readJson("public/cost-basis.json");
    const stress = basis.plans.find((plan) => plan.plan_id === "stress_99_5000");

    expect(basis.target_gross_margin_pct).toBe(95);
    expect(stress).toMatchObject({
      price_cents: 9900,
      included_minutes: 5000,
      max_cost_per_minute_cents_at_95_margin: 0.099,
      deterministic_full_allowance_cogs_cents: 416.5,
      full_gemini_flash_lite_video_audio_input_cogs_cents: 1077,
      deterministic_margin_safe: true,
      full_flash_lite_input_margin_safe: false
    });
    expect(basis.verdict.stress_99_5000).toContain("too generous");
  });

  it("keeps public plan economics aligned with estimateJobCost", () => {
    const basis = readJson("public/cost-basis.json");

    for (const plan of basis.plans) {
      const estimate = estimateJobCost({
        planId: plan.plan_id,
        minutesMetered: plan.included_minutes,
        checks: "canvas_fill"
      });

      expect(plan.price_cents).toBe(estimate.planPriceCents);
      expect(plan.included_minutes).toBe(estimate.includedMinutes);
      expect(plan.max_cogs_cents_at_95_margin).toBe(estimate.maxCogsCents);
      expect(plan.max_cost_per_minute_cents_at_95_margin).toBe(estimate.maxCostPerMinuteCents);
      expect(plan.revenue_per_minute_cents).toBe(estimate.revenuePerMinuteCents);
      expect(plan.deterministic_full_allowance_cogs_cents).toBe(estimate.deterministicComputeCents);
      expect(plan.deterministic_full_allowance_gross_margin_pct).toBe(estimate.estimatedGrossMarginPct);
      expect(plan.full_gemini_flash_lite_video_audio_input_cogs_cents).toBe(estimate.fullGeminiFlashLiteVideoAudioInputCents);
      expect(plan.full_gemini_flash_video_audio_input_cogs_cents).toBe(estimate.fullGeminiFlashVideoAudioInputCents);
    }
  });

  it("links cost basis from the public agent manifest", () => {
    const manifest = readJson("public/agent-manifest.json");

    expect(manifest.cost_basis_url).toBe("https://qcgenie-api.onrender.com/cost-basis.json");
  });
});
