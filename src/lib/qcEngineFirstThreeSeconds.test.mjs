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
    resolve("scripts/qc-engine/check_first_three_seconds.py"),
    mediaPath,
    "--manifest",
    manifestPath,
    "--json",
    jsonPath
  ], { cwd: resolve("."), encoding: "utf8" });
}

describe("check_first_three_seconds.py", () => {
  it("blocks when no manifest row covers the first three seconds", () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-first-three-"));
    const mediaPath = join(dir, "master.mp4");
    const jsonPath = join(dir, "first-three.json");
    const manifestPath = writeManifest(dir, "manifest.json", [{
      t_start: 5,
      duration: 10,
      visual_class: "broll",
      hook_present: true
    }]);

    try {
      writeFileSync(mediaPath, "");
      const result = runChecker(mediaPath, manifestPath, jsonPath);
      const payload = JSON.parse(readFileSync(jsonPath, "utf8"));

      expect(result.status).toBe(1);
      expect(payload).toMatchObject({
        check: "first_three_seconds",
        pass: false,
        opening_entries: 0
      });
      expect(payload.findings[0].reason).toContain("No manifest row covers the first three seconds");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("blocks generic or missing-hook openings", () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-first-three-"));
    const mediaPath = join(dir, "master.mp4");
    const jsonPath = join(dir, "first-three.json");
    const manifestPath = writeManifest(dir, "manifest.json", [{
      t_start: 0,
      t_end: 3,
      visual_class: "generic mood b-roll",
      opening_text: "atmospheric opener",
      hook_present: false,
      visual_file: "desert-atmosphere.mp4"
    }]);

    try {
      writeFileSync(mediaPath, "");
      const result = runChecker(mediaPath, manifestPath, jsonPath);
      const payload = JSON.parse(readFileSync(jsonPath, "utf8"));

      expect(result.status).toBe(1);
      expect(payload.findings[0]).toMatchObject({
        label: "FIRST_THREE_SECONDS",
        t_start: 0,
        t_end: 3,
        visual_file: "desert-atmosphere.mp4"
      });
      expect(payload.findings[0].action).toContain("specific hook");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("blocks explicit title/thumbnail/opening mismatch", () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-first-three-"));
    const mediaPath = join(dir, "master.mp4");
    const jsonPath = join(dir, "first-three.json");
    const manifestPath = writeManifest(dir, "manifest.json", [{
      start: 0,
      end: 2.5,
      hook_present: true,
      video_title: "Why Marcion terrified the church",
      thumbnail_text: "Marcion",
      opening_text: "A quiet desert sunrise",
      visual_subject: "landscape",
      title_thumbnail_mismatch: true
    }]);

    try {
      writeFileSync(mediaPath, "");
      const result = runChecker(mediaPath, manifestPath, jsonPath);
      const payload = JSON.parse(readFileSync(jsonPath, "utf8"));

      expect(result.status).toBe(1);
      expect(payload.findings[0].reason).toContain("mismatched");
      expect(payload.findings[0].action).toContain("title and thumbnail");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("allows a declared non-generic hook frame/card and wires through run_gate.py", () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-first-three-gate-"));
    const mediaPath = join(dir, "short.mp4");
    const outDir = join(dir, "gate");
    const manifestPath = writeManifest(dir, "manifest.json", [{
      start_s: 0,
      duration_s: 3,
      visual_type: "text-card",
      hook_card: true,
      hook_text: "What if Jesus never defended the violent portrait?",
      title: "What if Jesus never defended it?",
      thumbnail_text: "Jesus"
    }]);

    try {
      writeFileSync(mediaPath, "");
      const result = spawnSync("python3", [
        resolve("scripts/qc-engine/run_gate.py"),
        mediaPath,
        "--checks",
        "first_three_seconds",
        "--manifest",
        manifestPath,
        "--out",
        outDir
      ], { cwd: resolve("."), encoding: "utf8" });
      const verdict = JSON.parse(readFileSync(join(outDir, "VERDICT.json"), "utf8"));

      expect(result.status).toBe(0);
      expect(verdict.verdict).toBe("SHIP-OK");
      expect(verdict.blocked).toEqual([]);
      expect(verdict.per_check.first_three_seconds.pass).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
