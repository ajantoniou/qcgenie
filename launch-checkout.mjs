import { CHECKOUT_PLANS, resolveCheckout } from "./checkout-links.mjs";

export function buildCheckoutSummary(env = process.env) {
  const plans = CHECKOUT_PLANS.map((plan) => {
    const resolved = resolveCheckout(plan, env);
    const secure = isSecureCheckoutUrl(resolved.url);
    return {
      plan,
      ok: resolved.configured && secure,
      configured: resolved.configured,
      secure,
      reason: checkoutReason(resolved, secure),
      source: resolved.source,
      sourceKey: resolved.sourceKey,
      host: hostForUrl(resolved.url),
      redactedUrl: redactCheckoutUrl(resolved.url)
    };
  });
  return {
    ok: plans.every((plan) => plan.ok),
    plans
  };
}

export function formatCheckoutSummary(summary = buildCheckoutSummary()) {
  const lines = [];
  lines.push(`UploadCheck checkout config: ${summary.ok ? "READY" : "NOT READY"}`);
  lines.push("");
  for (const plan of summary.plans) {
    lines.push(`${plan.ok ? "PASS" : "BLOCK"} ${plan.plan}`);
    if (plan.configured) {
      lines.push(`  source: ${plan.source}${plan.sourceKey ? ` (${plan.sourceKey})` : ""}`);
      lines.push(`  host: ${plan.host || "invalid_url"}`);
      lines.push(`  url: ${plan.redactedUrl || "invalid_url"}`);
      if (!plan.ok) lines.push(`  reason: ${plan.reason}`);
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

export function isSecureCheckoutUrl(url) {
  try {
    const parsed = new URL(String(url));
    return parsed.protocol === "https:" && Boolean(parsed.host);
  } catch {
    return false;
  }
}

function checkoutReason(resolved, secure) {
  if (!resolved.configured) return "missing";
  if (!hostForUrl(resolved.url)) return "invalid_url";
  if (!secure) return "checkout_url_must_be_https";
  return "ready";
}
