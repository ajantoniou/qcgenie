import { CHECKOUT_PLANS, resolveCheckout } from "./checkout-links.mjs";

export function buildCheckoutSummary(env = process.env) {
  const plans = CHECKOUT_PLANS.map((plan) => {
    const resolved = resolveCheckout(plan, env);
    return {
      plan,
      configured: resolved.configured,
      source: resolved.source,
      sourceKey: resolved.sourceKey,
      host: hostForUrl(resolved.url),
      redactedUrl: redactCheckoutUrl(resolved.url)
    };
  });
  return {
    ok: plans.every((plan) => plan.configured && plan.host),
    plans
  };
}

export function formatCheckoutSummary(summary = buildCheckoutSummary()) {
  const lines = [];
  lines.push(`UploadCheck checkout config: ${summary.ok ? "READY" : "NOT READY"}`);
  lines.push("");
  for (const plan of summary.plans) {
    lines.push(`${plan.configured ? "PASS" : "BLOCK"} ${plan.plan}`);
    if (plan.configured) {
      lines.push(`  source: ${plan.source}${plan.sourceKey ? ` (${plan.sourceKey})` : ""}`);
      lines.push(`  host: ${plan.host || "invalid_url"}`);
      lines.push(`  url: ${plan.redactedUrl || "invalid_url"}`);
    } else {
      lines.push("  env: UPLOADCHECK_<PLAN>_CHECKOUT_URL or UPLOADCHECK_LEMONSQUEEZY_STORE_SLUG plus UPLOADCHECK_<PLAN>_VARIANT_ID");
    }
  }
  return lines.join("\n");
}

export function hostForUrl(url) {
  try {
    return new URL(String(url)).host;
  } catch {
    return null;
  }
}

export function redactCheckoutUrl(url) {
  if (!url) return null;
  try {
    const parsed = new URL(String(url));
    if (parsed.hostname.endsWith(".lemonsqueezy.com") && parsed.pathname.startsWith("/checkout/buy/")) {
      return `${parsed.origin}/checkout/buy/<variant_id>`;
    }
    return `${parsed.origin}<checkout_path>`;
  } catch {
    return null;
  }
}
