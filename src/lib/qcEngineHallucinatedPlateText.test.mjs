import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const checker = resolve("scripts/qc-engine/check_hallucinated_plate_text.py");
const runner = resolve("scripts/qc-engine/run_gate.py");
const hasTesseract = spawnSync("sh", ["-c", "command -v tesseract >/dev/null 2>&1"]).status === 0;
const ocrIt = hasTesseract ? it : it.skip;

function generatePlate(path, withText = true) {
  const script = `
from PIL import Image, ImageDraw, ImageFont
import sys
path, with_text = sys.argv[1], sys.argv[2] == "true"
img = Image.new('RGB', (1280, 720), (46, 36, 25))
draw = ImageDraw.Draw(img)
draw.rectangle((0, 0, 1280, 720), fill=(72, 58, 40))
draw.ellipse((160, 160, 1180, 620), fill=(92, 78, 55))
if with_text:
    font = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf', 88)
    draw.text((220, 285), 'THE ANNUNCIATION', font=font, fill=(245, 238, 210))
img.save(path)
`;
  const result = spawnSync("python3", ["-c", script, path, String(withText)], { cwd: resolve("."), encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
}

describe("check_hallucinated_plate_text.py", () => {
  ocrIt("blocks readable text on an unapproved generated/library plate", () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-htext-"));
    const image = join(dir, "plate.jpg");
    const json = join(dir, "htext.json");

    try {
      generatePlate(image, true);
      const result = spawnSync("python3", [checker, image, "--json", json], { cwd: resolve("."), encoding: "utf8" });
      const payload = JSON.parse(readFileSync(json, "utf8"));

      expect(result.status).toBe(1);
      expect(payload.pass).toBe(false);
      expect(payload.findings[0]).toMatchObject({
        label: "UNAPPROVED_PLATE_TEXT"
      });
      expect(payload.findings[0].words.map((word) => word.text).join(" ")).toContain("ANNUNCIATION");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  ocrIt("allows readable text when the manifest marks the plate as an approved source card", () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-htext-"));
    const image = join(dir, "plate.jpg");
    const manifest = join(dir, "manifest.json");

    try {
      generatePlate(image, true);
      writeFileSync(manifest, JSON.stringify({
        beats: [{
          visual_file: image,
          visual_class: "Remotion source card",
          approved_text: true
        }]
      }));
      const result = spawnSync("python3", [checker, image, "--manifest", manifest], { cwd: resolve("."), encoding: "utf8" });
      const payload = JSON.parse(result.stdout);

      expect(result.status).toBe(0);
      expect(payload.pass).toBe(true);
      expect(payload.findings).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  ocrIt("is wired through run_gate.py", () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-htext-gate-"));
    const image = join(dir, "plate.jpg");
    const out = join(dir, "gate");

    try {
      generatePlate(image, true);
      const result = spawnSync("python3", [
        runner,
        image,
        "--checks",
        "hallucinated_plate_text",
        "--out",
        out
      ], { cwd: resolve("."), encoding: "utf8" });
      const verdict = JSON.parse(readFileSync(join(out, "VERDICT.json"), "utf8"));

      expect(result.status).toBe(1);
      expect(verdict.verdict).toBe("BLOCK");
      expect(verdict.blocked).toEqual(["hallucinated_plate_text"]);
      expect(verdict.per_check.hallucinated_plate_text.findings[0].label).toBe("UNAPPROVED_PLATE_TEXT");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  ocrIt("blocks when a media path cannot be decoded into frames", () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-htext-invalid-"));
    const mediaPath = join(dir, "plate.jpg");
    const json = join(dir, "htext.json");

    try {
      writeFileSync(mediaPath, "not-a-real-image");
      const result = spawnSync("python3", [checker, mediaPath, "--json", json], { cwd: resolve("."), encoding: "utf8" });
      const payload = JSON.parse(readFileSync(json, "utf8"));

      expect(result.status).toBe(1);
      expect(payload.pass).toBe(false);
      expect(payload.findings[0]).toMatchObject({
        label: "PLATE_TEXT_DECODE_FAILED"
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
