#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const files = {
  beta: "docs/PRIVATE-MCP-BETA.md",
  directory: "docs/ANTHROPIC-DIRECTORY.md",
  installPage: "public/agent-install/index.html",
  apiPage: "public/agentic-media-qc-api/index.html",
  mcpInstall: "mcp-server/mcp-install.json",
  betaEvidence: "docs/private-mcp-beta-evidence-template.json",
  packageJson: "package.json",
  pipeline: "docs/PIPELINE-INTEGRATION.md",
  roadmap: "docs/PRODUCT-ROADMAP.md"
};

const beta = read(files.beta);
const directory = read(files.directory);
const installPage = read(files.installPage);
const apiPage = read(files.apiPage);
const mcpInstall = JSON.parse(read(files.mcpInstall));
const betaEvidence = JSON.parse(read(files.betaEvidence));
const packageJson = JSON.parse(read(files.packageJson));
const pipeline = read(files.pipeline);
const roadmap = read(files.roadmap);

const errors = [];

requireIncludes(files.beta, beta, [
  "UploadCheck is currently a private MCP beta.",
  "External Claude Code, Codex, Cursor, and MCP clients must use a workspace API key",
  "plan minutes, top-up credits, or an operator-created beta account",
  "Local NTO production can keep using the local repo path directly.",
  "Customer-facing MCP/API runs use deterministic publish-readiness QC minutes.",
  "`--fast` is not a spend guardrail.",
  "Paid oracle checks such as `twins`, `omni_watch`, `gemini_watch`, `narration_match`, `cheap_broll`, and `garble` require explicit `--checks`.",
  "Workspace API keys are returned once, stored hashed, scoped, and honored on job creation",
  "Abuse events must be visible through the dashboard or `GET /v1/abuse-events`.",
  "Owner spend alerts must record, email through Resend, and remain reviewable",
  "Use `docs/private-mcp-beta-evidence-template.json` to capture proof for Claude Code, Codex, and Cursor.",
  "Run `npm run private-mcp-beta:evidence` before treating the proof contract as valid.",
  "Do not publish broad install copy or submit Anthropic Directory until:"
]);

requireIncludes(files.directory, directory, [
  "UploadCheck is currently a private MCP beta, not an Anthropic Directory-ready public listing.",
  "Beta handoff: `docs/PRIVATE-MCP-BETA.md`",
  "Verifier: `npm run anthropic-directory:verify`"
]);

requireIncludes(files.installPage, installPage, [
  "Private beta users need a workspace API key tied to plan minutes or beta credits.",
  "Do not use <code>npx -y @uploadcheck/mcp</code> until the npm package exists",
  "private clone or local checkout",
  "/mcp-install.json"
]);

requireIncludes(files.apiPage, apiPage, [
  "UploadCheck is a private MCP beta.",
  "Authorization: Bearer &lt;workspace_api_key&gt;",
  "Workspace keys are tied to plan minutes, top-up credits, or an operator-created beta account.",
  "curl https://api.uploadcheck.app/v1/qc/jobs",
  "Checked minutes are deterministic publish-readiness QC minutes."
]);

requireIncludes(files.pipeline, pipeline, [
  "the engine default is deterministic/customer-safe and excludes paid oracle checks",
  "Paid model-backed checks run only when explicitly requested"
]);

if (mcpInstall.package !== "@uploadcheck/mcp") {
  errors.push({ file: files.mcpInstall, reason: "wrong_package", expected: "@uploadcheck/mcp", actual: mcpInstall.package });
}
if (!mcpInstall.codex_local?.toml?.includes('UPLOADCHECK_API_KEY = "<workspace_api_key>"')) {
  errors.push({ file: files.mcpInstall, reason: "codex_missing_workspace_api_key_placeholder" });
}
for (const client of ["claude_desktop", "cursor"]) {
  const server = mcpInstall[client]?.json?.mcpServers?.uploadcheck;
  if (!server) {
    errors.push({ file: files.mcpInstall, reason: `missing_${client}_server` });
    continue;
  }
  if (server.env?.UPLOADCHECK_API_KEY !== "<workspace_api_key>") {
    errors.push({ file: files.mcpInstall, reason: `${client}_missing_workspace_api_key_placeholder` });
  }
}

for (const script of [
  "packages:verify",
  "packages:install-smoke",
  "npm-publish:preflight",
  "saas-basics:verify",
  "private-mcp-beta:evidence",
  "codex:verify-install",
  "anthropic-directory:verify",
  "mcp-install:verify",
  "readiness:check"
]) {
  if (!packageJson.scripts?.[script]) errors.push({ file: files.packageJson, reason: "missing_script", script });
}

for (const client of ["claude_code", "codex", "cursor"]) {
  if (!betaEvidence.required_clients?.includes(client)) {
    errors.push({ file: files.betaEvidence, reason: "missing_required_client", client });
  }
  if (!betaEvidence.client_proofs?.some((proof) => proof.client === client)) {
    errors.push({ file: files.betaEvidence, reason: "missing_client_proof", client });
  }
}
for (const tool of ["gemini_watch", "omni_watch", "qwen", "anthropic_fallback_oracle", "deep_ai_review"]) {
  if (!betaEvidence.forbidden_customer_tools?.includes(tool)) {
    errors.push({ file: files.betaEvidence, reason: "missing_forbidden_customer_tool", tool });
  }
  if (betaEvidence.allowed_tools?.includes(tool)) {
    errors.push({ file: files.betaEvidence, reason: "forbidden_customer_tool_allowed", tool });
  }
}

requireIncludes(files.roadmap, roadmap, [
  "private MCP beta handoff added at `docs/PRIVATE-MCP-BETA.md`",
  "Anthropic Directory draft artifact added at `docs/anthropic-directory-draft.json`",
  "external Claude Code, Codex, Cursor, and MCP usage must be tied to created workspace API keys"
]);

const forbiddenPublicClaims = [
  "UploadCheck is public self-serve for all MCP users",
  "Anthropic Directory-ready public listing",
  "Use npx -y @uploadcheck/mcp today",
  "unlimited full-video AI review"
];
for (const claim of forbiddenPublicClaims) {
  if (beta.includes(claim) || installPage.includes(claim) || apiPage.includes(claim)) {
    errors.push({ reason: "forbidden_public_claim", claim });
  }
}

if (errors.length) {
  console.error(JSON.stringify({ ok: false, errors }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  status: "private_mcp_beta_ready_for_operator_handoff_not_public_self_serve",
  handoff: files.beta,
  requiredRuntimeProof: [
    "npm run packages:verify",
    "npm run packages:install-smoke",
    "npm run npm-publish:preflight",
    "npm run saas-basics:verify",
    "npm run private-mcp-beta:evidence",
    "npm run codex:verify-install",
    "npm run anthropic-directory:verify",
    "npm run mcp-install:verify",
    "npm run readiness:check"
  ],
  remainingExternalLaunchBlockers: [
    "hosted artifact redeploy proving /mcp-install.json and launch evidence are current",
    "npm publish and registry install proof",
    "external Claude/Codex/Cursor beta evidence with workspace API keys"
  ]
}, null, 2));

function read(path) {
  return readFileSync(resolve(path), "utf8");
}

function requireIncludes(file, text, markers) {
  for (const marker of markers) {
    if (!text.includes(marker)) errors.push({ file, reason: "missing_marker", marker });
  }
}
