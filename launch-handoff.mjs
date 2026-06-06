import { buildReadinessActions } from "./readiness-actions.mjs";

export function buildLaunchHandoff(report, {
  apiBaseUrl = "https://qcgenie-api.onrender.com",
  generatedAt = new Date().toISOString()
} = {}) {
  const checks = report?.checks || {};
  const actions = buildReadinessActions(report);
  return {
    name: "UploadCheck.app Launch Handoff",
    generatedAt,
    source: `${apiBaseUrl.replace(/\/+$/, "")}/v1/readiness`,
    productHuntReady: Boolean(report?.readyForProductHunt),
    remainingBlockers: Object.entries(checks)
      .filter(([key, value]) => key !== "productHunt" && value && value.ok === false)
      .map(([key, value]) => ({
        id: key,
        mode: value.mode || null,
        reason: value.reason || null
      })),
    requiredActions: actions.map((action) => ({
      id: action.id,
      title: action.title,
      detail: action.detail,
      env: action.env || [],
      command: action.command || null,
      commands: action.commands || [],
      docs: action.docs || null
    })),
    operatorCommandSequence: [
      "npm run --silent render:bootstrap-env > /tmp/uploadcheck-render-launch.env",
      "npm run render:validate-env-file -- /tmp/uploadcheck-render-launch.env",
      "set -a; source /tmp/uploadcheck-render-launch.env; set +a",
      "npm run render:plan && npm run render:validate-env && npm run render:apply",
      "npm run launch:doctor",
      "UPLOADCHECK_CHECKOUT_PROBE=1 npm run launch:checkout",
      "UPLOADCHECK_STORAGE_PROBE=1 npm run launch:storage",
      "UPLOADCHECK_MEDIA_INGRESS_BASE_URL=https://qcgenie-api.onrender.com UPLOADCHECK_API_KEY=<private_bearer> npm run media-ingress:verify",
      "npm run launch:check",
      "npm run readiness:check"
    ],
    docs: "docs/DEPLOYMENT-CUTOVER.md",
    rule: "Do not launch on Product Hunt until productHuntReady is true, remainingBlockers is empty, launch:doctor exits 0, and launch:check passes DNS/HTTP."
  };
}

export function formatLaunchHandoff(handoff) {
  const lines = [];
  lines.push(`UploadCheck launch handoff: ${handoff.productHuntReady ? "READY" : "NOT READY"}`);
  lines.push(`Source: ${handoff.source}`);
  lines.push(`Generated: ${handoff.generatedAt}`);
  lines.push("");
  if (handoff.remainingBlockers.length) {
    lines.push(`Blockers: ${handoff.remainingBlockers.map((blocker) => blocker.id).join(", ")}`);
  } else {
    lines.push("Blockers: none");
  }
  if (handoff.requiredActions.length) {
    lines.push("");
    lines.push("Required actions:");
    for (const action of handoff.requiredActions) {
      lines.push(`- ${action.title}: ${action.detail}`);
      if (action.command) lines.push(`  command: ${action.command}`);
      if (action.commands.length) {
        lines.push("  commands:");
        for (const command of action.commands) lines.push(`    ${command}`);
      }
      if (action.env.length) lines.push(`  env: ${action.env.join(", ")}`);
      if (action.docs) lines.push(`  docs: ${action.docs}`);
    }
  }
  lines.push("");
  lines.push(`Rule: ${handoff.rule}`);
  return lines.join("\n");
}
