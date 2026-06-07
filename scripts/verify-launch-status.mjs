#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildReadinessReport } from "../readiness.mjs";
import { buildLaunchStatus } from "../launch-status.mjs";
import { buildProductHuntLaunchKit } from "../product-hunt-launch-kit.mjs";

function readJson(path) {
  return JSON.parse(readFileSync(resolve(path), "utf8"));
}

function readJsonIfExists(path) {
  const fullPath = resolve(path);
  return existsSync(fullPath) ? JSON.parse(readFileSync(fullPath, "utf8")) : null;
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
assert(status.contractVersion === representativeReadiness.contractVersion, "launch-status contractVersion does not match representative readiness");
assert(JSON.stringify(status.status) === JSON.stringify(expected.status), "launch-status status map does not match representative readiness");
assert(JSON.stringify(status.remaining_blockers) === JSON.stringify(expected.remaining_blockers), "launch-status blockers do not match launch-status builder");
assert(JSON.stringify(status.verified_controls) === JSON.stringify(expected.verified_controls), "launch-status verified controls do not match launch-status builder");
assert(JSON.stringify(status.operator_commands) === JSON.stringify(expected.operator_commands), "launch-status operator commands do not match launch-status builder");
assert(status.go_no_go_rule.includes("readyForProductHunt=true"), "launch-status go/no-go rule must cite readyForProductHunt=true");
assert(status.go_no_go_rule.includes("npm run launch:handoff"), "launch-status go/no-go rule must require launch:handoff");
assert(status.go_no_go_rule.includes("npm run launch:doctor exits 0"), "launch-status go/no-go rule must require launch:doctor");
assert(status.go_no_go_rule.includes("npm run launch:check"), "launch-status go/no-go rule must require launch:check");
assert(status.operator_commands.includes("npm run launch:doctor"), "launch-status operator commands must include launch:doctor");
assert(status.operator_commands.includes("npm run live-launch-doctor:verify"), "launch-status operator commands must include live-launch-doctor:verify");
assert(status.operator_commands.includes("npm run live-launch-evidence:verify"), "launch-status operator commands must include live-launch-evidence:verify");
assert(status.operator_commands.includes("npm run launch:dns"), "launch-status operator commands must include launch:dns");
assert(status.operator_commands.includes("npm run launch:checkout"), "launch-status operator commands must include launch:checkout");
assert(status.operator_commands.includes("UPLOADCHECK_CHECKOUT_PROBE=1 npm run launch:checkout"), "launch-status operator commands must include the explicit checkout probe");
assert(status.operator_commands.includes("npm run launch:storage"), "launch-status operator commands must include launch:storage");
assert(status.operator_commands.includes("npm run launch:handoff"), "launch-status operator commands must include launch:handoff");
assert(status.operator_commands.includes("npm run --silent render:bootstrap-env > /tmp/uploadcheck-render-launch.env"), "launch-status operator commands must include render:bootstrap-env");
assert(status.operator_commands.includes("npm run render:validate-env-file -- /tmp/uploadcheck-render-launch.env"), "launch-status operator commands must include render:validate-env-file");
assert(status.operator_commands.includes("npm run render:validate-env"), "launch-status operator commands must include render:validate-env");
assert(status.operator_commands.includes("npm run launch-status:generate"), "launch-status operator commands must include launch-status:generate");
assert(status.operator_commands.includes("npm run media-ingress:verify"), "launch-status operator commands must include media-ingress:verify");
assert(status.operator_commands.includes("UPLOADCHECK_MEDIA_INGRESS_BASE_URL=https://api.uploadcheck.app UPLOADCHECK_API_KEY=<private_bearer> npm run media-ingress:verify"), "launch-status operator commands must include hosted media-ingress probe");
assert(status.operator_commands.includes("npm run codex:verify-install"), "launch-status operator commands must include codex:verify-install");
assert(status.operator_commands.includes("npm run cost-basis:verify"), "launch-status operator commands must include cost-basis:verify");
assert(status.operator_commands.includes("npm run saas-basics:verify"), "launch-status operator commands must include saas-basics:verify");
assert(status.operator_commands.includes("npm run mcp-install:verify"), "launch-status operator commands must include mcp-install:verify");
assert(status.operator_commands.includes("npm run private-mcp-beta:verify"), "launch-status operator commands must include private-mcp-beta:verify");
assert(status.operator_commands.includes("npm run anthropic-directory:verify"), "launch-status operator commands must include anthropic-directory:verify");
assert(status.operator_commands.includes("npm run product-agent:verify"), "launch-status operator commands must include product-agent:verify");
assert(status.operator_commands.includes("npm run live-cost-basis:verify"), "launch-status operator commands must include live-cost-basis:verify");
assert(status.operator_commands.includes("npm run live-agent-manifest:verify"), "launch-status operator commands must include live-agent-manifest:verify");
assert(status.operator_commands.includes("npm run live-pipeline-recipes:verify"), "launch-status operator commands must include live-pipeline-recipes:verify");
assert(status.operator_commands.includes("npm run live-pipeline-handoff:verify"), "launch-status operator commands must include live-pipeline-handoff:verify");
assert(status.operator_commands.includes("npm run live-npo-pipeline-handoff:verify"), "launch-status operator commands must include live-npo-pipeline-handoff:verify");
assert(status.operator_commands.includes("npm run live-openapi:verify"), "launch-status operator commands must include live-openapi:verify");
assert(status.operator_commands.includes("npm run live-mcp-install:verify"), "launch-status operator commands must include live-mcp-install:verify");
assert(status.operator_commands.includes("npm run live-public-artifacts:verify"), "launch-status operator commands must include live-public-artifacts:verify");
assert(status.operator_commands.includes("UPLOADCHECK_LIVE_WEB_BASE_URL=https://qcgenie-web.onrender.com npm run live-web-artifacts:verify"), "launch-status operator commands must include Render static web-artifacts verifier");
assert(status.operator_commands.includes("npm run live-web-artifacts:verify"), "launch-status operator commands must include live-web-artifacts:verify");
assert(status.operator_commands.includes("npm run roadmap:verify"), "launch-status operator commands must include roadmap:verify");
assert(status.operator_commands.includes("npm run launch:check"), "launch-status operator commands must include launch:check");
assert(status.operator_commands.includes("npm run readiness:check"), "launch-status operator commands must include readiness:check");
assert(status.verified_controls.some((control) => control.id === "codex_mcp" && control.evidence.includes("codex:verify-install")), "launch-status Codex MCP evidence must cite codex:verify-install");
assert(status.verified_controls.some((control) => control.id === "inline_media" && control.evidence.includes("media-ingress:verify") && control.evidence.includes("audio_base64")), "launch-status inline media evidence must cite media-ingress:verify and audio_base64");
assert(status.verified_controls.some((control) => control.id === "cost_basis" && control.evidence.includes("cost-basis:verify")), "launch-status cost-basis evidence must cite cost-basis:verify");
assert(status.verified_controls.some((control) => control.id === "roadmap" && control.evidence.includes("roadmap:verify")), "launch-status roadmap evidence must cite roadmap:verify");
assert(status.verified_controls.some((control) => control.id === "sample_reports" && control.evidence.includes("PASS, WATCH, and BLOCK")), "launch-status sample report evidence must cite PASS, WATCH, and BLOCK");
assert(status.verified_controls.some((control) => control.id === "product_hunt_launch_kit" && control.evidence.includes("product-hunt-launch-kit.json")), "launch-status Product Hunt launch kit evidence must cite product-hunt-launch-kit.json");
assert(status.verified_controls.some((control) => control.id === "npo_pipeline_handoff" && control.evidence.includes("live-npo-pipeline-handoff:verify")), "launch-status NPO pipeline handoff evidence must cite live-npo-pipeline-handoff:verify");
assert(status.verified_controls.some((control) => control.id === "hosted_public_artifacts" && control.evidence.includes("live-public-artifacts:verify")), "launch-status hosted public-artifacts evidence must cite live-public-artifacts:verify");
assert(status.verified_controls.some((control) => control.id === "hosted_mcp_install" && control.evidence.includes("live-mcp-install:verify")), "launch-status hosted MCP install evidence must cite live-mcp-install:verify");
assert(status.verified_controls.some((control) => control.id === "mcp_install_artifact" && control.evidence.includes("mcp-install:verify") && control.evidence.includes("workspace API-key")), "launch-status MCP install evidence must cite mcp-install:verify and workspace API keys");
assert(status.verified_controls.some((control) => control.id === "hosted_web_artifacts" && control.evidence.includes("live-web-artifacts:verify")), "launch-status hosted web-artifacts evidence must cite live-web-artifacts:verify");
assert(status.verified_controls.some((control) => control.id === "render_web_artifacts" && control.evidence.includes("qcgenie-web.onrender.com")), "launch-status Render web-artifacts evidence must cite the Render static URL");
assert(status.verified_controls.some((control) => control.id === "billing_enforcement" && control.evidence.includes("included deterministic QC minutes") && control.evidence.includes("usage_limit_exceeded")), "launch-status billing enforcement evidence must cite deterministic minute enforcement and usage_limit_exceeded");
assert(status.verified_controls.some((control) => control.id === "abuse_limits" && control.evidence.includes("duration_limit_exceeded") && control.evidence.includes("active_job_limit_exceeded")), "launch-status abuse limits evidence must cite fail-fast errors");
assert(status.verified_controls.some((control) => control.id === "job_observability" && control.evidence.includes("processingDurationMs") && control.evidence.includes("failureReason")), "launch-status job observability evidence must cite processingDurationMs and failureReason");
assert(status.verified_controls.some((control) => control.id === "queued_worker" && control.evidence.includes("process_async=true") && control.evidence.includes("/v1/qc/jobs/drain")), "launch-status queued worker evidence must cite process_async and drain endpoint");
assert(manifest.launch_status_url === status.public_artifacts.launch_status, "agent manifest launch_status_url must match launch-status public artifact URL");
assert(manifest.live_launch_status_url === status.public_artifacts.live_launch_status, "agent manifest live_launch_status_url must match launch-status public artifact URL");
assert(manifest.live_launch_handoff_url === status.public_artifacts.live_launch_handoff, "agent manifest live_launch_handoff_url must match launch-status public artifact URL");
assert(manifest.live_launch_doctor_url === status.public_artifacts.live_launch_doctor, "agent manifest live_launch_doctor_url must match launch-status public artifact URL");
assert(manifest.live_launch_evidence_url === status.public_artifacts.live_launch_evidence, "agent manifest live_launch_evidence_url must match launch-status public artifact URL");
assert(manifest.launch_handoff_command === "npm run launch:handoff -- --text", "agent manifest must expose the local launch handoff command");
assert(manifest.pipeline_handoff_url === status.public_artifacts.pipeline_handoff, "agent manifest pipeline_handoff_url must match launch-status public artifact URL");
assert(manifest.npo_pipeline_handoff_url === status.public_artifacts.npo_pipeline_handoff, "agent manifest npo_pipeline_handoff_url must match launch-status public artifact URL");
assert(manifest.mcp_install_url === status.public_artifacts.mcp_install, "agent manifest mcp_install_url must match launch-status public artifact URL");
assert(manifest.primary_endpoints?.includes("GET /pipeline-handoff.json"), "agent manifest must expose pipeline handoff as a primary endpoint");
assert(manifest.primary_endpoints?.includes("GET /pipeline-recipes.json"), "agent manifest must expose pipeline recipes as a primary endpoint");
assert(manifest.primary_endpoints?.includes("GET /npo-pipeline-handoff.json"), "agent manifest must expose NPO pipeline handoff as a primary endpoint");
assert(manifest.primary_endpoints?.includes("GET /cost-basis.json"), "agent manifest must expose cost basis as a primary endpoint");
assert(openapi.paths["/pipeline-handoff.json"]?.get?.security?.length === 0, "OpenAPI must expose unauthenticated /pipeline-handoff.json metadata");
assert(openapi.paths["/npo-pipeline-handoff.json"]?.get?.security?.length === 0, "OpenAPI must expose unauthenticated /npo-pipeline-handoff.json metadata");
assert(openapi.paths["/launch-status.json"]?.get?.security?.length === 0, "OpenAPI must expose unauthenticated /launch-status.json metadata");
assert(openapi.paths["/product-hunt-launch-kit.json"]?.get?.security?.length === 0, "OpenAPI must expose unauthenticated /product-hunt-launch-kit.json metadata");
assert(openapi.paths["/mcp-install.json"]?.get?.security?.length === 0, "OpenAPI must expose unauthenticated /mcp-install.json metadata");
assert(openapi.paths["/v1/launch-status"]?.get?.security?.length === 0, "OpenAPI must expose unauthenticated /v1/launch-status metadata");
assert(openapi.paths["/v1/launch-handoff"]?.get?.security?.length === 0, "OpenAPI must expose unauthenticated /v1/launch-handoff metadata");
assert(openapi.paths["/v1/launch-doctor"]?.get?.security?.length === 0, "OpenAPI must expose unauthenticated /v1/launch-doctor metadata");
assert(openapi.paths["/v1/launch-evidence"]?.get?.security?.length === 0, "OpenAPI must expose unauthenticated /v1/launch-evidence metadata");
assert(llms.includes(status.public_artifacts.launch_status), "llms.txt must link launch-status URL");
assert(llms.includes(status.public_artifacts.live_launch_status), "llms.txt must link live launch-status URL");
assert(llms.includes(status.public_artifacts.live_launch_handoff), "llms.txt must link live launch handoff URL");
assert(llms.includes(status.public_artifacts.live_launch_doctor), "llms.txt must link live launch doctor URL");
assert(llms.includes(status.public_artifacts.live_launch_evidence), "llms.txt must link live launch evidence URL");
assert(llms.includes(status.public_artifacts.pipeline_handoff), "llms.txt must link pipeline handoff URL");
assert(llms.includes(status.public_artifacts.npo_pipeline_handoff), "llms.txt must link NPO pipeline handoff URL");
assert(llms.includes(status.public_artifacts.mcp_install), "llms.txt must link MCP install URL");
assert(llms.includes(status.public_artifacts.sample_reports), "llms.txt must link sample report artifacts URL");
assert(llms.includes(status.public_artifacts.product_hunt_launch_kit), "llms.txt must link Product Hunt launch kit URL");
assert(llms.includes("npm run launch:handoff -- --text"), "llms.txt must mention the local launch handoff command");
assert(JSON.stringify(launchKit) === JSON.stringify(buildProductHuntLaunchKit(status)), "Product Hunt launch kit does not match product-hunt-launch-kit.mjs builder");
assert(launchKit.ready_when?.source_of_truth === status.public_artifacts.live_launch_status, "Product Hunt launch kit must use live launch status as source of truth");
assert(launchKit.launch_copy?.proof_points?.some((point) => point.includes("Private MCP beta install uses a local checkout or private clone")), "Product Hunt launch kit must not imply public npm install is current");
assert(launchKit.distribution_position?.current_status === "private_mcp_beta_not_public_self_serve", "Product Hunt launch kit must publish private MCP beta distribution status");
assert(launchKit.distribution_position?.required_secret?.includes("workspace API key tied to plan minutes"), "Product Hunt launch kit must require credit-gated workspace API keys");
assert(String(launchKit.distribution_position?.openai_connector || "").includes("defer"), "Product Hunt launch kit must defer OpenAI connector/app positioning");
assert(launchKit.current_state_snapshot?.source === status.public_artifacts.launch_status, "Product Hunt launch kit current snapshot must link static launch status");
assert(launchKit.current_state_snapshot?.product_hunt_ready === status.product_hunt_ready, "Product Hunt launch kit current snapshot readiness must match static launch status");
assert(JSON.stringify(launchKit.current_state_snapshot?.remaining_blockers) === JSON.stringify(status.remaining_blockers.map((blocker) => blocker.id)), "Product Hunt launch kit current snapshot blockers must match static launch status");
assert(String(launchKit.current_state_snapshot?.note || "").includes("Static snapshot"), "Product Hunt launch kit current snapshot must warn that live status is authoritative");
assert(launchKit.ready_when?.required_commands?.includes("npm run launch:doctor"), "Product Hunt launch kit must require launch:doctor");
assert(launchKit.ready_when?.required_commands?.includes("npm run launch:handoff"), "Product Hunt launch kit must require launch:handoff");
assert(launchKit.ready_when?.required_commands?.includes("npm run live-launch-doctor:verify"), "Product Hunt launch kit must require live-launch-doctor:verify");
assert(launchKit.ready_when?.required_commands?.includes("npm run live-launch-evidence:verify"), "Product Hunt launch kit must require live-launch-evidence:verify");
assert(launchKit.ready_when?.required_commands?.includes("UPLOADCHECK_MEDIA_INGRESS_BASE_URL=https://api.uploadcheck.app UPLOADCHECK_API_KEY=<private_bearer> npm run media-ingress:verify"), "Product Hunt launch kit must require hosted media-ingress probe");
assert(launchKit.ready_when?.required_commands?.includes("npm run launch-status:generate"), "Product Hunt launch kit must require launch-status:generate");
assert(launchKit.ready_when?.required_commands?.includes("npm run saas-basics:verify"), "Product Hunt launch kit must require saas-basics:verify");
assert(launchKit.ready_when?.required_commands?.includes("npm run private-mcp-beta:verify"), "Product Hunt launch kit must require private-mcp-beta:verify");
assert(launchKit.ready_when?.required_commands?.includes("npm run anthropic-directory:verify"), "Product Hunt launch kit must require anthropic-directory:verify");
assert(launchKit.ready_when?.required_commands?.includes("npm run product-agent:verify"), "Product Hunt launch kit must require product-agent:verify");
assert(launchKit.ready_when?.required_commands?.includes("npm run live-cost-basis:verify"), "Product Hunt launch kit must require live-cost-basis:verify");
assert(launchKit.ready_when?.required_commands?.includes("npm run live-agent-manifest:verify"), "Product Hunt launch kit must require live-agent-manifest:verify");
assert(launchKit.ready_when?.required_commands?.includes("npm run live-pipeline-recipes:verify"), "Product Hunt launch kit must require live-pipeline-recipes:verify");
assert(launchKit.ready_when?.required_commands?.includes("npm run live-pipeline-handoff:verify"), "Product Hunt launch kit must require live-pipeline-handoff:verify");
assert(launchKit.ready_when?.required_commands?.includes("npm run live-npo-pipeline-handoff:verify"), "Product Hunt launch kit must require live-npo-pipeline-handoff:verify");
assert(launchKit.ready_when?.required_commands?.includes("npm run live-openapi:verify"), "Product Hunt launch kit must require live-openapi:verify");
assert(launchKit.ready_when?.required_commands?.includes("npm run live-mcp-install:verify"), "Product Hunt launch kit must require live-mcp-install:verify");
assert(launchKit.ready_when?.required_commands?.includes("npm run live-public-artifacts:verify"), "Product Hunt launch kit must require live-public-artifacts:verify");
assert(launchKit.ready_when?.required_commands?.includes("npm run mcp-install:verify"), "Product Hunt launch kit must require mcp-install:verify");
assert(launchKit.ready_when?.required_commands?.includes("UPLOADCHECK_LIVE_WEB_BASE_URL=https://qcgenie-web.onrender.com npm run live-web-artifacts:verify"), "Product Hunt launch kit must require Render static web-artifacts verifier");
assert(launchKit.ready_when?.required_commands?.includes("npm run live-web-artifacts:verify"), "Product Hunt launch kit must require live-web-artifacts:verify");
assert(launchKit.ready_when?.required_commands?.includes("npm run render:validate-env-file -- /tmp/uploadcheck-render-launch.env"), "Product Hunt launch kit must require render:validate-env-file");
assert(launchKit.ready_when?.required_commands?.includes("npm run launch:dns"), "Product Hunt launch kit must require launch:dns");
assert(launchKit.ready_when?.required_commands?.includes("npm run launch:checkout"), "Product Hunt launch kit must require launch:checkout");
assert(launchKit.ready_when?.required_commands?.includes("UPLOADCHECK_CHECKOUT_PROBE=1 npm run launch:checkout"), "Product Hunt launch kit must require the explicit checkout probe");
assert(launchKit.ready_when?.required_commands?.includes("npm run launch:storage"), "Product Hunt launch kit must require launch:storage");
assert(launchKit.ready_when?.required_commands?.includes("UPLOADCHECK_STORAGE_PROBE=1 npm run launch:storage"), "Product Hunt launch kit must require the explicit storage probe");
assert(status.operator_commands.includes("UPLOADCHECK_CHECKOUT_PROBE=1 npm run launch:checkout"), "launch-status operator commands must include the explicit checkout probe");
assert(status.operator_commands.includes("UPLOADCHECK_STORAGE_PROBE=1 npm run launch:storage"), "launch-status operator commands must include the explicit storage probe");
assert(launchKit.public_links?.launch_status === status.public_artifacts.launch_status, "Product Hunt launch kit must link static launch status");
assert(launchKit.public_links?.live_launch_doctor === status.public_artifacts.live_launch_doctor, "Product Hunt launch kit must link live launch doctor");
assert(launchKit.public_links?.live_launch_evidence === status.public_artifacts.live_launch_evidence, "Product Hunt launch kit must link live launch evidence");
assert(launchKit.public_links?.sample_reports_index === status.public_artifacts.sample_reports, "Product Hunt launch kit must link sample reports");
assert(launchKit.public_links?.cost_basis === status.public_artifacts.cost_basis, "Product Hunt launch kit must link cost basis");
assert(launchKit.public_links?.pipeline_handoff === status.public_artifacts.pipeline_handoff, "Product Hunt launch kit must link pipeline handoff");
assert(launchKit.public_links?.mcp_install === status.public_artifacts.mcp_install, "Product Hunt launch kit must link MCP install artifact");

const builtStatus = readJsonIfExists("dist/launch-status.json");
if (builtStatus) {
  assert(JSON.stringify(builtStatus) === JSON.stringify(status), "dist/launch-status.json must match public/launch-status.json; run npm run build");
}

const builtLaunchKit = readJsonIfExists("dist/product-hunt-launch-kit.json");
if (builtLaunchKit) {
  assert(JSON.stringify(builtLaunchKit) === JSON.stringify(launchKit), "dist/product-hunt-launch-kit.json must match public/product-hunt-launch-kit.json; run npm run build");
}

console.log("Launch status metadata matches readiness, manifest, OpenAPI, llms.txt, and built static artifacts.");
