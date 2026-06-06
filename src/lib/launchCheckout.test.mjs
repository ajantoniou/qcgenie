import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildCheckoutSummary, formatCheckoutSummary } from "../../launch-checkout.mjs";

describe("launch checkout config helper", () => {
  it("summarizes configured Lemon Squeezy checkout URLs without exposing variant ids", () => {
    const summary = buildCheckoutSummary({
      UPLOADCHECK_LEMONSQUEEZY_STORE_SLUG: "uploadcheck",
      UPLOADCHECK_CREATOR_VARIANT_ID: "111",
      UPLOADCHECK_STUDIO_VARIANT_ID: "222",
      UPLOADCHECK_NETWORK_VARIANT_ID: "333"
    });
    const text = formatCheckoutSummary(summary);

    expect(summary.ok).toBe(true);
    expect(summary.plans.map((plan) => [plan.plan, plan.host, plan.redactedUrl])).toEqual([
      ["creator", "uploadcheck.lemonsqueezy.com", "https://uploadcheck.lemonsqueezy.com/checkout/buy/<variant_id>"],
      ["studio", "uploadcheck.lemonsqueezy.com", "https://uploadcheck.lemonsqueezy.com/checkout/buy/<variant_id>"],
      ["network", "uploadcheck.lemonsqueezy.com", "https://uploadcheck.lemonsqueezy.com/checkout/buy/<variant_id>"]
    ]);
    expect(text).toContain("UploadCheck checkout config: READY");
    expect(text).not.toContain("111");
    expect(text).not.toContain("222");
    expect(text).not.toContain("333");
  });

  it("prints missing checkout env with a failing exit code", () => {
    const result = spawnSync("npm", ["run", "--silent", "launch:checkout"], {
      cwd: resolve("."),
      encoding: "utf8",
      env: { PATH: process.env.PATH }
    });

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("UploadCheck checkout config: NOT READY");
    expect(result.stdout).toContain("BLOCK creator");
    expect(result.stdout).toContain("UPLOADCHECK_<PLAN>_CHECKOUT_URL");
  });

  it("does not mark checkout ready when Creator is missing but Studio is configured", () => {
    const summary = buildCheckoutSummary({
      UPLOADCHECK_STUDIO_CHECKOUT_URL: "https://checkout.example/studio",
      UPLOADCHECK_NETWORK_CHECKOUT_URL: "https://checkout.example/network"
    });
    const text = formatCheckoutSummary(summary);

    expect(summary.ok).toBe(false);
    expect(summary.plans.map((plan) => [plan.plan, plan.configured, plan.sourceKey])).toEqual([
      ["creator", false, null],
      ["studio", true, "UPLOADCHECK_STUDIO_CHECKOUT_URL"],
      ["network", true, "UPLOADCHECK_NETWORK_CHECKOUT_URL"]
    ]);
    expect(text).toContain("UploadCheck checkout config: NOT READY");
    expect(text).toContain("BLOCK creator");
  });
});
