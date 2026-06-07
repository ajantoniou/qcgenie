import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  validateLlmsArtifact,
  validateMcpInstallArtifact,
  validatePublicArtifacts,
  validateSampleReportDetailsArtifact
} from "../../scripts/verify-live-public-artifacts.mjs";

function readJson(path) {
  return JSON.parse(readFileSync(resolve(path), "utf8"));
}

describe("live public artifacts verifier", () => {
  it("accepts the current public launch artifacts contract", () => {
    expect(validatePublicArtifacts({
      launchStatus: readJson("public/launch-status.json"),
      productHuntLaunchKit: readJson("public/product-hunt-launch-kit.json"),
      sampleReports: readJson("public/sample-reports/index.json"),
      sampleReportDetails: readSampleReportDetails(),
      mcpInstall: readJson("public/mcp-install.json"),
      llms: readFileSync(resolve("public/llms.txt"), "utf8")
    })).toEqual([]);
  });

  it("rejects stale static artifacts missing Product Hunt and sample-detail proof gates", () => {
    const launchStatus = readJson("public/launch-status.json");
    const productHuntLaunchKit = readJson("public/product-hunt-launch-kit.json");
    const sampleReports = readJson("public/sample-reports/index.json");
    const sampleReportDetails = readSampleReportDetails();
    const mcpInstall = readJson("public/mcp-install.json");
    const llms = readFileSync(resolve("public/llms.txt"), "utf8");

    launchStatus.operator_commands = launchStatus.operator_commands.filter((command) => command !== "npm run live-public-artifacts:verify");
    productHuntLaunchKit.ready_when.required_commands = productHuntLaunchKit.ready_when.required_commands.filter((command) => command !== "npm run live-public-artifacts:verify");
    sampleReports.reports = sampleReports.reports.filter((report) => report.verdict !== "BLOCK");
    sampleReportDetails["caption-warning"].repairLoop.nextAction = "Move caption upward.";

    expect(validatePublicArtifacts({
      launchStatus,
      productHuntLaunchKit,
      sampleReports,
      sampleReportDetails,
      mcpInstall,
      llms
    }).map((error) => error.reason)).toEqual(expect.arrayContaining([
      "missing_command",
      "missing_required_command",
      "missing_verdict",
      "missing_fix_now"
    ]));
  });

  it("rejects BLOCK sample details that no longer prove clone-crowd repair guidance", () => {
    const index = readJson("public/sample-reports/index.json");
    const details = readSampleReportDetails();
    details["duplicate-characters-block"].flags[0].gate = "canvas_fill";
    details["duplicate-characters-block"].flags[0].transcriptEvidence = "duplicate=true";

    expect(validateSampleReportDetailsArtifact(index, details).map((error) => error.reason)).toEqual(expect.arrayContaining([
      "bad_block_sample",
      "missing_clone_crowd_detail"
    ]));
  });

  it("rejects llms text missing internal AI boundary positioning", () => {
    const llms = readFileSync(resolve("public/llms.txt"), "utf8").replace("Internal AI helps improve the QC engine", "unlimited AI review");

    expect(validateLlmsArtifact(llms).map((error) => error.reason)).toContain("missing_text");
  });

  it("rejects MCP install artifacts that omit workspace API-key placeholders", () => {
    const install = readJson("public/mcp-install.json");
    install.environment.UPLOADCHECK_API_KEY = "";
    install.claude_desktop.json.mcpServers.uploadcheck.env.UPLOADCHECK_API_KEY = "";

    expect(validateMcpInstallArtifact(install).map((error) => error.reason)).toEqual(expect.arrayContaining([
      "missing_workspace_key_placeholder",
      "missing_claude_workspace_key_placeholder"
    ]));
  });
});

function readSampleReportDetails() {
  return {
    "clean-upload": readJson("public/sample-reports/clean-upload.json"),
    "caption-warning": readJson("public/sample-reports/caption-warning.json"),
    "duplicate-characters-block": readJson("public/sample-reports/duplicate-characters-block.json")
  };
}
