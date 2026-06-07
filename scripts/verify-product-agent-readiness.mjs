#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const commands = [
  ["npm", ["run", "--silent", "saas-basics:verify"]],
  ["npm", ["run", "--silent", "private-mcp-beta:verify"]],
  ["npm", ["run", "--silent", "private-mcp-beta:evidence"]],
  ["npm", ["run", "--silent", "anthropic-directory:verify"]],
  ["npm", ["run", "--silent", "mcp-install:verify"]],
  ["npm", ["run", "--silent", "checkout-launch:verify"]],
  ["npm", ["run", "--silent", "packages:verify"]],
  ["npm", ["run", "--silent", "npm-publish:preflight"]]
];

const files = {
  beta: "docs/PRIVATE-MCP-BETA.md",
  directory: "docs/ANTHROPIC-DIRECTORY.md",
  publish: "PUBLISH-CHECKLIST.md",
  install: "public/agent-install/index.html",
  mcpInstall: "public/mcp-install.json",
  betaEvidence: "docs/private-mcp-beta-evidence-template.json",
  packageJson: "package.json",
  runGate: "scripts/qc-engine/run_gate.py",
  engineReference: "scripts/qc-engine/ENGINE-REFERENCE.md",
  pipelineIntegration: "docs/PIPELINE-INTEGRATION.md"
};

const errors = [];
const commandResults = [];

for (const [command, args] of commands) {
  try {
    const output = execFileSync(command, args, {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    });
    commandResults.push({ command: [command, ...args].join(" "), ok: true, output: firstJsonLine(output) });
  } catch (error) {
    commandResults.push({
      command: [command, ...args].join(" "),
      ok: false,
      stderr: String(error.stderr || error.message || "").trim()
    });
    errors.push({ reason: "command_failed", command: [command, ...args].join(" ") });
  }
}

const beta = read(files.beta);
const directory = read(files.directory);
const publish = read(files.publish);
const install = read(files.install);
const mcpInstall = JSON.parse(read(files.mcpInstall));
const betaEvidence = JSON.parse(read(files.betaEvidence));
const packageJson = JSON.parse(read(files.packageJson));
const runGate = read(files.runGate);
const engineReference = read(files.engineReference);
const pipelineIntegration = read(files.pipelineIntegration);

requireIncludes(files.beta, beta, [
  "UploadCheck is currently a public npm MCP install with public GitHub/local checkout fallback.",
  "External Claude Code, Codex, Cursor, and MCP clients must use a workspace API key",
  "Local NTO production can keep using the local repo path directly.",
  "Paid oracle checks such as `twins`, `omni_watch`, `gemini_watch`, `narration_match`, `cheap_broll`, and `garble` require explicit `--checks`.",
  "Do not submit Anthropic Directory or claim hosted production MCP completeness until:"
]);

requireIncludes(files.directory, directory, [
  "not an Anthropic Directory-ready public listing",
  "Defer OpenAI ChatGPT app/connector work until the hosted HTTPS MCP endpoint",
  "Registry proof that `@drantoniou/uploadcheck` and `@drantoniou/uploadcheck-mcp` are published"
]);

requireIncludes(files.publish, publish, [
  "`@drantoniou/uploadcheck-mcp` v0.1.0 — published on npm",
  "`@drantoniou/uploadcheck` v0.1.0 — published on npm",
  "npm run npm-publish:preflight",
  "registry install proof",
  "[YOU] Redeploy whatever serves `api.uploadcheck.app`"
]);

requireIncludes(files.install, install, [
  "Users need a workspace API key tied to included plan minutes.",
  "public GitHub clone",
  "npx -y @drantoniou/uploadcheck-mcp"
]);

if (mcpInstall.distribution_status !== "public_npm_mcp_ready") {
  errors.push({ file: files.mcpInstall, reason: "must_claim_public_npm_ready" });
}
if (mcpInstall.current_install !== "public_npm_or_github_checkout") {
  errors.push({ file: files.mcpInstall, reason: "current_install_must_include_npm_and_github" });
}
if (!String(mcpInstall.npm_install || mcpInstall.future_npm_install || "").includes("npx -y @drantoniou/uploadcheck-mcp")) {
  errors.push({ file: files.mcpInstall, reason: "missing_npm_install_command" });
}
if (mcpInstall.environment?.UPLOADCHECK_API_KEY !== "<workspace_api_key>") {
  errors.push({ file: files.mcpInstall, reason: "missing_workspace_api_key_placeholder" });
}

if (!packageJson.scripts?.["product-agent:verify"]) {
  errors.push({ file: files.packageJson, reason: "missing_product_agent_verify_script" });
}
if (!packageJson.scripts?.["npm-publish:preflight"]) {
  errors.push({ file: files.packageJson, reason: "missing_npm_publish_preflight_script" });
}

const paidOracleChecks = ["omni_watch", "gemini_watch", "narration_match", "cheap_broll", "garble"];
const defaultChecks = extractPythonStringList(runGate, "DEFAULT");
if (!defaultChecks.length) {
  errors.push({ file: files.runGate, reason: "missing_default_checks" });
}
for (const check of paidOracleChecks) {
  if (defaultChecks.includes(check)) {
    errors.push({ file: files.runGate, reason: "paid_oracle_in_default_checks", check });
  }
}
for (const deterministicCheck of ["loop_freeze", "repeat_fatigue", "text_contrast", "text_safe_area"]) {
  if (!defaultChecks.includes(deterministicCheck)) {
    errors.push({ file: files.runGate, reason: "missing_deterministic_default_check", check: deterministicCheck });
  }
}
requireIncludes(files.engineReference, engineReference, [
  "default `python3 run_gate.py VIDEO` path is deterministic/customer-safe and excludes paid oracle checks",
  "`--fast` does not mean deterministic-only. It must not be used as the guardrail against provider spend.",
  "`--deterministic-only` is the spend guardrail for local gate smoke tests and operator reruns",
  "paid_oracle_checks_removed"
]);
requireIncludes(files.pipelineIntegration, pipelineIntegration, [
  "the engine default is deterministic/customer-safe and excludes paid oracle checks",
  "Paid model-backed checks run only when explicitly requested"
]);
requireIncludes(files.beta, beta, [
  "Local gate smoke tests and operator reruns should use `--deterministic-only`",
  "paid_oracle_checks_removed"
]);
requireIncludes(files.runGate, runGate, [
  "PAID_ORACLE_CHECKS={",
  "ap.add_argument(\"--deterministic-only\",action=\"store_true\")",
  "\"paid_oracle_checks_requested\":removed_paid_oracles",
  "\"paid_oracle_checks_removed\":removed_paid_oracles if a.deterministic_only else []",
  "warning: --fast does not disable paid oracle checks"
]);

const forbiddenReadyClaims = [
  "public self-serve is ready",
  "OpenAI connector is the next step"
];
for (const [file, text] of Object.entries({ [files.beta]: beta, [files.directory]: directory, [files.install]: install })) {
  for (const claim of forbiddenReadyClaims) {
    if (text.includes(claim)) errors.push({ file, reason: "forbidden_ready_claim", claim });
  }
}

if (errors.length) {
  console.error(JSON.stringify({ ok: false, errors, commandResults }, null, 2));
  process.exit(1);
}

const requiredEvidenceClients = ["claude_code", "codex", "cursor"];
const evidenceCaptured = betaEvidence.status === "captured"
  && requiredEvidenceClients.every((client) => betaEvidence.client_proofs?.some((proof) => proof.client === client && proof.status === "captured"));
const npmProof = JSON.parse(execFileSync("npm", ["run", "--silent", "npm-publish:preflight"], {
  cwd: process.cwd(),
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"]
}));
const publicBlockers = [];
if (!npmProof.registryInstallProofReady) publicBlockers.push("registry install proof is not captured");
if (!evidenceCaptured) {
  publicBlockers.push("external public npm MCP evidence is not captured");
}

console.log(JSON.stringify({
  ok: true,
  verdict: publicBlockers.length ? "public_npm_mcp_ready_with_remaining_blockers" : "public_npm_mcp_ready",
  recommendedDistributionPath: [
    "Use npx -y @drantoniou/uploadcheck-mcp as the current public MCP install path.",
    "Keep public GitHub clone and local checkout installs as supported fallback paths.",
    evidenceCaptured
      ? "External Claude Code, Codex, and Cursor public npm MCP proof is captured."
      : "Collect external Claude Code, Codex, and Cursor public npm MCP proof with workspace API keys.",
    "Prepare Anthropic Directory after paid workspace proof; defer OpenAI connector/app."
  ],
  currentUsableModes: [
    "Local NTO production via local repo path.",
    "External Claude Code/Codex/Cursor installs via npx, public GitHub clone, or local checkout plus workspace API key."
  ],
  publicBlockers,
  commandResults
}, null, 2));

function read(path) {
  return readFileSync(resolve(path), "utf8");
}

function requireIncludes(file, text, markers) {
  for (const marker of markers) {
    if (!text.includes(marker)) errors.push({ file, reason: "missing_marker", marker });
  }
}

function extractPythonStringList(source, name) {
  const match = source.match(new RegExp(`${name}=\\[(.*?)\\]`, "s"));
  if (!match) return [];
  return Array.from(match[1].matchAll(/"([^"]+)"/g)).map((item) => item[1]);
}

function firstJsonLine(output) {
  const trimmed = output.trim();
  if (!trimmed) return "";
  const firstLine = trimmed.split("\n")[0];
  return firstLine.length > 200 ? `${firstLine.slice(0, 200)}...` : firstLine;
}
