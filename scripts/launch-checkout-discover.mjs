#!/usr/bin/env node

const PLAN_TARGETS = [
  { plan: "creator", envKey: "UPLOADCHECK_CREATOR_VARIANT_ID", label: "Creator", priceCents: 9900 },
  { plan: "studio", envKey: "UPLOADCHECK_STUDIO_VARIANT_ID", label: "Studio", priceCents: 29900 },
  { plan: "network", envKey: "UPLOADCHECK_NETWORK_VARIANT_ID", label: "Network", priceCents: 79900 }
];

const apiKey = process.env.LEMONSQUEEZY_API_KEY || process.env.LEMON_SQUEEZY_API_KEY || "";
const storeId = process.env.UPLOADCHECK_LEMONSQUEEZY_STORE_ID || process.env.LEMONSQUEEZY_STORE_ID || "";
const storeSlug = process.env.UPLOADCHECK_LEMONSQUEEZY_STORE_SLUG || process.env.LEMONSQUEEZY_STORE_SLUG || slugFromStoreUrl(process.env.UPLOADCHECK_LEMONSQUEEZY_STORE_URL || process.env.LEMONSQUEEZY_STORE_URL || "");

if (!apiKey || !storeId) {
  console.error("UploadCheck checkout discovery: NOT READY");
  console.error("Set LEMONSQUEEZY_API_KEY and LEMONSQUEEZY_STORE_ID locally before discovery.");
  process.exit(2);
}

try {
  const products = await lemonFetch(`/v1/products?filter[store_id]=${encodeURIComponent(storeId)}&page[size]=100`);
  const productSummaries = [];
  const candidates = [];

  for (const product of products.data || []) {
    const productAttrs = product.attributes || {};
    const variants = await lemonFetch(`/v1/variants?filter[product_id]=${encodeURIComponent(product.id)}&page[size]=100`);
    const normalizedProductName = normalizeText(productAttrs.name);
    const variantSummaries = [];
    for (const variant of variants.data || []) {
      const attrs = variant.attributes || {};
      const summary = {
        id: String(variant.id),
        name: attrs.name || "",
        status: attrs.status || "",
        priceCents: Number(attrs.price || 0),
        isSubscription: Boolean(attrs.is_subscription),
        interval: attrs.interval || null,
        intervalCount: Number(attrs.interval_count || 0) || null
      };
      variantSummaries.push({ ...summary, id: redactVariantId(summary.id) });
      if (normalizedProductName.includes("uploadcheck")) {
        candidates.push({
          productId: String(product.id),
          productName: productAttrs.name || "",
          ...summary
        });
      }
    }
    productSummaries.push({
      id: String(product.id),
      name: productAttrs.name || "",
      status: productAttrs.status || "",
      uploadcheckCandidate: normalizedProductName.includes("uploadcheck"),
      variants: variantSummaries
    });
  }

  const matchedPlans = matchPlans(candidates);
  const missingPlans = PLAN_TARGETS.filter((target) => !matchedPlans[target.plan]);
  const ok = missingPlans.length === 0 && Boolean(storeSlug);
  const env = ok
    ? {
        UPLOADCHECK_LEMONSQUEEZY_STORE_SLUG: storeSlug,
        UPLOADCHECK_CREATOR_VARIANT_ID: matchedPlans.creator.id,
        UPLOADCHECK_STUDIO_VARIANT_ID: matchedPlans.studio.id,
        UPLOADCHECK_NETWORK_VARIANT_ID: matchedPlans.network.id
      }
    : {};

  console.log(JSON.stringify({
    ok,
    storeId,
    storeSlugPresent: Boolean(storeSlug),
    expectedPlans: PLAN_TARGETS.map(({ plan, label, priceCents }) => ({ plan, label, priceCents, interval: "month" })),
    matchedPlans: Object.fromEntries(Object.entries(matchedPlans).map(([plan, variant]) => [plan, {
      productName: variant.productName,
      variantId: redactVariantId(variant.id),
      name: variant.name,
      priceCents: variant.priceCents,
      status: variant.status,
      isSubscription: variant.isSubscription,
      interval: variant.interval,
      envKey: PLAN_TARGETS.find((target) => target.plan === plan)?.envKey
    }])),
    missingPlans: missingPlans.map(({ plan, label, priceCents, envKey }) => ({ plan, label, priceCents, envKey })),
    productInventory: productSummaries.map((product) => ({
      id: product.id,
      name: product.name,
      status: product.status,
      uploadcheckCandidate: product.uploadcheckCandidate,
      variantCount: product.variants.length
    })),
    envTemplate: ok ? redactEnv(env) : null,
    nextActions: ok
      ? [
          "Source the unredacted variant env locally, then run npm run render:validate-env.",
          "Run UPLOADCHECK_CHECKOUT_PROBE=1 npm run launch:checkout.",
          "Run npm run render:apply to sync checkout env to Render."
        ]
      : [
          "Create an UploadCheck product in Lemon Squeezy with monthly published subscription variants: Creator $99, Studio $299, Network $799.",
          "Set UPLOADCHECK_LEMONSQUEEZY_STORE_SLUG or LEMONSQUEEZY_STORE_URL locally.",
          "Rerun npm run launch:checkout-discover."
        ]
  }, null, 2));

  process.exit(ok ? 0 : 1);
} catch (error) {
  console.error("UploadCheck checkout discovery: NOT READY");
  console.error(error instanceof Error ? error.message : "Unknown Lemon Squeezy discovery error.");
  process.exit(1);
}

async function lemonFetch(path) {
  const response = await fetch(`https://api.lemonsqueezy.com${path}`, {
    headers: {
      accept: "application/vnd.api+json",
      "content-type": "application/vnd.api+json",
      authorization: `Bearer ${apiKey}`
    }
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Lemon Squeezy ${path} returned HTTP ${response.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : {};
}

function matchPlans(candidates) {
  const matched = {};
  for (const target of PLAN_TARGETS) {
    const label = normalizeText(target.label);
    const match = candidates.find((candidate) => {
      const name = normalizeText(candidate.name);
      return candidate.status === "published" &&
        candidate.isSubscription === true &&
        candidate.interval === "month" &&
        Number(candidate.priceCents) === target.priceCents &&
        (name.includes(label) || normalizeText(candidate.productName).includes(label));
    });
    if (match) matched[target.plan] = match;
  }
  return matched;
}

function normalizeText(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function slugFromStoreUrl(value) {
  if (!value) return "";
  try {
    const parsed = new URL(value);
    const [slug] = parsed.hostname.split(".");
    return parsed.hostname.endsWith(".lemonsqueezy.com") ? slug : "";
  } catch {
    return "";
  }
}

function redactVariantId(value) {
  const text = String(value || "");
  if (text.length <= 4) return "<variant_id>";
  return `${text.slice(0, 2)}...${text.slice(-2)}`;
}

function redactEnv(env) {
  return Object.fromEntries(Object.entries(env).map(([key, value]) => [
    key,
    key.endsWith("_VARIANT_ID") ? redactVariantId(value) : value
  ]));
}
