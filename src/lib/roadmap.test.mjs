import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { verifyRoadmap } from "../../scripts/verify-roadmap.mjs";

function readText(path) {
  return readFileSync(resolve(path), "utf8");
}

describe("product roadmap verifier", () => {
  it("verifies the 50-point plan, expert panel, NTO addendum, and execution markers", () => {
    const output = execFileSync("npm", ["run", "--silent", "roadmap:verify"], {
      cwd: resolve("."),
      encoding: "utf8"
    });
    const result = JSON.parse(output);

    expect(result.ok).toBe(true);
    expect(result.planItemCount).toBe(50);
    expect(result.planNumbers).toEqual(Array.from({ length: 50 }, (_, index) => index + 1));
    expect(result.expertMarkerCount).toBe(11);
    expect(result.ntoTaskCount).toBeGreaterThanOrEqual(30);
  });

  it("fails when the 50-point roadmap sequence drifts", () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-roadmap-"));
    const path = join(dir, "PRODUCT-ROADMAP.md");

    try {
      const roadmap = readText("docs/PRODUCT-ROADMAP.md").replace(
        "\n50. Run a Product Hunt launch checklist only after cost telemetry proves the plan can hold margin.",
        "\n51. Run a Product Hunt launch checklist only after cost telemetry proves the plan can hold margin."
      );
      writeFileSync(path, roadmap);

      const result = verifyRoadmap({ roadmapPath: path });

      expect(result.ok).toBe(false);
      expect(result.errors.map((error) => error.reason)).toContain("wrong_sequence");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
