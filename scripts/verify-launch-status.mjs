#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildReadinessReport } from "../readiness.mjs";
import { buildLaunchStatus } from "../launch-status.mjs";

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

const expected = buildLaunchStatus(representativeReadiness, {
  generatedFrom: status.generated_from,
  lastVerifiedDate: status.last_verified_date
});

assert(status.product_hunt_ready === representativeReadiness.readyForProductHunt, "launch-status product_hunt_ready does not match representative readiness");
assert(JSON.stringify(status.status) === JSON.stringify(expected.status), "launch-status status map does not match representative readiness");
assert(JSON.stringify(status.remaining_blockers) === JSON.stringify(expected.remaining_blockers), "launch-status blockers do not match launch-status builder");
assert(JSON.stringify(status.verified_controls) === JSON.stringify(expected.verified_controls), "launch-status verified controls do not match launch-status builder");
assert(JSON.stringify(status.operator_commands) === JSON.stringify(expected.operator_commands), "launch-status operator commands do not match launch-status builder");
assert(status.go_no_go_rule.includes("readyForProductHunt=true"), "launch-status go/no-go rule must cite readyForProductHunt=true");
assert(status.operator_commands.includes("npm run render:validate-env"), "launch-status operator commands must include render:validate-env");
assert(status.operator_commands.includes("npm run codex:verify-install"), "launch-status operator commands must include codex:verify-install");
assert(status.operator_commands.includes("npm run cost-basis:verify"), "launch-status operator commands must include cost-basis:verify");
assert(status.operator_commands.includes("npm run roadmap:verify"), "launch-status operator commands must include roadmap:verify");
assert(status.operator_commands.includes("npm run launch:check"), "launch-status operator commands must include launch:check");
assert(status.operator_commands.includes("npm run readiness:check"), "launch-status operator commands must include readiness:check");
assert(status.verified_controls.some((control) => control.id === "codex_mcp" && control.evidence.includes("codex:verify-install")), "launch-status Codex MCP evidence must cite codex:verify-install");
assert(status.verified_controls.some((control) => control.id === "cost_basis" && control.evidence.includes("cost-basis:verify")), "launch-status cost-basis evidence must cite cost-basis:verify");
assert(status.verified_controls.some((control) => control.id === "roadmap" && control.evidence.includes("roadmap:verify")), "launch-status roadmap evidence must cite roadmap:verify");
assert(manifest.launch_status_url === status.public_artifacts.launch_status, "agent manifest launch_status_url must match launch-status public artifact URL");
assert(manifest.live_launch_status_url === status.public_artifacts.live_launch_status, "agent manifest live_launch_status_url must match launch-status public artifact URL");
assert(openapi.paths["/launch-status.json"]?.get?.security?.length === 0, "OpenAPI must expose unauthenticated /launch-status.json metadata");
assert(openapi.paths["/v1/launch-status"]?.get?.security?.length === 0, "OpenAPI must expose unauthenticated /v1/launch-status metadata");
assert(llms.includes(status.public_artifacts.launch_status), "llms.txt must link launch-status URL");
assert(llms.includes(status.public_artifacts.live_launch_status), "llms.txt must link live launch-status URL");

console.log("Launch status metadata matches readiness, manifest, OpenAPI, and llms.txt.");
