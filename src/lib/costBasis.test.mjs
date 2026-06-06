import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { estimateJobCost } from "../../cost-model.mjs";
import { verifyCostBasis } from "../../scripts/verify-cost-basis.mjs";

function readJson(path) {
  return JSON.parse(readFileSync(resolve(path), "utf8"));
}

describe("public cost basis", () => {
  it("publishes the stress-plan answer for $99 / 5,000 checked minutes", () => {
    const basis = readJson("public/cost-basis.json");
    const stress = basis.plans.find((plan) => plan.plan_id === "stress_99_5000");

    expect(basis.target_gross_margin_pct).toBe(95);
    expect(basis.cost_assumptions.model_check_call_cost_cents).toBe(0.75);
    expect(basis.observed_calibration.source).toContain("0.654");
    expect(stress).toMatchObject({
      price_cents: 9900,
      included_minutes: 5000,
      ai_review_budget_seconds: 0,
      max_ai_review_seconds_at_95_margin_after_deterministic_full_allowance: 21866,
      max_cost_per_minute_cents_at_95_margin: 0.099,
      deterministic_full_allowance_cogs_cents: 416.5,
      remaining_cogs_after_deterministic_full_allowance_cents: 78.5,
      remaining_cost_per_minute_after_deterministic_full_allowance_cents: 0.0157,
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
      expect(plan.ai_review_budget_seconds).toBe(estimate.aiReviewBudgetSeconds);
      expect(plan.max_ai_review_seconds_at_95_margin_after_deterministic_full_allowance).toBe(estimate.maxAiReviewSecondsAtMargin);
      expect(plan.max_cogs_cents_at_95_margin).toBe(estimate.maxCogsCents);
      expect(plan.max_cost_per_minute_cents_at_95_margin).toBe(estimate.maxCostPerMinuteCents);
      expect(plan.revenue_per_minute_cents).toBe(estimate.revenuePerMinuteCents);
      expect(plan.deterministic_full_allowance_cogs_cents).toBe(estimate.deterministicComputeCents);
      expect(plan.remaining_cogs_after_deterministic_full_allowance_cents).toBe(round(estimate.maxCogsCents - estimate.deterministicComputeCents));
      expect(plan.remaining_cost_per_minute_after_deterministic_full_allowance_cents).toBe(round(estimate.maxCostPerMinuteCents - (estimate.deterministicComputeCents / estimate.includedMinutes)));
      expect(plan.deterministic_full_allowance_gross_margin_pct).toBe(estimate.estimatedGrossMarginPct);
      expect(plan.full_gemini_flash_lite_video_audio_input_cogs_cents).toBe(estimate.fullGeminiFlashLiteVideoAudioInputCents);
      expect(plan.full_gemini_flash_video_audio_input_cogs_cents).toBe(estimate.fullGeminiFlashVideoAudioInputCents);
    }
  });

  it("links cost basis from the public agent manifest", () => {
    const manifest = readJson("public/agent-manifest.json");

    expect(manifest.cost_basis_url).toBe("https://qcgenie-api.onrender.com/cost-basis.json");
  });

  it("exposes an operator verifier for public cost basis drift", () => {
    const output = execFileSync("npm", ["run", "--silent", "cost-basis:verify"], {
      cwd: resolve("."),
      encoding: "utf8"
    });
    const result = JSON.parse(output);

    expect(result.ok).toBe(true);
    expect(result.defaultGuardrail).toBe("downgrade");
    expect(result.stressVerdict).toContain("too generous");
  });

  it("fails cost-basis verification when the stress plan drifts", () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-cost-basis-"));
    const path = join(dir, "cost-basis.json");

    try {
      const basis = readJson("public/cost-basis.json");
      basis.plans.find((plan) => plan.plan_id === "stress_99_5000").max_cost_per_minute_cents_at_95_margin = 99;
      writeFileSync(path, JSON.stringify(basis));

      const result = verifyCostBasis({ costBasisPath: path });

      expect(result.ok).toBe(false);
      expect(result.errors.map((error) => error.reason)).toContain("mismatch");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

function round(value) {
  return Math.round((Number(value) + Number.EPSILON) * 10000) / 10000;
}
