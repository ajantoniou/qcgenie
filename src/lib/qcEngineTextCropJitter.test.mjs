import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

function writeManifest(dir, rows) {
  const path = join(dir, "manifest.json");
  writeFileSync(path, JSON.stringify({ timeline: rows }, null, 2));
  return path;
}

function runChecker(mediaPath, manifestPath, jsonPath) {
  return spawnSync("python3", [
    resolve("scripts/qc-engine/check_text_crop_jitter.py"),
    mediaPath,
    "--manifest",
    manifestPath,
    "--json",
    jsonPath
  ], { cwd: resolve("."), encoding: "utf8" });
}

describe("check_text_crop_jitter.py", () => {
  it("blocks text cards explicitly marked cropped, overlapping, or jittering", () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-text-crop-"));
    const mediaPath = join(dir, "short.mp4");
    const jsonPath = join(dir, "text-crop.json");
    const manifestPath = writeManifest(dir, [{
      start: 12,
      end: 18,
      visual_type: "text card",
      text: "Jesus Intentionally Left Behind",
      text_cropped: true,
      notes: "text overlaps and jitters on the card",
      visual_file: "cards/punch-1.mp4"
    }]);

    try {
      writeFileSync(mediaPath, "");
      const result = runChecker(mediaPath, manifestPath, jsonPath);
      const payload = JSON.parse(readFileSync(jsonPath, "utf8"));

      expect(result.status).toBe(1);
      expect(payload).toMatchObject({
        check: "text_crop_jitter",
        pass: false,
        text_card_entries: 1
      });
      expect(payload.findings[0]).toMatchObject({
        label: "TEXT_CROP_JITTER",
        t_start: 12,
        t_end: 18,
        visual_file: "cards/punch-1.mp4"
      });
      expect(payload.findings[0].action).toContain("Reflow the text card");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("blocks supplied text boxes that touch the frame edge", () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-text-crop-"));
    const mediaPath = join(dir, "short.mp4");
    const jsonPath = join(dir, "text-crop.json");
    const manifestPath = writeManifest(dir, [{
      start_s: 30,
      duration_s: 5,
      visual_type: "footer card",
      text: "Full episode @NewTestamentOnly",
      frame_width: 1080,
      frame_height: 1920,
      text_box: { left: 980, top: 120, right: 1075, bottom: 210 }
    }]);

    try {
      writeFileSync(mediaPath, "");
      const result = runChecker(mediaPath, manifestPath, jsonPath);
      const payload = JSON.parse(readFileSync(jsonPath, "utf8"));

      expect(result.status).toBe(1);
      expect(payload.findings[0]).toMatchObject({
        label: "TEXT_CROP_JITTER",
        t_start: 30,
        t_end: 35,
        text_box: [980, 120, 1075, 210],
        frame: [1080, 1920]
      });
      expect(payload.findings[0].reason).toContain("bounding box touches");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("allows centered text cards without crop or jitter markers", () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-text-crop-"));
    const mediaPath = join(dir, "short.mp4");
    const jsonPath = join(dir, "text-crop.json");
    const manifestPath = writeManifest(dir, [{
      start: 0,
      end: 3,
      visual_class: "hook text card",
      text: "What if mercy was the point?",
      frame_width: 1080,
      frame_height: 1920,
      text_box: [160, 500, 920, 760]
    }]);

    try {
      writeFileSync(mediaPath, "");
      const result = runChecker(mediaPath, manifestPath, jsonPath);
      const payload = JSON.parse(readFileSync(jsonPath, "utf8"));

      expect(result.status).toBe(0);
      expect(payload).toMatchObject({
        check: "text_crop_jitter",
        pass: true,
        text_card_entries: 1
      });
      expect(payload.findings).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("is wired through run_gate.py with manifest sidecars", () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-text-crop-gate-"));
    const mediaPath = join(dir, "short.mp4");
    const outDir = join(dir, "gate");
    const manifestPath = writeManifest(dir, [{
      start: 8,
      end: 12,
      visual_type: "text card",
      text: "What you bring forth",
      edge_to_edge_text: true
    }]);

    try {
      writeFileSync(mediaPath, "");
      const result = spawnSync("python3", [
        resolve("scripts/qc-engine/run_gate.py"),
        mediaPath,
        "--checks",
        "text_crop_jitter",
        "--manifest",
        manifestPath,
        "--out",
        outDir
      ], { cwd: resolve("."), encoding: "utf8" });
      const verdict = JSON.parse(readFileSync(join(outDir, "VERDICT.json"), "utf8"));

      expect(result.status).toBe(1);
      expect(verdict.verdict).toBe("BLOCK");
      expect(verdict.blocked).toEqual(["text_crop_jitter"]);
      expect(verdict.per_check.text_crop_jitter.findings[0].label).toBe("TEXT_CROP_JITTER");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
