#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildReadinessReport } from "../readiness.mjs";

function readJson(path) {
  return JSON.parse(readFileSync(resolve(path), "utf8"));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const status = readJson("public/launch-status.json");
const manifest = readJson("public/agent-manifest.json");
const openapi = readJson("public/openapi.json");
const llms = readFileSync(resolve("public/llms.txt"), "utf8");

const representativeReadiness = buildReadinessReport({
  host: "qcgenie-api.onrender.com",
  env: {
    UPLOADCHECK_API_KEY_SHA256: "a".repeat(64),
    UPLOADCHECK_BUNDLED_DEMO_CLIP_PATH: "public/demo/uploadcheck-product-hunt-demo.mp4"
  },
  now: "2026-06-06T00:00:00.000Z"
});

const expectedStatus = {
  api: representativeReadiness.checks.api.ok ? "pass" : "blocked",
  agent_preflight: representativeReadiness.checks.agentPreflight.ok ? "pass" : "blocked",
  api_auth: representativeReadiness.checks.apiAuth.ok ? "pass" : "blocked",
  demo_clip: representativeReadiness.checks.demoClip.ok ? "pass" : "blocked",
  checkout: representativeReadiness.checks.checkout.ok ? "pass" : "blocked",
  custom_domain: representativeReadiness.checks.customDomain.ok ? "pass" : "blocked",
  secret_encryption: representativeReadiness.checks.secretEncryption.ok ? "pass" : "blocked",
  persistence: representativeReadiness.checks.persistence.ok ? "pass" : "blocked",
  storage: representativeReadiness.checks.storage.ok ? "pass" : "blocked"
};

assert(status.product_hunt_ready === representativeReadiness.readyForProductHunt, "launch-status product_hunt_ready does not match representative readiness");
assert(JSON.stringify(status.status) === JSON.stringify(expectedStatus), "launch-status status map does not match representative readiness");

const blockedStatusKeys = Object.entries(status.status)
  .filter(([, value]) => value === "blocked")
  .map(([key]) => key);
const blockerIds = status.remaining_blockers.map((blocker) => blocker.id);
const expectedBlockers = blockedStatusKeys.map((key) => ({
  custom_domain: "custom_domain",
  secret_encryption: "secret_encryption"
}[key] || key));

assert(JSON.stringify(blockerIds) === JSON.stringify(expectedBlockers), "launch-status blockers do not match blocked status keys");
assert(status.go_no_go_rule.includes("readyForProductHunt=true"), "launch-status go/no-go rule must cite readyForProductHunt=true");
assert(status.operator_commands.includes("npm run render:validate-env"), "launch-status operator commands must include render:validate-env");
assert(status.operator_commands.includes("npm run launch:check"), "launch-status operator commands must include launch:check");
assert(status.operator_commands.includes("npm run readiness:check"), "launch-status operator commands must include readiness:check");
assert(manifest.launch_status_url === status.public_artifacts.launch_status, "agent manifest launch_status_url must match launch-status public artifact URL");
assert(openapi.paths["/launch-status.json"]?.get?.security?.length === 0, "OpenAPI must expose unauthenticated /launch-status.json metadata");
assert(llms.includes(status.public_artifacts.launch_status), "llms.txt must link launch-status URL");

console.log("Launch status metadata matches readiness, manifest, OpenAPI, and llms.txt.");
