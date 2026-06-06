import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const checker = resolve("scripts/qc-engine/check_clean_segment_source_scrub.py");
const runner = resolve("scripts/qc-engine/run_gate.py");
const hasTesseract = spawnSync("sh", ["-c", "command -v tesseract >/dev/null 2>&1"]).status === 0;
const ocrIt = hasTesseract ? it : it.skip;

function generateSourceFrame(path, withText = true) {
  const script = `
from PIL import Image, ImageDraw, ImageFont
import sys
path, with_text = sys.argv[1], sys.argv[2] == "true"
img = Image.new('RGB', (1280, 720), (12, 12, 12))
draw = ImageDraw.Draw(img)
draw.rectangle((80, 80, 1200, 640), outline=(210, 210, 190), width=8)
if with_text:
    font = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf', 90)
    draw.text((220, 285), 'THE ANNUNCIATION', font=font, fill=(245, 238, 210))
img.save(path)
`;
  const result = spawnSync("python3", ["-c", script, path, String(withText)], { cwd: resolve("."), encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
}

describe("check_clean_segment_source_scrub.py", () => {
  it("blocks manifest rows labeled as unsafe source segments", () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-cleanseg-"));
    const media = join(dir, "source.jpg");
    const manifest = join(dir, "manifest.json");

    try {
      generateSourceFrame(media, false);
      writeFileSync(manifest, JSON.stringify({
        beats: [{
          t_start: 42,
          visual_file: "clips-broll-yt/kok-full-movie.mp4",
          source_qc: "wrong_region pyramid intertitle",
          notes: "Egyptian pyramid frames adjacent to a teaching VO"
        }]
      }));
      const result = spawnSync("python3", [checker, media, "--manifest", manifest], { cwd: resolve("."), encoding: "utf8" });
      const payload = JSON.parse(result.stdout);

      expect(result.status).toBe(1);
      expect(payload.pass).toBe(false);
      expect(payload.findings[0]).toMatchObject({
        label: "UNCLEAN_SOURCE_SEGMENT",
        visual_file: "clips-broll-yt/kok-full-movie.mp4"
      });
      expect(payload.findings[0].matched_terms).toContain("pyramid");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("passes manifest rows marked as scrubbed clean segments", () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-cleanseg-"));
    const media = join(dir, "source.jpg");
    const manifest = join(dir, "manifest.json");

    try {
      generateSourceFrame(media, false);
      writeFileSync(manifest, JSON.stringify({
        beats: [{
          visual_file: "clips-broll-yt/clean-segment-014.mp4",
          source_scrubbed: true,
          notes: "verified clean source segment"
        }]
      }));
      const result = spawnSync("python3", [checker, media, "--manifest", manifest], { cwd: resolve("."), encoding: "utf8" });
      const payload = JSON.parse(result.stdout);

      expect(result.status).toBe(0);
      expect(payload.pass).toBe(true);
      expect(payload.findings).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  ocrIt("blocks OCR-visible intertitle text when no manifest is supplied", () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-cleanseg-"));
    const media = join(dir, "source.jpg");

    try {
      generateSourceFrame(media, true);
      const result = spawnSync("python3", [checker, media], { cwd: resolve("."), encoding: "utf8" });
      const payload = JSON.parse(result.stdout);

      expect(result.status).toBe(1);
      expect(payload.findings[0]).toMatchObject({
        label: "SOURCE_TEXT_OR_INTERTITLE"
      });
      expect(payload.findings[0].words.map((word) => word.text).join(" ")).toContain("ANNUNCIATION");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("is wired through run_gate.py with manifest evidence", () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-cleanseg-gate-"));
    const media = join(dir, "source.jpg");
    const manifest = join(dir, "manifest.json");
    const out = join(dir, "gate");

    try {
      generateSourceFrame(media, false);
      writeFileSync(manifest, JSON.stringify({
        beats: [{
          visual_file: "clips-broll-yt/kok-full-movie.mp4",
          source_qc: "wedding dancing banquet"
        }]
      }));
      const result = spawnSync("python3", [
        runner,
        media,
        "--checks",
        "clean_segment_source_scrub",
        "--manifest",
        manifest,
        "--out",
        out
      ], { cwd: resolve("."), encoding: "utf8" });
      const verdict = JSON.parse(readFileSync(join(out, "VERDICT.json"), "utf8"));

      expect(result.status).toBe(1);
      expect(verdict.verdict).toBe("BLOCK");
      expect(verdict.blocked).toEqual(["clean_segment_source_scrub"]);
      expect(verdict.per_check.clean_segment_source_scrub.findings[0].label).toBe("UNCLEAN_SOURCE_SEGMENT");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
