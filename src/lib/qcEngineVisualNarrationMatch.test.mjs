import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";

const python = process.env.PYTHON || "python3";
const checker = resolve("scripts/qc-engine/check_visual_narration_match.py");
const gate = resolve("scripts/qc-engine/run_gate.py");

describe("check_visual_narration_match.py", () => {
  it("blocks manifest rows where required visual subjects are missing", () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-visual-narration-"));
    try {
      const media = join(dir, "video.mp4");
      const manifest = join(dir, "manifest.json");
      const out = join(dir, "visual_narration_match.json");
      writeFileSync(media, "fake");
      writeFileSync(manifest, JSON.stringify({
        scenes: [
          {
            t_start: 12,
            t_end: 18,
            narration: "Paul writes from prison about the letter to Philemon.",
            visual_description: "Generic desert walking shot with warm dust.",
            required_visual_keywords: ["Paul", "letter", "prison"]
          }
        ]
      }));

      expect(() => execFileSync(python, [checker, media, "--manifest", manifest, "--json", out], { encoding: "utf8" })).toThrow();
      const result = JSON.parse(readFileSync(out, "utf8"));
      expect(result).toMatchObject({ check: "visual_narration_match", pass: false });
      expect(result.findings[0]).toMatchObject({
        label: "VISUAL_NARRATION_MISMATCH",
        t_start: 12,
        t_end: 18
      });
      expect(result.findings[0].missing_visual_terms).toEqual(["Paul", "letter", "prison"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("passes rows explicitly marked as supporting the narration", () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-visual-narration-pass-"));
    try {
      const media = join(dir, "video.mp4");
      const manifest = join(dir, "manifest.json");
      writeFileSync(media, "fake");
      writeFileSync(manifest, JSON.stringify({
        scenes: [
          {
            narration: "A map traces the journey into Galilee.",
            visual_description: "Map of Galilee with the journey route highlighted.",
            visual_supports_narration: true,
            required_visual_keywords: ["map", "Galilee"]
          }
        ]
      }));

      const output = execFileSync(python, [checker, media, "--manifest", manifest], { encoding: "utf8" });
      const result = JSON.parse(output);
      expect(result).toMatchObject({ check: "visual_narration_match", pass: true, manifest_entries: 1 });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("is part of the deterministic gate and removed neither by default nor deterministic-only", () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-visual-narration-gate-"));
    try {
      const media = join(dir, "video.mp4");
      const manifest = join(dir, "manifest.json");
      const outDir = join(dir, "gate");
      writeFileSync(media, "fake");
      writeFileSync(manifest, JSON.stringify({
        rows: [
          {
            narration: "The chart shows sponsor revenue dropping.",
            visual_description: "A lifestyle montage of coffee and a keyboard.",
            visual_supports_narration: false
          }
        ]
      }));

      expect(() => execFileSync(python, [
        gate,
        media,
        "--checks",
        "visual_narration_match,narration_match",
        "--deterministic-only",
        "--manifest",
        manifest,
        "--out",
        outDir
      ], { encoding: "utf8" })).toThrow();
      const verdict = JSON.parse(readFileSync(join(outDir, "VERDICT.json"), "utf8"));
      expect(verdict.blocked).toEqual(["visual_narration_match"]);
      expect(verdict.effective_checks).toEqual(["visual_narration_match"]);
      expect(verdict.paid_oracle_checks_removed).toEqual(["narration_match"]);
      expect(verdict.per_check.visual_narration_match.findings[0].label).toBe("VISUAL_NARRATION_MISMATCH");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
