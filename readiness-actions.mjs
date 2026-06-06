export function buildReadinessActions(report) {
  const checks = report?.checks || {};
  const actions = [];
  const renderConfigBlockers = ["checkout", "secretEncryption", "apiAuth", "persistence", "storage", "demoClip"]
    .filter((key) => checks[key] && !checks[key].ok);

  if (renderConfigBlockers.length) {
    actions.push({
      id: "render-env-template",
      title: "Prepare Render launch env",
      detail: `Generate and fill the local env template for ${renderConfigBlockers.join(", ")} before render:apply.`,
      commands: [
        "npm run --silent render:bootstrap-env > /tmp/uploadcheck-render-launch.env",
        "npm run render:validate-env-file -- /tmp/uploadcheck-render-launch.env",
        "set -a; source /tmp/uploadcheck-render-launch.env; set +a",
        "npm run render:plan && npm run render:validate-env && npm run render:apply",
        "UPLOADCHECK_CHECKOUT_PROBE=1 npm run launch:checkout",
        "UPLOADCHECK_STORAGE_PROBE=1 npm run launch:storage"
      ],
      docs: "docs/DEPLOYMENT-CUTOVER.md"
    });
  }

  if (checks.checkout && !checks.checkout.ok) {
    const missingPlans = Object.entries(checks.checkout.plans || {})
      .filter(([, value]) => !value.configured)
      .map(([plan]) => plan);
    actions.push({
      id: "checkout",
      title: "Configure checkout URLs",
      detail: `Set HTTPS checkout env for ${missingPlans.join(", ") || "all plans"}, or use Lemon Squeezy store slug plus plan variant IDs.`,
      env: [
        "UPLOADCHECK_CREATOR_CHECKOUT_URL",
        "UPLOADCHECK_STUDIO_CHECKOUT_URL",
        "UPLOADCHECK_NETWORK_CHECKOUT_URL",
        "or UPLOADCHECK_LEMONSQUEEZY_STORE_SLUG plus UPLOADCHECK_<PLAN>_VARIANT_ID"
      ],
      command: "UPLOADCHECK_CHECKOUT_PROBE=1 npm run launch:checkout"
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
      detail: "Use render:bootstrap-env to prefill UPLOADCHECK_SECRET_ENCRYPTION_KEY, or generate a standalone key and set it on Render.",
      command: "npm run --silent render:bootstrap-env",
      env: ["UPLOADCHECK_SECRET_ENCRYPTION_KEY"]
    });
  }

  if (checks.persistence && !checks.persistence.ok) {
    actions.push({
      id: "persistence",
      title: "Move job persistence off temp storage",
      detail: "Attach a Render persistent disk, then set the store path outside /tmp. Supabase env alone is not launch-ready until the server store adapter ships.",
      env: ["UPLOADCHECK_STORE_PATH=/mnt/uploadcheck/store.json"]
    });
  }

  if (checks.storage && !checks.storage.ok) {
    const objectStorage = checks.storage.objectStorage || {};
    const missingObjectStorageEnv = [];
    if (!objectStorage.bucketConfigured) missingObjectStorageEnv.push("UPLOADCHECK_STORAGE_BUCKET");
    if (!objectStorage.endpointConfigured) missingObjectStorageEnv.push("UPLOADCHECK_STORAGE_ENDPOINT");
    if (!objectStorage.accessKeyConfigured) missingObjectStorageEnv.push("UPLOADCHECK_STORAGE_ACCESS_KEY_ID");
    if (!objectStorage.secretKeyConfigured) missingObjectStorageEnv.push("UPLOADCHECK_STORAGE_SECRET_ACCESS_KEY");
    actions.push({
      id: "storage",
      title: "Move signed-upload media off temp storage",
      detail: "Attach a Render persistent disk for uploaded media or configure complete S3/R2-compatible object storage.",
      env: [
        "UPLOADCHECK_DURABLE_STORAGE_DIR=/mnt/uploadcheck/uploads",
        `or ${missingObjectStorageEnv.length ? missingObjectStorageEnv.join(" + ") : "UPLOADCHECK_STORAGE_BUCKET + UPLOADCHECK_STORAGE_ENDPOINT + UPLOADCHECK_STORAGE_ACCESS_KEY_ID + UPLOADCHECK_STORAGE_SECRET_ACCESS_KEY"}`
      ],
      command: "UPLOADCHECK_STORAGE_PROBE=1 npm run launch:storage"
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
      detail: "Generate an UploadCheck bearer key and set the SHA-256 hash on Render before public API use.",
      command: "npm run --silent api-key:generate",
      env: ["UPLOADCHECK_API_KEY_SHA256", "or UPLOADCHECK_API_KEY for bootstrapping only"]
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
      if (action.commands?.length) {
        lines.push("  commands:");
        for (const command of action.commands) lines.push(`    ${command}`);
      }
      if (action.env?.length) lines.push(`  env: ${action.env.join(", ")}`);
      if (action.docs) lines.push(`  docs: ${action.docs}`);
    }
  }

  return lines.join("\n");
}
