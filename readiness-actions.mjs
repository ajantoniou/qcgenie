export function buildReadinessActions(report) {
  const checks = report?.checks || {};
  const actions = [];

  if (checks.checkout && !checks.checkout.ok) {
    const missingPlans = Object.entries(checks.checkout.plans || {})
      .filter(([, value]) => !value.configured)
      .map(([plan]) => plan);
    actions.push({
      id: "checkout",
      title: "Configure checkout URLs",
      detail: `Set checkout env for ${missingPlans.join(", ") || "all plans"}.`,
      env: [
        "UPLOADCHECK_CREATOR_CHECKOUT_URL",
        "UPLOADCHECK_STUDIO_CHECKOUT_URL",
        "UPLOADCHECK_NETWORK_CHECKOUT_URL",
        "or UPLOADCHECK_LEMONSQUEEZY_STORE_SLUG plus UPLOADCHECK_<PLAN>_VARIANT_ID"
      ]
    });
  }

  if (checks.customDomain && !checks.customDomain.ok) {
    actions.push({
      id: "custom-domain",
      title: "Finish custom-domain cutover",
      detail: `Current host is ${checks.customDomain.host || "unknown"}; expected api.uploadcheck.app or uploadcheck.app.`,
      env: [],
      docs: "docs/DEPLOYMENT-CUTOVER.md"
    });
  }

  if (checks.secretEncryption && !checks.secretEncryption.ok) {
    actions.push({
      id: "secret-encryption",
      title: "Set a strong webhook encryption key",
      detail: "Generate a key and set UPLOADCHECK_SECRET_ENCRYPTION_KEY on Render.",
      command: "npm run --silent secret:generate",
      env: ["UPLOADCHECK_SECRET_ENCRYPTION_KEY"]
    });
  }

  if (checks.persistence && !checks.persistence.ok) {
    actions.push({
      id: "persistence",
      title: "Move job persistence off temp storage",
      detail: "Attach a Render persistent disk or configure Supabase, then set the store path outside /tmp.",
      env: ["UPLOADCHECK_STORE_PATH=/mnt/uploadcheck-data/store.json", "or SUPABASE_URL plus SUPABASE_SERVICE_ROLE_KEY"]
    });
  }

  if (checks.storage && !checks.storage.ok) {
    actions.push({
      id: "storage",
      title: "Move signed-upload media off temp storage",
      detail: "Attach a Render persistent disk for uploaded media or configure object storage.",
      env: ["UPLOADCHECK_DURABLE_STORAGE_DIR=/mnt/uploadcheck-storage", "or UPLOADCHECK_STORAGE_BUCKET / UPLOADCHECK_S3_BUCKET / UPLOADCHECK_R2_BUCKET"]
    });
  }

  if (checks.demoClip && !checks.demoClip.ok) {
    actions.push({
      id: "demo-clip",
      title: "Publish the Product Hunt demo clip",
      detail: "Bundle public/demo/uploadcheck-product-hunt-demo.mp4 or set a public demo URL.",
      env: ["UPLOADCHECK_DEMO_CLIP_URL"]
    });
  }

  if (checks.apiAuth && !checks.apiAuth.ok) {
    actions.push({
      id: "api-auth",
      title: "Configure API auth",
      detail: "Set bearer API auth before public API use.",
      env: ["UPLOADCHECK_API_KEY", "or UPLOADCHECK_API_KEY_SHA256"]
    });
  }

  return actions;
}

export function formatReadinessSummary(report, actions = buildReadinessActions(report)) {
  const lines = [];
  lines.push(`UploadCheck readiness: ${report.readyForProductHunt ? "READY" : "NOT READY"}`);
  lines.push(`Generated: ${report.generatedAt || "unknown"}`);
  lines.push("");

  for (const [name, check] of Object.entries(report.checks || {})) {
    if (name === "productHunt") continue;
    lines.push(`${check.ok ? "PASS" : "BLOCK"} ${name}${check.mode ? ` (${check.mode})` : ""}`);
  }

  if (actions.length) {
    lines.push("");
    lines.push("Required actions:");
    for (const action of actions) {
      lines.push(`- ${action.title}: ${action.detail}`);
      if (action.command) lines.push(`  command: ${action.command}`);
      if (action.env?.length) lines.push(`  env: ${action.env.join(", ")}`);
      if (action.docs) lines.push(`  docs: ${action.docs}`);
    }
  }

  return lines.join("\n");
}
