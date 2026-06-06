const PLAN_ALIASES = {
  creator: ["CREATOR", "STUDIO"],
  studio: ["STUDIO", "GROWTH"],
  network: ["NETWORK"]
};

export function buildCheckoutUrl(planId, env = process.env) {
  const normalized = normalizePlanId(planId);
  if (!normalized) return null;

  for (const alias of PLAN_ALIASES[normalized]) {
    const directUrl = env[`UPLOADCHECK_${alias}_CHECKOUT_URL`] || env[`LEMONSQUEEZY_${alias}_CHECKOUT_URL`];
    if (directUrl) return directUrl;
  }

  const storeSlug = env.UPLOADCHECK_LEMONSQUEEZY_STORE_SLUG || env.LEMONSQUEEZY_STORE_SLUG;
  const variantId = variantForPlan(normalized, env);
  if (storeSlug && variantId) {
    return `https://${storeSlug}.lemonsqueezy.com/checkout/buy/${encodeURIComponent(variantId)}`;
  }

  return null;
}

export function normalizePlanId(planId) {
  const id = String(planId || "").toLowerCase();
  if (id === "creator" || id === "studio" || id === "network") return id;
  if (id === "growth") return "studio";
  return null;
}

function variantForPlan(planId, env) {
  for (const alias of PLAN_ALIASES[planId]) {
    const value = env[`UPLOADCHECK_${alias}_VARIANT_ID`] || env[`LEMONSQUEEZY_${alias}_VARIANT_ID`];
    if (value) return value;
  }
  return null;
}
