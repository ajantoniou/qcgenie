export function buildProductHuntLaunchKit(status) {
  const artifacts = status?.public_artifacts || {};
  return {
    name: "UploadCheck.app Product Hunt Launch Kit",
    product: {
      name: "UploadCheck.app",
      tagline: "Quality check videos, podcasts, and clips before you upload.",
      category: "Agent-native media QC",
      primary_audience: ["creators", "editors", "studios", "agencies", "Claude Code users", "Codex users", "MCP agents"],
      one_liner: "UploadCheck gives creator agents a final pre-upload QC pass for video, podcast, and clip exports."
    },
    launch_copy: {
      headline: "Catch upload mistakes before your audience does",
      maker_comment: "We built UploadCheck from real production failures: duplicate AI characters, frozen frames, low-contrast captions, garbled audio, unsafe Shorts text, canvas gutters, and agent repair loops. The product gives agents a callable QC gate before the upload button.",
      short_description: "Run /check from an agent workspace or call the API before publishing. UploadCheck returns verdicts, timestamped flags, source-hash proof, marker exports, cost estimates, and repair-loop instructions.",
      proof_points: [
        "Global Codex MCP server: uploadcheck",
        "CLI/package names: @uploadcheck/cli and @uploadcheck/mcp",
        "Live Render API with inline media, signed upload, queued worker, and report endpoints",
        "Public PASS, WATCH, and BLOCK sample reports",
        "Cost guardrails that downgrade or block model-backed checks when they would break the 95% gross-margin target"
      ]
    },
    demo_flow: [
      {
        step: 1,
        title: "Preflight cost",
        script: "Call qc_estimate_cost with the intended checks and plan. Show effective checks, removed checks, and margin safety before media is sent."
      },
      {
        step: 2,
        title: "Run /check",
        script: "Send a final video, podcast, Short, or still frame through UploadCheck using the CLI, MCP server, or REST API."
      },
      {
        step: 3,
        title: "Show the block",
        script: "Use the duplicate-crowd sample: UploadCheck blocks repeated faces and tells the editor to regenerate with more character variation."
      },
      {
        step: 4,
        title: "Ask to fix now",
        script: "Show every flag, separate direct fixes from render-source issues, ask whether to fix now, then rerun UploadCheck after edits."
      }
    ],
    public_links: {
      product_hunt_page: artifacts.product_hunt_page,
      demo_clip: artifacts.demo_clip,
      sample_reports_index: artifacts.sample_reports,
      block_sample_report: sampleReportUrl(artifacts.sample_reports, "duplicate-characters-block.json"),
      cost_basis: artifacts.cost_basis,
      agent_manifest: artifacts.agent_manifest,
      openapi: artifacts.openapi,
      launch_status: artifacts.launch_status,
      live_launch_status: artifacts.live_launch_status
    },
    pricing_position: {
      creator: "$99/mo for 1,200 checked minutes",
      studio: "$299/mo for 5,000 checked minutes",
      network: "$799/mo for 18,000 checked minutes",
      margin_rule: "Included minutes cover deterministic pre-upload QC. Model-backed deep review is preflighted and may be downgraded or sold separately when it would break the 95% gross-margin target.",
      stress_plan_verdict: "$99 for 5,000 checked minutes is too generous for unlimited full-video AI review."
    },
    ready_when: {
      product_hunt_ready: true,
      remaining_blockers: [],
      required_commands: [
        "npm run launch:doctor",
        "npm run codex:verify-install",
        "npm run cost-basis:verify",
        "npm run media-ingress:verify",
        "npm run roadmap:verify",
        "npm run launch-status:generate",
        "npm run launch-status:verify",
        "npm run render:validate-env-file -- /tmp/uploadcheck-render-launch.env",
        "npm run launch:dns",
        "npm run launch:checkout",
        "UPLOADCHECK_CHECKOUT_PROBE=1 npm run launch:checkout",
        "npm run launch:storage",
        "UPLOADCHECK_STORAGE_PROBE=1 npm run launch:storage",
        "npm run readiness:check",
        "npm run launch:check"
      ],
      source_of_truth: artifacts.live_launch_status
    },
    current_state_snapshot: {
      source: artifacts.launch_status,
      product_hunt_ready: Boolean(status?.product_hunt_ready),
      remaining_blockers: (status?.remaining_blockers || []).map((blocker) => blocker.id),
      note: "Static snapshot only. Use live_launch_status before launch."
    }
  };
}

function sampleReportUrl(indexUrl, filename) {
  if (!indexUrl) return undefined;
  try {
    return new URL(filename, indexUrl.replace(/index\.json$/, "")).toString();
  } catch {
    return undefined;
  }
}
