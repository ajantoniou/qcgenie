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
    resolve("scripts/qc-engine/check_opening_footer_text_presence.py"),
    mediaPath,
    "--manifest",
    manifestPath,
    "--json",
    jsonPath
  ], { cwd: resolve("."), encoding: "utf8" });
}

describe("check_opening_footer_text_presence.py", () => {
  it("blocks when a Short manifest lacks opening and footer text cards", () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-opening-footer-"));
    const mediaPath = join(dir, "short.mp4");
    const jsonPath = join(dir, "opening-footer.json");
    const manifestPath = writeManifest(dir, [
      { start: 3, end: 50, visual_type: "b-roll", text: "Punch card one" }
    ]);

    try {
      writeFileSync(mediaPath, "");
      const result = runChecker(mediaPath, manifestPath, jsonPath);
      const payload = JSON.parse(readFileSync(jsonPath, "utf8"));

      expect(result.status).toBe(1);
      expect(payload).toMatchObject({
        check: "opening_footer_text_presence",
        pass: false,
        manifest_entries: 1
      });
      expect(payload.findings.map((finding) => finding.label)).toEqual([
        "OPENING_TEXT_CARD_MISSING",
        "FOOTER_TEXT_CARD_MISSING"
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("blocks rows explicitly marked as missing hook or footer cards", () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-opening-footer-"));
    const mediaPath = join(dir, "short.mp4");
    const jsonPath = join(dir, "opening-footer.json");
    const manifestPath = writeManifest(dir, [
      { start_s: 0, end_s: 3, visual_type: "text card", opening_card: false, text: "What did Jesus mean?" },
      { start_s: 50, end_s: 60, visual_type: "footer card", missing_footer_card: true, footer_text: "Full episode @NewTestamentOnly" }
    ]);

    try {
      writeFileSync(mediaPath, "");
      const result = runChecker(mediaPath, manifestPath, jsonPath);
      const payload = JSON.parse(readFileSync(jsonPath, "utf8"));

      expect(result.status).toBe(1);
      expect(payload.findings[0]).toMatchObject({
        label: "OPENING_TEXT_CARD_MISSING",
        t_start: 0,
        t_end: 3
      });
      expect(payload.findings[1]).toMatchObject({
        label: "FOOTER_TEXT_CARD_MISSING",
        t_start: 50,
        t_end: 60
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("allows verified opening hook and footer cards", () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-opening-footer-"));
    const mediaPath = join(dir, "short.mp4");
    const jsonPath = join(dir, "opening-footer.json");
    const manifestPath = writeManifest(dir, [
      { start: 0, end: 3, visual_type: "hook text card", hook_card: true, hook_text: "What if mercy was the point?" },
      { start: 3, end: 50, visual_type: "b-roll", text: "Three punch cards" },
      { start: 50, end: 60, visual_type: "footer card", footer_card_present: true, footer_text: "Full episode @NewTestamentOnly" }
    ]);

    try {
      writeFileSync(mediaPath, "");
      const result = runChecker(mediaPath, manifestPath, jsonPath);
      const payload = JSON.parse(readFileSync(jsonPath, "utf8"));

      expect(result.status).toBe(0);
      expect(payload).toMatchObject({
        check: "opening_footer_text_presence",
        pass: true,
        manifest_entries: 3
      });
      expect(payload.findings).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("is wired through run_gate.py with manifest sidecars", () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-opening-footer-gate-"));
    const mediaPath = join(dir, "short.mp4");
    const outDir = join(dir, "gate");
    const manifestPath = writeManifest(dir, [
      { start: 0, end: 3, visual_type: "b-roll", text: "generic opener" },
      { start: 3, end: 49, visual_type: "b-roll" }
    ]);

    try {
      writeFileSync(mediaPath, "");
      const result = spawnSync("python3", [
        resolve("scripts/qc-engine/run_gate.py"),
        mediaPath,
        "--checks",
        "opening_footer_text_presence",
        "--manifest",
        manifestPath,
        "--out",
        outDir
      ], { cwd: resolve("."), encoding: "utf8" });
      const verdict = JSON.parse(readFileSync(join(outDir, "VERDICT.json"), "utf8"));

      expect(result.status).toBe(1);
      expect(verdict.verdict).toBe("BLOCK");
      expect(verdict.blocked).toEqual(["opening_footer_text_presence"]);
      expect(verdict.per_check.opening_footer_text_presence.findings[0].label).toBe("OPENING_TEXT_CARD_MISSING");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
