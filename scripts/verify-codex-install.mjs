#!/usr/bin/env node
import { accessSync, readFileSync, statSync } from "node:fs";
import { constants } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const THIS_FILE = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(THIS_FILE), "..");
const DEFAULT_CONFIG_PATH = resolve(homedir(), ".codex/config.toml");
const DEFAULT_SKILL_PATH = resolve(homedir(), ".codex/skills/uploadcheck/SKILL.md");
const EXPECTED_COMMAND = resolve(REPO_ROOT, "mcp-server/run-uploadcheck-mcp.sh");
const EXPECTED_API_BASE_URL = "https://qcgenie-api.onrender.com";

export function verifyCodexInstall({
  configPath = process.env.UPLOADCHECK_CODEX_CONFIG_PATH || DEFAULT_CONFIG_PATH,
  skillPath = process.env.UPLOADCHECK_CODEX_SKILL_PATH || DEFAULT_SKILL_PATH,
  expectedCommand = process.env.UPLOADCHECK_EXPECTED_MCP_COMMAND || EXPECTED_COMMAND,
  expectedApiBaseUrl = process.env.UPLOADCHECK_EXPECTED_API_BASE_URL || EXPECTED_API_BASE_URL
} = {}) {
  const errors = [];
  const warnings = [];
  const configText = readFile(configPath, errors, "Codex config");
  const skillText = readFile(skillPath, errors, "UploadCheck skill");

  const serverSection = configText ? extractTomlSection(configText, "mcp_servers.uploadcheck") : "";
  const envSection = configText ? extractTomlSection(configText, "mcp_servers.uploadcheck.env") : "";
  if (!serverSection) {
    errors.push({ key: "mcp_servers.uploadcheck", reason: "missing", detail: "Add a global Codex MCP server named uploadcheck." });
  }
  if (!envSection) {
    errors.push({ key: "mcp_servers.uploadcheck.env", reason: "missing", detail: "Set UPLOADCHECK_API_BASE_URL for the uploadcheck MCP server." });
  }

  const command = tomlStringValue(serverSection, "command");
  const apiBaseUrl = tomlStringValue(envSection, "UPLOADCHECK_API_BASE_URL");
  if (command !== expectedCommand) {
    errors.push({
      key: "mcp_servers.uploadcheck.command",
      reason: "wrong_command",
      detail: `Expected ${expectedCommand}; found ${command || "<missing>"}.`
    });
  }
  if (apiBaseUrl !== expectedApiBaseUrl) {
    errors.push({
      key: "mcp_servers.uploadcheck.env.UPLOADCHECK_API_BASE_URL",
      reason: "wrong_api_base",
      detail: `Expected ${expectedApiBaseUrl}; found ${apiBaseUrl || "<missing>"}.`
    });
  }

  if (expectedCommand) {
    try {
      accessSync(expectedCommand, constants.X_OK);
    } catch {
      errors.push({
        key: "mcp_server_wrapper",
        reason: "not_executable",
        detail: `Expected MCP wrapper to exist and be executable at ${expectedCommand}.`
      });
    }
  }

  if (skillText) {
    const requiredSkillMarkers = [
      "name: uploadcheck",
      "MCP server: `uploadcheck`",
      "qc_get_launch_status",
      "qc_estimate_cost",
      "qc_run_local_file",
      "qc_get_marker_csv",
      "At `$99 / 5,000` minutes",
      "Checked minutes mean deterministic pre-upload QC minutes",
      "0.0157",
      "UPLOADCHECK_MEDIA_INGRESS_BASE_URL=https://qcgenie-api.onrender.com"
    ];
    for (const marker of requiredSkillMarkers) {
      if (!skillText.includes(marker)) {
        errors.push({ key: "skill.uploadcheck", reason: "missing_marker", detail: `Skill is missing required marker: ${marker}` });
      }
    }
    if (!skillText.includes("watchlist JSON")) {
      warnings.push({ key: "skill.uploadcheck", reason: "watchlist_guidance_missing", detail: "Skill should mention watchlist sidecars for pronunciation checks." });
    }
  }

  return {
    ok: errors.length === 0,
    configPath,
    skillPath,
    expectedCommand,
    expectedApiBaseUrl,
    server: {
      configured: Boolean(serverSection),
      command,
      startupTimeoutSec: Number(tomlStringValue(serverSection, "startup_timeout_sec") || tomlNumberValue(serverSection, "startup_timeout_sec") || 0) || null,
      commandExecutable: isExecutable(expectedCommand)
    },
    env: {
      apiBaseUrl
    },
    skill: {
      installed: Boolean(skillText),
      bytes: skillText ? Buffer.byteLength(skillText) : 0
    },
    errors,
    warnings
  };
}

function readFile(path, errors, label) {
  try {
    return readFileSync(path, "utf8");
  } catch {
    errors.push({ key: label.toLowerCase().replaceAll(" ", "_"), reason: "missing", detail: `${label} not found at ${path}.` });
    return "";
  }
}

function extractTomlSection(text, sectionName) {
  const lines = text.split(/\r?\n/);
  const header = `[${sectionName}]`;
  const start = lines.findIndex((line) => line.trim() === header);
  if (start < 0) return "";
  const out = [];
  for (const line of lines.slice(start + 1)) {
    if (/^\s*\[[^\]]+\]\s*$/.test(line)) break;
    out.push(line);
  }
  return out.join("\n");
}

function tomlStringValue(section, key) {
  const match = section.match(new RegExp(`^\\s*${escapeRegex(key)}\\s*=\\s*"([^"]*)"\\s*$`, "m"));
  return match?.[1] || "";
}

function tomlNumberValue(section, key) {
  const match = section.match(new RegExp(`^\\s*${escapeRegex(key)}\\s*=\\s*(\\d+)\\s*$`, "m"));
  return match?.[1] || "";
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isExecutable(path) {
  try {
    const stat = statSync(path);
    accessSync(path, constants.X_OK);
    return stat.isFile();
  } catch {
    return false;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === THIS_FILE) {
  const result = verifyCodexInstall();
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}
