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
    resolve("scripts/qc-engine/check_rehook_cadence.py"),
    mediaPath,
    "--manifest",
    manifestPath,
    "--json",
    jsonPath
  ], { cwd: resolve("."), encoding: "utf8" });
}

describe("check_rehook_cadence.py", () => {
  it("blocks gaps over 90 seconds without a pattern interrupt", () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-rehook-"));
    const mediaPath = join(dir, "master.mp4");
    const jsonPath = join(dir, "rehook.json");
    const manifestPath = writeManifest(dir, "manifest.json", [
      { t_start: 0, t_end: 45, visual_class: "broll" },
      { t_start: 45, t_end: 95, visual_class: "broll" }
    ]);

    try {
      writeFileSync(mediaPath, "");
      const result = runChecker(mediaPath, manifestPath, jsonPath);
      const payload = JSON.parse(readFileSync(jsonPath, "utf8"));

      expect(result.status).toBe(1);
      expect(payload).toMatchObject({
        check: "rehook_cadence",
        pass: false,
        max_gap_seconds: 90
      });
      expect(payload.findings[0]).toMatchObject({
        label: "REHOOK_CADENCE",
        t_start: 0,
        t_end: 95,
        duration: 95
      });
      expect(payload.findings[0].action).toContain("pattern interrupt");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("allows explicit re-hooks, chapter turns, and visual resets inside the cadence window", () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-rehook-"));
    const mediaPath = join(dir, "master.mp4");
    const jsonPath = join(dir, "rehook.json");
    const manifestPath = writeManifest(dir, "manifest.json", [
      { start: 0, end: 50, visual_class: "broll" },
      { start: 50, end: 60, visual_class: "source card", chapter_turn: true, text: "But here is the twist." },
      { start: 60, end: 130, visual_class: "broll" },
      { start: 130, end: 136, visual_class: "graphic", pattern_interrupt: true },
      { start: 136, end: 200, visual_class: "broll" }
    ]);

    try {
      writeFileSync(mediaPath, "");
      const result = runChecker(mediaPath, manifestPath, jsonPath);
      const payload = JSON.parse(readFileSync(jsonPath, "utf8"));

      expect(result.status).toBe(0);
      expect(payload).toMatchObject({
        check: "rehook_cadence",
        pass: true,
        manifest_entries: 5
      });
      expect(payload.findings).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("is wired through run_gate.py with manifest sidecars", () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-rehook-gate-"));
    const mediaPath = join(dir, "master.mp4");
    const outDir = join(dir, "gate");
    const manifestPath = writeManifest(dir, "manifest.json", [
      { start_s: 0, end_s: 40, visual_type: "broll" },
      { start_s: 40, end_s: 100, visual_type: "broll" }
    ]);

    try {
      writeFileSync(mediaPath, "");
      const result = spawnSync("python3", [
        resolve("scripts/qc-engine/run_gate.py"),
        mediaPath,
        "--checks",
        "rehook_cadence",
        "--manifest",
        manifestPath,
        "--out",
        outDir
      ], { cwd: resolve("."), encoding: "utf8" });
      const verdict = JSON.parse(readFileSync(join(outDir, "VERDICT.json"), "utf8"));

      expect(result.status).toBe(1);
      expect(verdict.verdict).toBe("BLOCK");
      expect(verdict.blocked).toEqual(["rehook_cadence"]);
      expect(verdict.per_check.rehook_cadence.findings[0].label).toBe("REHOOK_CADENCE");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
