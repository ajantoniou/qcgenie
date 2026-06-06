import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildCheckoutSummary, buildCheckoutSummaryAsync, formatCheckoutSummary } from "../../launch-checkout.mjs";

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
    expect(summary.plans.map((plan) => [plan.plan, plan.ok, plan.host, plan.redactedUrl])).toEqual([
      ["creator", true, "uploadcheck.lemonsqueezy.com", "https://uploadcheck.lemonsqueezy.com/checkout/buy/<variant_id>"],
      ["studio", true, "uploadcheck.lemonsqueezy.com", "https://uploadcheck.lemonsqueezy.com/checkout/buy/<variant_id>"],
      ["network", true, "uploadcheck.lemonsqueezy.com", "https://uploadcheck.lemonsqueezy.com/checkout/buy/<variant_id>"]
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

  it("does not mark checkout ready when a configured plan uses non-HTTPS checkout", () => {
    const summary = buildCheckoutSummary({
      UPLOADCHECK_CREATOR_CHECKOUT_URL: "http://checkout.example/creator",
      UPLOADCHECK_STUDIO_CHECKOUT_URL: "https://checkout.example/studio",
      UPLOADCHECK_NETWORK_CHECKOUT_URL: "https://checkout.example/network"
    });
    const text = formatCheckoutSummary(summary);

    expect(summary.ok).toBe(false);
    expect(summary.plans[0]).toMatchObject({
      plan: "creator",
      configured: true,
      ok: false,
      secure: false,
      reason: "checkout_url_must_be_https"
    });
    expect(text).toContain("BLOCK creator");
    expect(text).toContain("reason: checkout_url_must_be_https");
  });

  it("optionally probes configured checkout URLs without exposing checkout paths", async () => {
    const seen = [];
    const summary = await buildCheckoutSummaryAsync({
      UPLOADCHECK_CREATOR_CHECKOUT_URL: "https://checkout.example/creator-secret",
      UPLOADCHECK_STUDIO_CHECKOUT_URL: "https://checkout.example/studio-secret",
      UPLOADCHECK_NETWORK_CHECKOUT_URL: "https://checkout.example/network-secret",
      UPLOADCHECK_CHECKOUT_PROBE: "1"
    }, {
      fetchImpl: async (url, options) => {
        seen.push([url, options.method]);
        return { status: 302 };
      }
    });
    const text = formatCheckoutSummary(summary);

    expect(summary.ok).toBe(true);
    expect(summary.probeEnabled).toBe(true);
    expect(summary.plans.map((plan) => plan.probe)).toEqual([
      { checked: true, ok: true, status: 302, reason: "checkout_probe_passed" },
      { checked: true, ok: true, status: 302, reason: "checkout_probe_passed" },
      { checked: true, ok: true, status: 302, reason: "checkout_probe_passed" }
    ]);
    expect(seen).toEqual([
      ["https://checkout.example/creator-secret", "HEAD"],
      ["https://checkout.example/studio-secret", "HEAD"],
      ["https://checkout.example/network-secret", "HEAD"]
    ]);
    expect(text).toContain("UploadCheck checkout config: READY");
    expect(text).toContain("probe: pass (302)");
    expect(text).not.toContain("creator-secret");
    expect(text).not.toContain("studio-secret");
    expect(text).not.toContain("network-secret");
  });

  it("fails optional checkout probing when a configured URL returns a bad status", async () => {
    const summary = await buildCheckoutSummaryAsync({
      UPLOADCHECK_CREATOR_CHECKOUT_URL: "https://checkout.example/creator-secret",
      UPLOADCHECK_STUDIO_CHECKOUT_URL: "https://checkout.example/studio-secret",
      UPLOADCHECK_NETWORK_CHECKOUT_URL: "https://checkout.example/network-secret",
      UPLOADCHECK_CHECKOUT_PROBE: "1"
    }, {
      fetchImpl: async (url) => ({ status: url.includes("studio") ? 500 : 200 })
    });
    const text = formatCheckoutSummary(summary);

    expect(summary.ok).toBe(false);
    expect(summary.plans[1]).toMatchObject({
      plan: "studio",
      ok: false,
      reason: "checkout_probe_http_500",
      probe: { checked: true, ok: false, status: 500, reason: "checkout_probe_http_500" }
    });
    expect(text).toContain("UploadCheck checkout config: NOT READY");
    expect(text).toContain("BLOCK studio");
    expect(text).toContain("probe: fail (checkout_probe_http_500)");
    expect(text).not.toContain("studio-secret");
  });
});
