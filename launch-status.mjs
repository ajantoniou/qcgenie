export function buildLaunchStatus(readiness, {
  generatedFrom = "live readiness",
  lastVerifiedDate = new Date().toISOString().slice(0, 10)
} = {}) {
  const checks = readiness?.checks || {};
  const status = {
    api: statusFor(checks.api),
    agent_preflight: statusFor(checks.agentPreflight),
    api_auth: statusFor(checks.apiAuth),
    demo_clip: statusFor(checks.demoClip),
    checkout: statusFor(checks.checkout),
    custom_domain: statusFor(checks.customDomain),
    secret_encryption: statusFor(checks.secretEncryption),
    persistence: statusFor(checks.persistence),
    storage: statusFor(checks.storage)
  };

  return {
    name: "UploadCheck.app Launch Status",
    description: "Machine-readable Product Hunt launch state for UploadCheck.app agents and operators.",
    generated_from: generatedFrom,
    last_verified_date: lastVerifiedDate,
    product_hunt_ready: Boolean(readiness?.readyForProductHunt),
    canonical_surfaces: {
      app: "https://uploadcheck.app",
      api: "https://api.uploadcheck.app",
      current_api_base: "https://qcgenie-api.onrender.com/v1",
      mcp_server: "uploadcheck",
      cli_package: "@uploadcheck/cli",
      mcp_package: "@uploadcheck/mcp"
    },
    status,
    verified_controls: verifiedControls(),
    remaining_blockers: remainingBlockers(status),
    operator_commands: [
      "npm run --silent render:env-template > /tmp/uploadcheck-render-launch.env",
      "set -a; source /tmp/uploadcheck-render-launch.env; set +a",
      "npm run render:plan",
      "npm run render:validate-env",
      "npm run render:audit",
      "npm run render:apply",
      "npm run codex:verify-install",
      "npm run cost-basis:verify",
      "npm run roadmap:verify",
      "npm run launch:check",
      "npm run readiness:check"
    ],
    public_artifacts: {
      openapi: "https://qcgenie-api.onrender.com/openapi.json",
      agent_manifest: "https://qcgenie-api.onrender.com/agent-manifest.json",
      pipeline_recipes: "https://qcgenie-api.onrender.com/pipeline-recipes.json",
      launch_targets: "https://qcgenie-api.onrender.com/launch-targets.json",
      cost_basis: "https://qcgenie-api.onrender.com/cost-basis.json",
      sample_reports: "https://qcgenie-api.onrender.com/sample-reports/index.json",
      launch_status: "https://qcgenie-api.onrender.com/launch-status.json",
      live_launch_status: "https://qcgenie-api.onrender.com/v1/launch-status",
      product_hunt_page: "https://uploadcheck.app/product-hunt/",
      demo_clip: "https://uploadcheck.app/demo/uploadcheck-product-hunt-demo.mp4"
    },
    go_no_go_rule: "Do not claim Product Hunt launch readiness until GET /v1/readiness returns readyForProductHunt=true and npm run launch:check passes DNS and HTTP for uploadcheck.app, www.uploadcheck.app, and api.uploadcheck.app."
  };
}

function statusFor(check) {
  return check?.ok ? "pass" : "blocked";
}

function verifiedControls() {
  return [
    {
      id: "real_engine",
      status: "done",
      evidence: "scripts/qc-engine/run_gate.py is wired through hosted store for resolvable media."
    },
    {
      id: "codex_mcp",
      status: "done",
      evidence: "npm run codex:verify-install checks the global uploadcheck MCP server entry, hosted API base URL, executable wrapper, and installed skill."
    },
    {
      id: "inline_media",
      status: "done",
      evidence: "CLI/MCP/API support inline media payloads with sanitized mediaIngress and sha256."
    },
    {
      id: "signed_upload",
      status: "done",
      evidence: "Large local files can use signed upload before job creation."
    },
    {
      id: "cost_guardrail",
      status: "done",
      evidence: "qc_estimate_cost and job creation support plan-aware cost_guardrail downgrade/block/off."
    },
    {
      id: "cost_basis",
      status: "done",
      evidence: "npm run cost-basis:verify checks public cost-per-minute and 95% gross-margin assumptions against cost-model.mjs."
    },
    {
      id: "roadmap",
      status: "done",
      evidence: "npm run roadmap:verify checks the 50-point plan, expert-panel coverage, NTO replacement addendum, and execution-status markers."
    },
    {
      id: "sample_reports",
      status: "done",
      evidence: "Public PASS, WATCH, and BLOCK sample report JSON artifacts are linked from /sample-report/, agent-manifest.json, and llms.txt."
    },
    {
      id: "observed_costs",
      status: "done",
      evidence: "Reports and margin telemetry distinguish estimated and observed provider COGS."
    },
    {
      id: "billing_enforcement",
      status: "done",
      evidence: "Plan usage metering is idempotent per job/billing period, and declared jobs that exceed included minutes or AI-review seconds return usage_limit_exceeded before QC runs."
    },
    {
      id: "package_verify",
      status: "done",
      evidence: "npm run packages:verify checks @uploadcheck/cli and @uploadcheck/mcp pack contents."
    },
    {
      id: "render_env_validation",
      status: "done",
      evidence: "npm run render:validate-env rejects placeholders, weak secrets, invalid URLs, invalid API hashes, incomplete object storage, and non-durable paths before render:apply."
    }
  ];
}

function remainingBlockers(status) {
  const definitions = {
    checkout: {
      id: "checkout",
      severity: "block",
      required_inputs: [
        "UPLOADCHECK_CREATOR_CHECKOUT_URL",
        "UPLOADCHECK_STUDIO_CHECKOUT_URL",
        "UPLOADCHECK_NETWORK_CHECKOUT_URL"
      ],
      alternative_inputs: [
        "UPLOADCHECK_LEMONSQUEEZY_STORE_SLUG",
        "UPLOADCHECK_CREATOR_VARIANT_ID",
        "UPLOADCHECK_STUDIO_VARIANT_ID",
        "UPLOADCHECK_NETWORK_VARIANT_ID"
      ]
    },
    custom_domain: {
      id: "custom_domain",
      severity: "block",
      required_dns: [
        { type: "CNAME", name: "@", target: "qcgenie-web.onrender.com" },
        { type: "CNAME", name: "www", target: "qcgenie-web.onrender.com" },
        { type: "CNAME", name: "api", target: "qcgenie-api.onrender.com" }
      ]
    },
    secret_encryption: {
      id: "secret_encryption",
      severity: "block",
      required_inputs: ["UPLOADCHECK_SECRET_ENCRYPTION_KEY"],
      generator: "npm run --silent secret:generate"
    },
    persistence: {
      id: "persistence",
      severity: "block",
      required_inputs: ["UPLOADCHECK_STORE_PATH=/mnt/uploadcheck/store.json"],
      alternative_inputs: ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]
    },
    storage: {
      id: "storage",
      severity: "block",
      required_inputs: ["UPLOADCHECK_DURABLE_STORAGE_DIR=/mnt/uploadcheck/uploads"],
      alternative_inputs: [
        "UPLOADCHECK_STORAGE_BUCKET",
        "UPLOADCHECK_STORAGE_ENDPOINT",
        "UPLOADCHECK_STORAGE_ACCESS_KEY_ID",
        "UPLOADCHECK_STORAGE_SECRET_ACCESS_KEY"
      ]
    }
  };

  return ["checkout", "custom_domain", "secret_encryption", "persistence", "storage"]
    .filter((key) => status[key] === "blocked")
    .map((key) => definitions[key]);
}
