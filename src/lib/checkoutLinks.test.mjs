import { describe, expect, it } from "vitest";
import { buildCheckoutUrl, normalizePlanId, resolveCheckout } from "../../checkout-links.mjs";

describe("checkout links", () => {
  it("uses explicit checkout URLs when configured", () => {
    expect(buildCheckoutUrl("creator", {
      UPLOADCHECK_CREATOR_CHECKOUT_URL: "https://checkout.example/creator"
    })).toBe("https://checkout.example/creator");
    expect(resolveCheckout("creator", {
      UPLOADCHECK_CREATOR_CHECKOUT_URL: "https://checkout.example/creator"
    })).toMatchObject({
      plan: "creator",
      configured: true,
      source: "direct_url",
      sourceKey: "UPLOADCHECK_CREATOR_CHECKOUT_URL"
    });
  });

  it("builds Lemon Squeezy buy URLs from store slug and variant id", () => {
    expect(buildCheckoutUrl("studio", {
      UPLOADCHECK_LEMONSQUEEZY_STORE_SLUG: "uploadcheck",
      UPLOADCHECK_STUDIO_VARIANT_ID: "123456"
    })).toBe("https://uploadcheck.lemonsqueezy.com/checkout/buy/123456");
    expect(resolveCheckout("studio", {
      UPLOADCHECK_LEMONSQUEEZY_STORE_SLUG: "uploadcheck",
      UPLOADCHECK_STUDIO_VARIANT_ID: "123456"
    })).toMatchObject({
      plan: "studio",
      configured: true,
      source: "lemonsqueezy_variant",
      sourceKey: "UPLOADCHECK_LEMONSQUEEZY_STORE_SLUG+UPLOADCHECK_STUDIO_VARIANT_ID"
    });
  });

  it("keeps legacy growth plan ids compatible with Studio", () => {
    expect(normalizePlanId("growth")).toBe("studio");
    expect(buildCheckoutUrl("growth", {
      LEMONSQUEEZY_STORE_SLUG: "uploadcheck",
      LEMONSQUEEZY_GROWTH_VARIANT_ID: "789"
    })).toBe("https://uploadcheck.lemonsqueezy.com/checkout/buy/789");
  });
});
