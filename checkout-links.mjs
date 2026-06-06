const PLAN_ALIASES = {
  creator: ["CREATOR"],
  studio: ["STUDIO", "GROWTH"],
  network: ["NETWORK"]
};

export const CHECKOUT_PLANS = ["creator", "studio", "network"];

export function buildCheckoutUrl(planId, env = process.env) {
  return resolveCheckout(planId, env).url;
}

export function resolveCheckout(planId, env = process.env) {
  const normalized = normalizePlanId(planId);
  if (!normalized) return { plan: null, configured: false, url: null, source: "unknown_plan", sourceKey: null };

  for (const alias of PLAN_ALIASES[normalized]) {
    for (const key of [`UPLOADCHECK_${alias}_CHECKOUT_URL`, `LEMONSQUEEZY_${alias}_CHECKOUT_URL`]) {
      const directUrl = env[key];
      if (directUrl) return { plan: normalized, configured: true, url: directUrl, source: "direct_url", sourceKey: key };
    }
  }

  const storeSlug = storeSlugForEnv(env);
  const variantId = variantForPlan(normalized, env);
  if (storeSlug && variantId) {
    return {
      plan: normalized,
      configured: true,
      url: `https://${storeSlug.value}.lemonsqueezy.com/checkout/buy/${encodeURIComponent(variantId.value)}`,
      source: "lemonsqueezy_variant",
      sourceKey: `${storeSlug.sourceKey}+${variantId.sourceKey}`
    };
  }

  return { plan: normalized, configured: false, url: null, source: "missing", sourceKey: null };
}

export function normalizePlanId(planId) {
  const id = String(planId || "").toLowerCase();
  if (id === "creator" || id === "studio" || id === "network") return id;
  if (id === "growth") return "studio";
  return null;
}

function variantForPlan(planId, env) {
  for (const alias of PLAN_ALIASES[planId]) {
    for (const key of [`UPLOADCHECK_${alias}_VARIANT_ID`, `LEMONSQUEEZY_${alias}_VARIANT_ID`]) {
      const value = env[key];
      if (value) return { value, sourceKey: key };
    }
  }
  return null;
}

function storeSlugForEnv(env) {
  if (env.UPLOADCHECK_LEMONSQUEEZY_STORE_SLUG) return { value: env.UPLOADCHECK_LEMONSQUEEZY_STORE_SLUG, sourceKey: "UPLOADCHECK_LEMONSQUEEZY_STORE_SLUG" };
  if (env.LEMONSQUEEZY_STORE_SLUG) return { value: env.LEMONSQUEEZY_STORE_SLUG, sourceKey: "LEMONSQUEEZY_STORE_SLUG" };
  return null;
}
