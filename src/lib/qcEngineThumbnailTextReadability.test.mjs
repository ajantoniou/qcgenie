import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const checker = resolve("scripts/qc-engine/check_thumbnail_text_readability.py");
const runner = resolve("scripts/qc-engine/run_gate.py");
const hasTesseract = spawnSync("sh", ["-c", "command -v tesseract >/dev/null 2>&1"]).status === 0;
const ocrIt = hasTesseract ? it : it.skip;

function generateThumbnail(path, mode) {
  const script = `
from PIL import Image, ImageDraw, ImageFont
import sys
path, mode = sys.argv[1], sys.argv[2]
font = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf', 90)
if mode == 'low':
    img = Image.new('RGB', (1280, 720), (60, 60, 60))
    fill = (88, 88, 88)
    pos = (130, 250)
    text = 'BURIED TRUTH'
elif mode == 'edge':
    img = Image.new('RGB', (1280, 720), (20, 20, 20))
    fill = (255, 255, 255)
    pos = (0, 260)
    text = 'EDGE TEXT'
else:
    img = Image.new('RGB', (1280, 720), (20, 20, 20))
    fill = (255, 255, 255)
    pos = (220, 260)
    text = 'CLEAR TEXT'
draw = ImageDraw.Draw(img)
draw.text(pos, text, font=font, fill=fill)
img.save(path)
`;
  const result = spawnSync("python3", ["-c", script, path, mode], { cwd: resolve("."), encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
}

describe("check_thumbnail_text_readability.py", () => {
  ocrIt("blocks low-contrast thumbnail text", () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-thumb-"));
    const image = join(dir, "thumbnail.jpg");
    const json = join(dir, "thumb.json");

    try {
      generateThumbnail(image, "low");
      const result = spawnSync("python3", [checker, image, "--json", json], { cwd: resolve("."), encoding: "utf8" });
      const payload = JSON.parse(readFileSync(json, "utf8"));

      expect(result.status).toBe(1);
      expect(payload.pass).toBe(false);
      expect(payload.findings[0]).toMatchObject({
        label: "THUMBNAIL_LOW_CONTRAST_TEXT"
      });
      expect(payload.findings[0].words.map((word) => word.text).join(" ")).toContain("BURIED");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  ocrIt("blocks thumbnail text too close to the edge", () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-thumb-"));
    const image = join(dir, "thumbnail.jpg");

    try {
      generateThumbnail(image, "edge");
      const result = spawnSync("python3", [checker, image], { cwd: resolve("."), encoding: "utf8" });
      const payload = JSON.parse(result.stdout);

      expect(result.status).toBe(1);
      expect(payload.findings[0]).toMatchObject({
        label: "THUMBNAIL_TEXT_UNSAFE_AREA"
      });
      expect(payload.findings[0].action).toContain("Move thumbnail text inward");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  ocrIt("passes readable thumbnail text", () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-thumb-"));
    const image = join(dir, "thumbnail.jpg");

    try {
      generateThumbnail(image, "clean");
      const result = spawnSync("python3", [checker, image], { cwd: resolve("."), encoding: "utf8" });
      const payload = JSON.parse(result.stdout);

      expect(result.status).toBe(0);
      expect(payload.pass).toBe(true);
      expect(payload.findings).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  ocrIt("is wired through run_gate.py", () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-thumb-gate-"));
    const image = join(dir, "thumbnail.jpg");
    const out = join(dir, "gate");

    try {
      generateThumbnail(image, "low");
      const result = spawnSync("python3", [
        runner,
        image,
        "--checks",
        "thumbnail_text_readability",
        "--out",
        out
      ], { cwd: resolve("."), encoding: "utf8" });
      const verdict = JSON.parse(readFileSync(join(out, "VERDICT.json"), "utf8"));

      expect(result.status).toBe(1);
      expect(verdict.verdict).toBe("BLOCK");
      expect(verdict.blocked).toEqual(["thumbnail_text_readability"]);
      expect(verdict.per_check.thumbnail_text_readability.findings[0].label).toBe("THUMBNAIL_LOW_CONTRAST_TEXT");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
