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
    resolve("scripts/qc-engine/check_end_screen_tease.py"),
    mediaPath,
    "--manifest",
    manifestPath,
    "--json",
    jsonPath
  ], { cwd: resolve("."), encoding: "utf8" });
}

describe("check_end_screen_tease.py", () => {
  it("blocks when no manifest row covers the final window", () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-end-screen-"));
    const mediaPath = join(dir, "master.mp4");
    const jsonPath = join(dir, "end-screen.json");
    const manifestPath = writeManifest(dir, "manifest.json", [{
      t_start: 0,
      t_end: 10,
      visual_class: "broll"
    }]);

    try {
      writeFileSync(mediaPath, "");
      const result = runChecker(mediaPath, manifestPath, jsonPath);
      const payload = JSON.parse(readFileSync(jsonPath, "utf8"));

      expect(result.status).toBe(1);
      expect(payload).toMatchObject({
        check: "end_screen_tease",
        pass: false,
        manifest_entries: 1
      });
      expect(payload.findings[0].reason).toContain("Final window does not declare");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("blocks final rows explicitly marked as missing the CTA", () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-end-screen-"));
    const mediaPath = join(dir, "master.mp4");
    const jsonPath = join(dir, "end-screen.json");
    const manifestPath = writeManifest(dir, "manifest.json", [
      { t_start: 0, t_end: 40, visual_class: "broll" },
      { t_start: 40, t_end: 55, visual_class: "outro", missing_cta: true, visual_file: "outro.mp4" }
    ]);

    try {
      writeFileSync(mediaPath, "");
      const result = runChecker(mediaPath, manifestPath, jsonPath);
      const payload = JSON.parse(readFileSync(jsonPath, "utf8"));

      expect(result.status).toBe(1);
      expect(payload.findings[0]).toMatchObject({
        label: "END_SCREEN_TEASE",
        t_start: 40,
        t_end: 55,
        visual_file: "outro.mp4"
      });
      expect(payload.findings[0].action).toContain("next-video tease");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("allows a final footer card or next-episode handoff", () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-end-screen-"));
    const mediaPath = join(dir, "short.mp4");
    const jsonPath = join(dir, "end-screen.json");
    const manifestPath = writeManifest(dir, "manifest.json", [
      { start: 0, end: 50, visual_class: "broll" },
      {
        start: 50,
        end: 60,
        visual_class: "footer card",
        footer_text: "Full episode @NewTestamentOnly",
        footer_card_present: true
      }
    ]);

    try {
      writeFileSync(mediaPath, "");
      const result = runChecker(mediaPath, manifestPath, jsonPath);
      const payload = JSON.parse(readFileSync(jsonPath, "utf8"));

      expect(result.status).toBe(0);
      expect(payload).toMatchObject({
        check: "end_screen_tease",
        pass: true,
        manifest_entries: 2
      });
      expect(payload.findings).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("is wired through run_gate.py with manifest sidecars", () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-end-screen-gate-"));
    const mediaPath = join(dir, "master.mp4");
    const outDir = join(dir, "gate");
    const manifestPath = writeManifest(dir, "manifest.json", [
      { start_s: 0, end_s: 70, visual_type: "main episode" },
      { start_s: 70, end_s: 82, visual_type: "outro", end_screen_text: "Next episode: Eli enters the story." }
    ]);

    try {
      writeFileSync(mediaPath, "");
      const result = spawnSync("python3", [
        resolve("scripts/qc-engine/run_gate.py"),
        mediaPath,
        "--checks",
        "end_screen_tease",
        "--manifest",
        manifestPath,
        "--out",
        outDir
      ], { cwd: resolve("."), encoding: "utf8" });
      const verdict = JSON.parse(readFileSync(join(outDir, "VERDICT.json"), "utf8"));

      expect(result.status).toBe(0);
      expect(verdict.verdict).toBe("SHIP-OK");
      expect(verdict.blocked).toEqual([]);
      expect(verdict.per_check.end_screen_tease.pass).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
