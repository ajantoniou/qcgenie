#!/usr/bin/env node

const baseUrl = trimTrailingSlash(process.env.UPLOADCHECK_LIVE_LAUNCH_DOCTOR_BASE_URL || "https://api.uploadcheck.app");
const expectedContractVersion = "2026-06-06.render-web-proof";
const expectedHostedCommand = "UPLOADCHECK_MEDIA_INGRESS_BASE_URL=https://api.uploadcheck.app UPLOADCHECK_API_KEY=<private_bearer> npm run media-ingress:verify";
const expectedRenderWebCommand = "UPLOADCHECK_LIVE_WEB_BASE_URL=https://qcgenie-web.onrender.com npm run live-web-artifacts:verify";
const requiredLocalProofCommands = [
  "npm run saas-basics:verify",
  "npm run mcp-install:verify",
  "npm run private-mcp-beta:verify",
  "npm run anthropic-directory:verify",
  "npm run product-agent:verify"
];
const url = `${baseUrl}/v1/launch-doctor`;

try {
  const response = await fetch(url);
  const contentType = response.headers.get("content-type") || "";
  const text = await response.text();
  if (!response.ok) {
    fail(`UploadCheck live launch doctor: NOT READY\n${url} returned HTTP ${response.status}`);
  }
  if (!contentType.includes("application/json")) {
    fail(`UploadCheck live launch doctor: NOT READY\n${url} returned ${contentType || "unknown content type"} instead of application/json`);
  }

  let payload;
  try {
    payload = JSON.parse(text);
  } catch (error) {
    fail(`UploadCheck live launch doctor: NOT READY\n${url} returned invalid JSON: ${error.message}`);
  }

  const commands = payload.launchDoctorCommands || [];
  if (payload.name !== "UploadCheck.app Launch Doctor") {
    fail(`UploadCheck live launch doctor: NOT READY\nExpected name UploadCheck.app Launch Doctor, got ${JSON.stringify(payload.name)}`);
  }
  if (payload.contractVersion !== expectedContractVersion) {
    fail(`UploadCheck live launch doctor: NOT READY\nExpected contractVersion ${expectedContractVersion}, got ${JSON.stringify(payload.contractVersion)}.`);
  }
  if (!Array.isArray(commands) || !commands.includes(expectedHostedCommand)) {
    fail(`UploadCheck live launch doctor: NOT READY\nMissing hosted media-ingress command in launchDoctorCommands.`);
  }
  if (!Array.isArray(commands) || !commands.includes(expectedRenderWebCommand)) {
    fail(`UploadCheck live launch doctor: NOT READY\nMissing Render static web-artifacts command in launchDoctorCommands.`);
  }
  const missingProofCommands = requiredLocalProofCommands.filter((command) => !commands.includes(command));
  if (missingProofCommands.length) {
    fail(`UploadCheck live launch doctor: NOT READY\nMissing SaaS/MCP/Directory proof commands in launchDoctorCommands: ${missingProofCommands.join(", ")}`);
  }
  if (!payload.blockerFixPlan || !Array.isArray(payload.blockerFixPlan.phases)) {
    fail(`UploadCheck live launch doctor: NOT READY\nMissing blockerFixPlan.phases.`);
  }

  console.log(JSON.stringify({
    ok: true,
    url,
    name: payload.name,
    contractVersion: payload.contractVersion,
    productHuntReady: Boolean(payload.productHuntReady),
    remainingBlockers: (payload.remainingBlockers || []).map((blocker) => blocker.id).filter(Boolean),
    launchDoctorCommandCount: commands.length,
    hostedMediaIngressCommandPresent: true,
    renderWebArtifactsCommandPresent: true,
    requiredLocalProofCommandsPresent: true
  }, null, 2));
} catch (error) {
  fail(`UploadCheck live launch doctor: NOT READY\n${error.message}`);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function trimTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}
