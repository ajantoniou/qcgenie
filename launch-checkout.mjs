import { CHECKOUT_PLANS, resolveCheckout } from "./checkout-links.mjs";

export function buildCheckoutSummary(env = process.env) {
  const probeEnabled = false;
  const plans = CHECKOUT_PLANS.map((plan) => {
    const base = buildCheckoutPlan(plan, env);
    const { url, ...publicPlan } = base;
    return {
      ...publicPlan,
      probe: {
        checked: false,
        ok: probeEnabled ? null : undefined,
        status: null,
        reason: probeEnabled ? "not_checked" : "probe_disabled"
      }
    };
  });
  return {
    ok: plans.every((plan) => plan.ok),
    probeEnabled,
    plans
  };
}

export async function buildCheckoutSummaryAsync(env = process.env, options = {}) {
  const probeEnabled = checkoutProbeEnabled(env, options);
  const plans = [];
  for (const plan of CHECKOUT_PLANS) {
    const base = buildCheckoutPlan(plan, env);
    const probe = probeEnabled && base.configured && base.secure
      ? await probeCheckoutUrl(base.url, options)
      : {
          checked: false,
          ok: probeEnabled ? null : undefined,
          status: null,
          reason: probeEnabled ? "not_checked" : "probe_disabled"
        };
    const { url, ...publicPlan } = base;
    plans.push({
      ...publicPlan,
      ok: base.ok && (!probeEnabled || probe.ok === true),
      reason: base.ok && probeEnabled && probe.ok === false ? probe.reason : base.reason,
      probe
    });
  }
  return {
    ok: plans.every((plan) => plan.ok),
    probeEnabled,
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
      if (summary.probeEnabled) lines.push(`  probe: ${formatProbe(plan.probe)}`);
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

export async function probeCheckoutUrl(url, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    return { checked: true, ok: false, status: null, reason: "checkout_probe_fetch_unavailable" };
  }
  const timeoutMs = Math.max(1, Number(options.timeoutMs || 8000));
  const signal = options.signal || (AbortSignal.timeout ? AbortSignal.timeout(timeoutMs) : undefined);
  try {
    const head = await fetchImpl(url, {
      method: "HEAD",
      redirect: "manual",
      signal
    });
    if (head.status === 405 || head.status === 403) {
      const get = await fetchImpl(url, {
        method: "GET",
        redirect: "manual",
        signal
      });
      return probeResultForStatus(get.status);
    }
    return probeResultForStatus(head.status);
  } catch (error) {
    return {
      checked: true,
      ok: false,
      status: null,
      reason: "checkout_probe_failed",
      errorClass: error?.name || "Error"
    };
  }
}

function buildCheckoutPlan(plan, env) {
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
    redactedUrl: redactCheckoutUrl(resolved.url),
    url: resolved.url || null
  };
}

function checkoutProbeEnabled(env, options) {
  return options.probeCheckout === true || String(env.UPLOADCHECK_CHECKOUT_PROBE || "") === "1";
}

function probeResultForStatus(status) {
  const numeric = Number(status || 0);
  const ok = numeric >= 200 && numeric < 400;
  return {
    checked: true,
    ok,
    status: numeric || null,
    reason: ok ? "checkout_probe_passed" : `checkout_probe_http_${numeric || "unknown"}`
  };
}

function formatProbe(probe = {}) {
  if (!probe.checked) return "not_checked";
  if (probe.ok) return `pass${probe.status ? ` (${probe.status})` : ""}`;
  return `fail (${probe.reason || "checkout_probe_failed"})`;
}

function checkoutReason(resolved, secure) {
  if (!resolved.configured) return "missing";
  if (!hostForUrl(resolved.url)) return "invalid_url";
  if (!secure) return "checkout_url_must_be_https";
  return "ready";
}
