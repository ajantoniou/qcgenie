import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

function writeManifest(dir, name, rows) {
  const path = join(dir, name);
  writeFileSync(path, JSON.stringify({ timeline: rows }, null, 2));
  return path;
}

function runChecker(mediaPath, manifestPath, jsonPath) {
  return spawnSync("python3", [
    resolve("scripts/qc-engine/check_static_head_dominance.py"),
    mediaPath,
    "--manifest",
    manifestPath,
    "--json",
    jsonPath
  ], { cwd: resolve("."), encoding: "utf8" });
}

describe("check_static_head_dominance.py", () => {
  it("blocks long static portrait/talking-head manifest rows", () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-static-head-"));
    const mediaPath = join(dir, "master.mp4");
    const jsonPath = join(dir, "static-head.json");
    const manifestPath = writeManifest(dir, "manifest.json", [{
      t_start: 10,
      duration: 24,
      visual_class: "portrait",
      motion: "subtle drift",
      visual_file: "james-closeup.mp4"
    }]);

    try {
      writeFileSync(mediaPath, "");
      const result = runChecker(mediaPath, manifestPath, jsonPath);
      const payload = JSON.parse(readFileSync(jsonPath, "utf8"));

      expect(result.status).toBe(1);
      expect(payload).toMatchObject({
        check: "static_head_dominance",
        pass: false,
        manifest_entries: 1
      });
      expect(payload.findings[0]).toMatchObject({
        label: "STATIC_HEAD_DOMINANCE",
        t_start: 10,
        duration: 24,
        visual_file: "james-closeup.mp4",
        visual_class: "portrait"
      });
      expect(payload.findings[0].action).toContain("Insert b-roll");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("allows source cards, visible action, and explicit static approval", () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-static-head-"));
    const mediaPath = join(dir, "master.mp4");
    const jsonPath = join(dir, "static-head.json");
    const manifestPath = writeManifest(dir, "manifest.json", [
      { t_start: 0, duration: 35, visual_class: "remotion", purpose: "source card" },
      { t_start: 40, duration: 30, visual_class: "broll", motion: "walking action" },
      { t_start: 80, duration: 45, visual_class: "portrait", founder_approved: true }
    ]);

    try {
      writeFileSync(mediaPath, "");
      const result = runChecker(mediaPath, manifestPath, jsonPath);
      const payload = JSON.parse(readFileSync(jsonPath, "utf8"));

      expect(result.status).toBe(0);
      expect(payload).toMatchObject({
        check: "static_head_dominance",
        pass: true,
        manifest_entries: 3
      });
      expect(payload.findings).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("is wired through run_gate.py with manifest sidecars", () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-static-head-gate-"));
    const mediaPath = join(dir, "master.mp4");
    const outDir = join(dir, "gate");
    const manifestPath = writeManifest(dir, "manifest.json", [{
      start: 5,
      end: 31,
      shot_type: "single-character close-up",
      movement: "still image drift",
      file: "miriam-portrait.mp4"
    }]);

    try {
      writeFileSync(mediaPath, "");
      const result = spawnSync("python3", [
        resolve("scripts/qc-engine/run_gate.py"),
        mediaPath,
        "--checks",
        "static_head_dominance",
        "--manifest",
        manifestPath,
        "--out",
        outDir
      ], { cwd: resolve("."), encoding: "utf8" });
      const verdict = JSON.parse(readFileSync(join(outDir, "VERDICT.json"), "utf8"));

      expect(result.status).toBe(1);
      expect(verdict.verdict).toBe("BLOCK");
      expect(verdict.blocked).toEqual(["static_head_dominance"]);
      expect(verdict.per_check.static_head_dominance.findings[0].label).toBe("STATIC_HEAD_DOMINANCE");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
