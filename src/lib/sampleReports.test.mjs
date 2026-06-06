import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

describe("public sample reports", () => {
  it("publishes clean, warning, and blocked report artifacts", () => {
    const index = readJson("public/sample-reports/index.json");

    expect(index.reports.map((report) => report.id)).toEqual([
      "clean-upload",
      "caption-warning",
      "duplicate-characters-block"
    ]);
    expect(index.reports.map((report) => report.verdict)).toEqual(["PASS", "WATCH", "BLOCK"]);
    for (const report of index.reports) {
      expect(report.url).toBe(`https://qcgenie-api.onrender.com/sample-reports/${report.id}.json`);
    }
  });

  it("keeps each report machine-readable with cost, source, artifacts, and repair-loop guidance", () => {
    for (const file of [
      "public/sample-reports/clean-upload.json",
      "public/sample-reports/caption-warning.json",
      "public/sample-reports/duplicate-characters-block.json"
    ]) {
      const report = readJson(file);

      expect(report.jobId).toMatch(/^sample_/);
      expect(["PASS", "WATCH", "BLOCK"]).toContain(report.verdict);
      expect(report.mediaIngress.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(report.costEstimate.targetGrossMarginPct).toBe(95);
      expect(report.costEstimate.estimatedCostPerMinuteCents ?? report.costEstimate.observedCostPerMinuteCents).toBeGreaterThan(0);
      expect(report.artifacts.some((artifact) => artifact.artifactType === "json_report")).toBe(true);
      expect(report.artifacts.some((artifact) => artifact.artifactType === "marker_export")).toBe(true);
      expect(report.repairLoop.nextAction).toContain(report.verdict === "PASS" ? "passed" : "Show");
    }
  });

  it("shows timestamped WATCH and BLOCK flags for editor handoff", () => {
    const watch = readJson("public/sample-reports/caption-warning.json");
    const block = readJson("public/sample-reports/duplicate-characters-block.json");

    expect(watch.flags[0]).toMatchObject({
      gate: "text_safe_area",
      severity: "warn",
      timestamp: "00:00:07",
      fixability: "agent_fixable"
    });
    expect(block.flags[0]).toMatchObject({
      gate: "twins",
      severity: "block",
      timestamp: "00:00:00",
      fixability: "source_or_render_required"
    });
    expect(block.flags[0].summary).toContain("more character variation");
  });

  it("links sample reports from public page, manifest, and llms metadata", () => {
    const html = readFileSync("public/sample-report/index.html", "utf8");
    const manifest = readJson("public/agent-manifest.json");
    const llms = readFileSync("public/llms.txt", "utf8");

    expect(html).toContain("/sample-reports/index.json");
    expect(html).toContain("/sample-reports/clean-upload.json");
    expect(html).toContain("/sample-reports/caption-warning.json");
    expect(html).toContain("/sample-reports/duplicate-characters-block.json");
    expect(manifest.sample_reports_url).toBe("https://qcgenie-api.onrender.com/sample-reports/index.json");
    expect(llms).toContain("https://qcgenie-api.onrender.com/sample-reports/index.json");
  });
});
