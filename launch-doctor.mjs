import { spawnSync } from "node:child_process";

export const LAUNCH_DOCTOR_STEPS = [
  { id: "dns-records", label: "Print DNS cutover records", command: ["npm", "run", "--silent", "launch:dns"] },
  { id: "checkout", label: "Check checkout configuration", command: ["npm", "run", "--silent", "launch:checkout"] },
  { id: "checkout-probe", label: "Probe live checkout reachability", command: ["npm", "run", "--silent", "launch:checkout"], env: { UPLOADCHECK_CHECKOUT_PROBE: "1" } },
  { id: "storage", label: "Check persistence and storage configuration", command: ["npm", "run", "--silent", "launch:storage"] },
  { id: "storage-probe", label: "Probe writable durable storage", command: ["npm", "run", "--silent", "launch:storage"], env: { UPLOADCHECK_STORAGE_PROBE: "1" } },
  { id: "render-config", label: "Verify Render blueprint", command: ["npm", "run", "--silent", "render:verify"] },
  { id: "launch-status", label: "Verify launch status metadata", command: ["npm", "run", "--silent", "launch-status:verify"] },
  { id: "cost-basis", label: "Verify cost basis", command: ["npm", "run", "--silent", "cost-basis:verify"] },
  { id: "codex-install", label: "Verify Codex MCP install", command: ["npm", "run", "--silent", "codex:verify-install"] },
  { id: "roadmap", label: "Verify roadmap", command: ["npm", "run", "--silent", "roadmap:verify"] },
  { id: "readiness", label: "Check live Product Hunt readiness", command: ["npm", "run", "--silent", "readiness:check"] },
  { id: "launch-check", label: "Check live DNS and HTTP launch state", command: ["npm", "run", "--silent", "launch:check"] }
];

export function runLaunchDoctor({ steps = LAUNCH_DOCTOR_STEPS, runner = runCommand } = {}) {
  const results = [];
  for (const step of steps) {
    const result = runner(step.command, step);
    results.push({
      ...step,
      status: result.status,
      ok: result.status === 0,
      stdout: result.stdout || "",
      stderr: result.stderr || ""
    });
  }
  return {
    ok: results.every((result) => result.ok),
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
  const blockers = report.results.filter((result) => !result.ok).map((result) => result.id);
  if (blockers.length) {
    lines.push("");
    lines.push(`Blockers: ${blockers.join(", ")}`);
  }
  return lines.join("\n");
}

function formatDoctorCommand(step) {
  const envPrefix = Object.entries(step.env || {})
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
