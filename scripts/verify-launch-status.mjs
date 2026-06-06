#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildReadinessReport } from "../readiness.mjs";
import { buildLaunchStatus } from "../launch-status.mjs";
import { buildProductHuntLaunchKit } from "../product-hunt-launch-kit.mjs";

function readJson(path) {
  return JSON.parse(readFileSync(resolve(path), "utf8"));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const status = readJson("public/launch-status.json");
const manifest = readJson("public/agent-manifest.json");
const openapi = readJson("public/openapi.json");
const launchKit = readJson("public/product-hunt-launch-kit.json");
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
assert(status.go_no_go_rule.includes("npm run launch:doctor exits 0"), "launch-status go/no-go rule must require launch:doctor");
assert(status.go_no_go_rule.includes("npm run launch:check"), "launch-status go/no-go rule must require launch:check");
assert(status.operator_commands.includes("npm run launch:doctor"), "launch-status operator commands must include launch:doctor");
assert(status.operator_commands.includes("npm run launch:dns"), "launch-status operator commands must include launch:dns");
assert(status.operator_commands.includes("npm run launch:checkout"), "launch-status operator commands must include launch:checkout");
assert(status.operator_commands.includes("UPLOADCHECK_CHECKOUT_PROBE=1 npm run launch:checkout"), "launch-status operator commands must include the explicit checkout probe");
assert(status.operator_commands.includes("npm run launch:storage"), "launch-status operator commands must include launch:storage");
assert(status.operator_commands.includes("npm run --silent render:bootstrap-env > /tmp/uploadcheck-render-launch.env"), "launch-status operator commands must include render:bootstrap-env");
assert(status.operator_commands.includes("npm run render:validate-env-file -- /tmp/uploadcheck-render-launch.env"), "launch-status operator commands must include render:validate-env-file");
assert(status.operator_commands.includes("npm run render:validate-env"), "launch-status operator commands must include render:validate-env");
assert(status.operator_commands.includes("npm run launch-status:generate"), "launch-status operator commands must include launch-status:generate");
assert(status.operator_commands.includes("npm run codex:verify-install"), "launch-status operator commands must include codex:verify-install");
assert(status.operator_commands.includes("npm run cost-basis:verify"), "launch-status operator commands must include cost-basis:verify");
assert(status.operator_commands.includes("npm run roadmap:verify"), "launch-status operator commands must include roadmap:verify");
assert(status.operator_commands.includes("npm run launch:check"), "launch-status operator commands must include launch:check");
assert(status.operator_commands.includes("npm run readiness:check"), "launch-status operator commands must include readiness:check");
assert(status.verified_controls.some((control) => control.id === "codex_mcp" && control.evidence.includes("codex:verify-install")), "launch-status Codex MCP evidence must cite codex:verify-install");
assert(status.verified_controls.some((control) => control.id === "cost_basis" && control.evidence.includes("cost-basis:verify")), "launch-status cost-basis evidence must cite cost-basis:verify");
assert(status.verified_controls.some((control) => control.id === "roadmap" && control.evidence.includes("roadmap:verify")), "launch-status roadmap evidence must cite roadmap:verify");
assert(status.verified_controls.some((control) => control.id === "sample_reports" && control.evidence.includes("PASS, WATCH, and BLOCK")), "launch-status sample report evidence must cite PASS, WATCH, and BLOCK");
assert(status.verified_controls.some((control) => control.id === "product_hunt_launch_kit" && control.evidence.includes("product-hunt-launch-kit.json")), "launch-status Product Hunt launch kit evidence must cite product-hunt-launch-kit.json");
assert(status.verified_controls.some((control) => control.id === "billing_enforcement" && control.evidence.includes("AI-review seconds") && control.evidence.includes("usage_limit_exceeded")), "launch-status billing enforcement evidence must cite AI-review seconds and usage_limit_exceeded");
assert(status.verified_controls.some((control) => control.id === "abuse_limits" && control.evidence.includes("duration_limit_exceeded") && control.evidence.includes("active_job_limit_exceeded")), "launch-status abuse limits evidence must cite fail-fast errors");
assert(status.verified_controls.some((control) => control.id === "job_observability" && control.evidence.includes("processingDurationMs") && control.evidence.includes("failureReason")), "launch-status job observability evidence must cite processingDurationMs and failureReason");
assert(status.verified_controls.some((control) => control.id === "queued_worker" && control.evidence.includes("process_async=true") && control.evidence.includes("/v1/qc/jobs/drain")), "launch-status queued worker evidence must cite process_async and drain endpoint");
assert(manifest.launch_status_url === status.public_artifacts.launch_status, "agent manifest launch_status_url must match launch-status public artifact URL");
assert(manifest.live_launch_status_url === status.public_artifacts.live_launch_status, "agent manifest live_launch_status_url must match launch-status public artifact URL");
assert(openapi.paths["/launch-status.json"]?.get?.security?.length === 0, "OpenAPI must expose unauthenticated /launch-status.json metadata");
assert(openapi.paths["/product-hunt-launch-kit.json"]?.get?.security?.length === 0, "OpenAPI must expose unauthenticated /product-hunt-launch-kit.json metadata");
assert(openapi.paths["/v1/launch-status"]?.get?.security?.length === 0, "OpenAPI must expose unauthenticated /v1/launch-status metadata");
assert(llms.includes(status.public_artifacts.launch_status), "llms.txt must link launch-status URL");
assert(llms.includes(status.public_artifacts.live_launch_status), "llms.txt must link live launch-status URL");
assert(llms.includes(status.public_artifacts.sample_reports), "llms.txt must link sample report artifacts URL");
assert(llms.includes(status.public_artifacts.product_hunt_launch_kit), "llms.txt must link Product Hunt launch kit URL");
assert(JSON.stringify(launchKit) === JSON.stringify(buildProductHuntLaunchKit(status)), "Product Hunt launch kit does not match product-hunt-launch-kit.mjs builder");
assert(launchKit.ready_when?.source_of_truth === status.public_artifacts.live_launch_status, "Product Hunt launch kit must use live launch status as source of truth");
assert(launchKit.current_state_snapshot?.source === status.public_artifacts.launch_status, "Product Hunt launch kit current snapshot must link static launch status");
assert(launchKit.current_state_snapshot?.product_hunt_ready === status.product_hunt_ready, "Product Hunt launch kit current snapshot readiness must match static launch status");
assert(JSON.stringify(launchKit.current_state_snapshot?.remaining_blockers) === JSON.stringify(status.remaining_blockers.map((blocker) => blocker.id)), "Product Hunt launch kit current snapshot blockers must match static launch status");
assert(String(launchKit.current_state_snapshot?.note || "").includes("Static snapshot"), "Product Hunt launch kit current snapshot must warn that live status is authoritative");
assert(launchKit.ready_when?.required_commands?.includes("npm run launch:doctor"), "Product Hunt launch kit must require launch:doctor");
assert(launchKit.ready_when?.required_commands?.includes("npm run launch-status:generate"), "Product Hunt launch kit must require launch-status:generate");
assert(launchKit.ready_when?.required_commands?.includes("npm run render:validate-env-file -- /tmp/uploadcheck-render-launch.env"), "Product Hunt launch kit must require render:validate-env-file");
assert(launchKit.ready_when?.required_commands?.includes("npm run launch:dns"), "Product Hunt launch kit must require launch:dns");
assert(launchKit.ready_when?.required_commands?.includes("npm run launch:checkout"), "Product Hunt launch kit must require launch:checkout");
assert(launchKit.ready_when?.required_commands?.includes("UPLOADCHECK_CHECKOUT_PROBE=1 npm run launch:checkout"), "Product Hunt launch kit must require the explicit checkout probe");
assert(launchKit.ready_when?.required_commands?.includes("npm run launch:storage"), "Product Hunt launch kit must require launch:storage");
assert(launchKit.ready_when?.required_commands?.includes("UPLOADCHECK_STORAGE_PROBE=1 npm run launch:storage"), "Product Hunt launch kit must require the explicit storage probe");
assert(status.operator_commands.includes("UPLOADCHECK_CHECKOUT_PROBE=1 npm run launch:checkout"), "launch-status operator commands must include the explicit checkout probe");
assert(status.operator_commands.includes("UPLOADCHECK_STORAGE_PROBE=1 npm run launch:storage"), "launch-status operator commands must include the explicit storage probe");
assert(launchKit.public_links?.launch_status === status.public_artifacts.launch_status, "Product Hunt launch kit must link static launch status");
assert(launchKit.public_links?.sample_reports_index === status.public_artifacts.sample_reports, "Product Hunt launch kit must link sample reports");
assert(launchKit.public_links?.cost_basis === status.public_artifacts.cost_basis, "Product Hunt launch kit must link cost basis");

console.log("Launch status metadata matches readiness, manifest, OpenAPI, and llms.txt.");
