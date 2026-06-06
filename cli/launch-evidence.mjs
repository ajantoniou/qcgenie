export const LAUNCH_PROOF_CONTRACT_VERSION = "2026-06-06.render-web-proof";

export function buildRemoteLaunchEvidence(payload = {}, options = {}) {
  const blockers = (payload.remainingBlockers || []).map((blocker) => blocker.id).filter(Boolean);
  const commands = Array.isArray(payload.launchDoctorCommands) ? payload.launchDoctorCommands : [];
  const phases = Array.isArray(payload.blockerFixPlan?.phases) ? payload.blockerFixPlan.phases : [];
  return {
    name: "UploadCheck.app Remote Launch Evidence",
    contractVersion: LAUNCH_PROOF_CONTRACT_VERSION,
    generatedAt: options.generatedAt || new Date().toISOString(),
    source: options.source || "https://api.uploadcheck.app/v1/launch-doctor",
    productHuntReady: Boolean(payload.productHuntReady),
    status: payload.productHuntReady && blockers.length === 0 ? "ready" : "blocked",
    blockers,
    redaction: {
      rawStdoutIncluded: false,
      rawStderrIncluded: false,
      protectedValues: ["API bearer tokens", "checkout URL paths", "Lemon Squeezy variant ids", "local temp paths"]
    },
    commandCoverage: commands.map((command) => redactLaunchText(command)),
    fixPhases: phases.map((phase) => ({
      id: phase.id,
      title: phase.title,
      blockers: phase.blockers || [],
      proofCommands: (phase.proof_commands || []).map((command) => redactLaunchText(command))
    })),
    completionRule: payload.blockerFixPlan?.completionRule || payload.rule || "Only launch when Product Hunt readiness is true and no blockers remain."
  };
}

export function redactLaunchText(value = "") {
  return String(value)
    .replace(/UPLOADCHECK_API_KEY=([^\s"']+)/g, "UPLOADCHECK_API_KEY=<private_bearer>")
    .replace(/(authorization:\s*bearer\s+)[^\s"']+/gi, "$1<private_bearer>")
    .replace(/(https:\/\/[^/\s"']+\/checkout\/buy\/)[A-Za-z0-9_-]+/g, "$1<variant_id>")
    .replace(/(https:\/\/[^/\s"']+)<checkout_path>/g, "$1<checkout_path>")
    .replace(/(https:\/\/[^/\s"']+)\/[^\s"']*(checkout|creator|studio|network)[^\s"']*/gi, (match, origin) => {
      if (match.includes("/checkout/buy/<variant_id>")) return match;
      return `${origin}<checkout_path>`;
    })
    .replace(/\/tmp\/uploadcheck[-/][^\s"']+/g, "/tmp/uploadcheck/<redacted>");
}
