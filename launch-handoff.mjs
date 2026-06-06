import { buildReadinessActions } from "./readiness-actions.mjs";
import { launchDoctorCommandStrings } from "./launch-doctor.mjs";

export function buildLaunchHandoff(report, {
  apiBaseUrl = "https://qcgenie-api.onrender.com",
  generatedAt = new Date().toISOString()
} = {}) {
  const checks = report?.checks || {};
  const actions = buildReadinessActions(report);
  const remainingBlockers = Object.entries(checks)
    .filter(([key, value]) => key !== "productHunt" && value && value.ok === false)
    .map(([key, value]) => ({
      id: key,
      mode: value.mode || null,
      reason: value.reason || null
    }));
  const blockerIds = remainingBlockers.map((blocker) => blocker.id);
  const blockerProofCommands = proofCommandsForBlockers(blockerIds);
  return {
    name: "UploadCheck.app Launch Handoff",
    generatedAt,
    source: `${apiBaseUrl.replace(/\/+$/, "")}/v1/readiness`,
    productHuntReady: Boolean(report?.readyForProductHunt),
    remainingBlockers,
    requiredActions: actions.map((action) => ({
      id: action.id,
      title: action.title,
      detail: action.detail,
      env: action.env || [],
      command: action.command || null,
        commands: action.commands || [],
        docs: action.docs || null
      })),
    blockerProofCommands,
    launchDoctorCommands: launchDoctorCommandStrings(),
    blockerFixPlan: buildBlockerFixPlan({
      actions,
      remainingBlockers,
      blockerProofCommands
    }),
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

function buildBlockerFixPlan({ actions, remainingBlockers, blockerProofCommands }) {
  const actionById = new Map(actions.map((action) => [action.id, action]));
  const proofById = new Map(blockerProofCommands.map((blocker) => [blocker.id, blocker.commands || []]));
  const blockers = remainingBlockers.map((blocker) => blocker.id);
  const phases = [];

  if (actionById.has("render-env-template")) {
    const action = actionById.get("render-env-template");
    phases.push({
      id: "prepare-render-env",
      title: "Prepare Render launch environment",
      blockers: blockers.filter((id) => ["checkout", "secretEncryption", "apiAuth", "persistence", "storage", "demoClip"].includes(id)),
      env: action.env || [],
      commands: action.commands || [],
      proof_commands: ["npm run render:validate-env-file -- /tmp/uploadcheck-render-launch.env", "npm run render:validate-env"],
      docs: action.docs || "docs/DEPLOYMENT-CUTOVER.md"
    });
  }

  addActionPhase(phases, actionById, proofById, {
    actionId: "checkout",
    phaseId: "configure-checkout",
    fallbackProof: ["npm run launch:checkout", "UPLOADCHECK_CHECKOUT_PROBE=1 npm run launch:checkout"]
  });
  addActionPhase(phases, actionById, proofById, {
    actionId: "persistence",
    phaseId: "configure-persistence",
    fallbackProof: ["npm run launch:storage", "UPLOADCHECK_STORAGE_PROBE=1 npm run launch:storage"]
  });
  addActionPhase(phases, actionById, proofById, {
    actionId: "storage",
    phaseId: "configure-upload-storage",
    fallbackProof: ["npm run launch:storage", "UPLOADCHECK_STORAGE_PROBE=1 npm run launch:storage"]
  });
  addActionPhase(phases, actionById, proofById, {
    actionId: "custom-domain",
    blockerId: "customDomain",
    phaseId: "cut-over-domains",
    fallbackProof: ["npm run launch:dns", "npm run launch:check"]
  });
  addActionPhase(phases, actionById, proofById, {
    actionId: "secret-encryption",
    blockerId: "secretEncryption",
    phaseId: "configure-secret-encryption",
    fallbackProof: ["npm run render:validate-env", "npm run readiness:check"]
  });
  addActionPhase(phases, actionById, proofById, {
    actionId: "api-auth",
    blockerId: "apiAuth",
    phaseId: "configure-api-auth",
    fallbackProof: ["npm run render:validate-env", "npm run readiness:check"]
  });
  addActionPhase(phases, actionById, proofById, {
    actionId: "demo-clip",
    blockerId: "demoClip",
    phaseId: "publish-demo-clip",
    fallbackProof: ["npm run launch-status:verify", "npm run readiness:check"]
  });

  phases.push({
    id: "final-launch-proof",
    title: "Prove Product Hunt readiness",
    blockers,
    env: [],
    commands: [
      "npm run launch:doctor",
      "npm run launch:check",
      "npm run readiness:check",
      "npm run launch:handoff"
    ],
    proof_commands: [
      "npm run launch:doctor",
      "npm run launch:check",
      "npm run readiness:check"
    ],
    docs: "docs/DEPLOYMENT-CUTOVER.md"
  });

  return {
    status: blockers.length ? "blocked" : "ready",
    blockers,
    phases: phases.filter((phase) => phase.id === "final-launch-proof" || phase.blockers.length || phase.commands.length || phase.env.length),
    completionRule: "Only launch when productHuntReady=true, remainingBlockers is empty, launch:doctor exits 0, launch:check passes, and readiness:check reports READY."
  };
}

function addActionPhase(phases, actionById, proofById, { actionId, blockerId = actionId, phaseId, fallbackProof }) {
  const action = actionById.get(actionId);
  if (!action) return;
  const commandList = [...(action.commands || [])];
  if (action.command) commandList.push(action.command);
  phases.push({
    id: phaseId,
    title: action.title,
    blockers: [blockerId],
    detail: action.detail,
    env: action.env || [],
    commands: commandList,
    proof_commands: proofById.get(blockerId) || fallbackProof,
    docs: action.docs || null
  });
}

function proofCommandsForBlockers(blockers) {
  const commands = {
    checkout: [
      "npm run launch:checkout",
      "UPLOADCHECK_CHECKOUT_PROBE=1 npm run launch:checkout"
    ],
    customDomain: [
      "npm run launch:dns",
      "npm run launch:check"
    ],
    secretEncryption: [
      "npm run render:validate-env",
      "npm run readiness:check"
    ],
    apiAuth: [
      "npm run render:validate-env",
      "npm run readiness:check"
    ],
    persistence: [
      "npm run launch:storage",
      "UPLOADCHECK_STORAGE_PROBE=1 npm run launch:storage"
    ],
    storage: [
      "npm run launch:storage",
      "UPLOADCHECK_STORAGE_PROBE=1 npm run launch:storage",
      "UPLOADCHECK_MEDIA_INGRESS_BASE_URL=https://qcgenie-api.onrender.com UPLOADCHECK_API_KEY=<private_bearer> npm run media-ingress:verify"
    ],
    demoClip: [
      "npm run launch-status:verify",
      "npm run readiness:check"
    ]
  };

  return blockers.map((id) => ({
    id,
    commands: commands[id] || ["npm run readiness:check"]
  }));
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
  if (handoff.blockerProofCommands.length) {
    lines.push("");
    lines.push("Proof commands after fixing blockers:");
    for (const blocker of handoff.blockerProofCommands) {
      lines.push(`- ${blocker.id}:`);
      for (const command of blocker.commands) lines.push(`    ${command}`);
    }
  }
  if (handoff.launchDoctorCommands?.length) {
    lines.push("");
    lines.push("Launch doctor commands:");
    for (const command of handoff.launchDoctorCommands) lines.push(`- ${command}`);
  }
  if (handoff.blockerFixPlan?.phases?.length) {
    lines.push("");
    lines.push("Fix plan:");
    for (const phase of handoff.blockerFixPlan.phases) {
      lines.push(`- ${phase.title}: ${phase.id}`);
      if (phase.env?.length) lines.push(`  env: ${phase.env.join(", ")}`);
      if (phase.proof_commands?.length) {
        lines.push("  proof:");
        for (const command of phase.proof_commands) lines.push(`    ${command}`);
      }
    }
  }
  lines.push("");
  lines.push(`Rule: ${handoff.rule}`);
  return lines.join("\n");
}
