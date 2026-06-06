import { spawnSync } from "node:child_process";

export const LAUNCH_DOCTOR_STEPS = [
  { id: "dns-records", label: "Print DNS cutover records", command: ["npm", "run", "--silent", "launch:dns"] },
  { id: "checkout", label: "Check checkout configuration", command: ["npm", "run", "--silent", "launch:checkout"] },
  { id: "checkout-probe", label: "Probe live checkout reachability", command: ["npm", "run", "--silent", "launch:checkout"], env: { UPLOADCHECK_CHECKOUT_PROBE: "1" } },
  { id: "storage", label: "Check persistence and storage configuration", command: ["npm", "run", "--silent", "launch:storage"] },
  { id: "storage-probe", label: "Probe writable durable storage", command: ["npm", "run", "--silent", "launch:storage"], env: { UPLOADCHECK_STORAGE_PROBE: "1" } },
  { id: "render-config", label: "Verify Render blueprint", command: ["npm", "run", "--silent", "render:verify"] },
  { id: "media-ingress", label: "Verify programmatic video/audio ingress", command: ["npm", "run", "--silent", "media-ingress:verify"] },
  { id: "hosted-launch-doctor", label: "Verify hosted launch doctor endpoint", command: ["npm", "run", "--silent", "live-launch-doctor:verify"] },
  { id: "hosted-launch-evidence", label: "Verify hosted launch evidence endpoint", command: ["npm", "run", "--silent", "live-launch-evidence:verify"] },
  { id: "hosted-cost-basis", label: "Verify hosted cost basis", command: ["npm", "run", "--silent", "live-cost-basis:verify"] },
  { id: "hosted-agent-manifest", label: "Verify hosted agent manifest", command: ["npm", "run", "--silent", "live-agent-manifest:verify"] },
  { id: "hosted-pipeline-recipes", label: "Verify hosted pipeline recipes", command: ["npm", "run", "--silent", "live-pipeline-recipes:verify"] },
  { id: "hosted-pipeline-handoff", label: "Verify hosted pipeline handoff", command: ["npm", "run", "--silent", "live-pipeline-handoff:verify"] },
  { id: "hosted-npo-pipeline-handoff", label: "Verify hosted NPO pipeline handoff", command: ["npm", "run", "--silent", "live-npo-pipeline-handoff:verify"] },
  { id: "hosted-openapi", label: "Verify hosted OpenAPI", command: ["npm", "run", "--silent", "live-openapi:verify"] },
  { id: "hosted-public-artifacts", label: "Verify hosted public launch artifacts", command: ["npm", "run", "--silent", "live-public-artifacts:verify"] },
  { id: "render-web-artifacts", label: "Verify Render static web artifacts before DNS cutover", command: ["npm", "run", "--silent", "live-web-artifacts:verify"], env: { UPLOADCHECK_LIVE_WEB_BASE_URL: "https://qcgenie-web.onrender.com" } },
  { id: "hosted-web-artifacts", label: "Verify hosted web launch artifacts", command: ["npm", "run", "--silent", "live-web-artifacts:verify"] },
  {
    id: "hosted-media-ingress",
    label: "Verify hosted Render media ingress",
    command: ["npm", "run", "--silent", "media-ingress:verify"],
    env: { UPLOADCHECK_MEDIA_INGRESS_BASE_URL: "https://qcgenie-api.onrender.com" },
    requiredEnv: ["UPLOADCHECK_API_KEY"],
    displayEnv: { UPLOADCHECK_API_KEY: "<private_bearer>" }
  },
  { id: "launch-status", label: "Verify launch status metadata", command: ["npm", "run", "--silent", "launch-status:verify"] },
  { id: "cost-basis", label: "Verify cost basis", command: ["npm", "run", "--silent", "cost-basis:verify"] },
  { id: "codex-install", label: "Verify Codex MCP install", command: ["npm", "run", "--silent", "codex:verify-install"] },
  { id: "roadmap", label: "Verify roadmap", command: ["npm", "run", "--silent", "roadmap:verify"] },
  { id: "launch-handoff", label: "Build live launch handoff", command: ["npm", "run", "--silent", "launch:handoff"] },
  { id: "readiness", label: "Check live Product Hunt readiness", command: ["npm", "run", "--silent", "readiness:check"] },
  { id: "launch-check", label: "Check live DNS and HTTP launch state", command: ["npm", "run", "--silent", "launch:check"] }
];

export function runLaunchDoctor({ steps = LAUNCH_DOCTOR_STEPS, runner = runCommand } = {}) {
  const results = [];
  for (const step of steps) {
    const result = runner(step.command, step);
    results.push({
      ...step,
      commandString: formatDoctorCommand(step),
      status: result.status,
      ok: result.status === 0,
      stdout: result.stdout || "",
      stderr: result.stderr || ""
    });
  }
  const blockers = results.filter((result) => !result.ok).map((result) => result.id);
  return {
    ok: results.every((result) => result.ok),
    status: blockers.length ? "blocked" : "ready",
    blockers,
    results
  };
}

export function launchDoctorCommandStrings(steps = LAUNCH_DOCTOR_STEPS) {
  return steps.map((step) => formatDoctorCommand(step));
}

export function formatLaunchDoctor(report) {
  const lines = [];
  lines.push(`UploadCheck launch doctor: ${report.ok ? "READY" : "NOT READY"}`);
  lines.push("");
  for (const result of report.results) {
    lines.push(`${result.ok ? "PASS" : "BLOCK"} ${result.id} - ${result.label}`);
    const output = firstMeaningfulLine(result.stdout || result.stderr);
    if (output) lines.push(`  ${output}`);
  }
  const blockers = report.blockers || report.results.filter((result) => !result.ok).map((result) => result.id);
  if (blockers.length) {
    lines.push("");
    lines.push(`Blockers: ${blockers.join(", ")}`);
  }
  return lines.join("\n");
}

function formatDoctorCommand(step) {
  const envPrefix = Object.entries({ ...(step.env || {}), ...(step.displayEnv || {}) })
    .map(([key, value]) => `${key}=${value}`)
    .join(" ");
  const command = normalizeCommand(step.command || []);
  return [envPrefix, command].filter(Boolean).join(" ");
}

function normalizeCommand(command) {
  if (command[0] === "npm" && command[1] === "run") {
    const script = command.filter((part) => part !== "--silent").slice(2).join(" ");
    return `npm run ${script}`;
  }
  return command.join(" ");
}

function runCommand(command, step = {}) {
  const missingEnv = (step.requiredEnv || []).filter((key) => !process.env[key]);
  if (missingEnv.length) {
    return {
      status: 1,
      stdout: [
        `${step.label || step.id || "Launch doctor step"}: NOT READY`,
        `Missing env: ${missingEnv.join(", ")}`,
        `command: ${formatDoctorCommand(step)}`
      ].join("\n"),
      stderr: ""
    };
  }
  const [cmd, ...args] = command;
  return spawnSync(cmd, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env, ...(step.env || {}) }
  });
}

function firstMeaningfulLine(output) {
  return String(output || "").split(/\r?\n/).map((line) => line.trim()).find(Boolean) || "";
}
