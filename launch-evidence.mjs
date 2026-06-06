import { createHash } from "node:crypto";
import { runLaunchDoctor } from "./launch-doctor.mjs";

export function buildLaunchEvidence(options = {}) {
  const report = options.report || runLaunchDoctor(options);
  const generatedAt = options.generatedAt || new Date().toISOString();
  return {
    name: "UploadCheck.app Launch Evidence",
    generatedAt,
    ok: Boolean(report.ok),
    status: report.status || (report.ok ? "ready" : "blocked"),
    blockers: report.blockers || [],
    redaction: {
      rawStdoutIncluded: false,
      rawStderrIncluded: false,
      protectedValues: ["API bearer tokens", "checkout URL paths", "Lemon Squeezy variant ids", "local temp paths"]
    },
    results: (report.results || []).map((result) => summarizeResult(result)),
    completionRule: "Only launch when launch:doctor exits 0, launch:check passes, readiness:check reports READY, and hosted media ingress is proven with a private bearer token."
  };
}

export function buildRemoteLaunchEvidence(payload = {}, options = {}) {
  const blockers = (payload.remainingBlockers || []).map((blocker) => blocker.id).filter(Boolean);
  const commands = Array.isArray(payload.launchDoctorCommands) ? payload.launchDoctorCommands : [];
  const phases = Array.isArray(payload.blockerFixPlan?.phases) ? payload.blockerFixPlan.phases : [];
  return {
    name: "UploadCheck.app Remote Launch Evidence",
    generatedAt: options.generatedAt || new Date().toISOString(),
    source: options.source || "https://qcgenie-api.onrender.com/v1/launch-doctor",
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

export function formatLaunchEvidence(evidence) {
  const lines = [];
  lines.push(`UploadCheck launch evidence: ${evidence.ok ? "READY" : "NOT READY"}`);
  lines.push(`Generated: ${evidence.generatedAt}`);
  lines.push("");
  for (const result of evidence.results || []) {
    lines.push(`${result.ok ? "PASS" : "BLOCK"} ${result.id} - ${result.label}`);
    if (result.summary) lines.push(`  ${result.summary}`);
    lines.push(`  command: ${result.commandString}`);
  }
  if (evidence.blockers?.length) {
    lines.push("");
    lines.push(`Blockers: ${evidence.blockers.join(", ")}`);
  }
  lines.push("");
  lines.push(evidence.completionRule);
  return lines.join("\n");
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

function summarizeResult(result = {}) {
  const combinedOutput = [result.stdout, result.stderr].filter(Boolean).join("\n");
  return {
    id: result.id,
    label: result.label,
    ok: Boolean(result.ok),
    status: Number.isFinite(Number(result.status)) ? Number(result.status) : null,
    commandString: redactLaunchText(result.commandString || ""),
    summary: firstMeaningfulLine(redactLaunchText(combinedOutput)),
    outputSha256: combinedOutput ? sha256(redactLaunchText(combinedOutput)) : null
  };
}

function firstMeaningfulLine(output) {
  return String(output || "").split(/\r?\n/).map((line) => line.trim()).find(Boolean) || "";
}

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}
