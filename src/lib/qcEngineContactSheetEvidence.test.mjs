import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

function writeManifest(dir, name, rows) {
  const path = join(dir, name);
  writeFileSync(path, JSON.stringify({ repairs: rows }, null, 2));
  return path;
}

function runChecker(mediaPath, manifestPath, jsonPath) {
  return spawnSync("python3", [
    resolve("scripts/qc-engine/check_contact_sheet_evidence.py"),
    mediaPath,
    "--manifest",
    manifestPath,
    "--json",
    jsonPath
  ], { cwd: resolve("."), encoding: "utf8" });
}

describe("check_contact_sheet_evidence.py", () => {
  it("blocks founder complaint repair windows without before/after contact sheets", () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-contact-sheet-"));
    const mediaPath = join(dir, "master.mp4");
    const jsonPath = join(dir, "contact-sheet.json");
    const manifestPath = writeManifest(dir, "manifest.json", [{
      t_start: 666,
      t_end: 885,
      founder_complaint_window: true,
      repair_reason: "loop/freeze repair needs proof"
    }]);

    try {
      writeFileSync(mediaPath, "");
      const result = runChecker(mediaPath, manifestPath, jsonPath);
      const payload = JSON.parse(readFileSync(jsonPath, "utf8"));

      expect(result.status).toBe(1);
      expect(payload).toMatchObject({
        check: "contact_sheet_evidence",
        pass: false,
        required_windows: 1
      });
      expect(payload.findings[0]).toMatchObject({
        label: "CONTACT_SHEET_EVIDENCE",
        t_start: 666,
        t_end: 885
      });
      expect(payload.findings[0].action).toContain("before and after contact-sheet");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("allows required windows when both before and after sheets are attached", () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-contact-sheet-"));
    const mediaPath = join(dir, "master.mp4");
    const jsonPath = join(dir, "contact-sheet.json");
    const manifestPath = writeManifest(dir, "manifest.json", [{
      start: 120,
      end: 150,
      requires_contact_sheet: true,
      before_contact_sheet: "reports/window-120-before.jpg",
      after_contact_sheet: "reports/window-120-after.jpg"
    }]);

    try {
      writeFileSync(mediaPath, "");
      const result = runChecker(mediaPath, manifestPath, jsonPath);
      const payload = JSON.parse(readFileSync(jsonPath, "utf8"));

      expect(result.status).toBe(0);
      expect(payload).toMatchObject({
        check: "contact_sheet_evidence",
        pass: true,
        required_windows: 1
      });
      expect(payload.findings).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("is wired through run_gate.py with manifest sidecars", () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-contact-sheet-gate-"));
    const mediaPath = join(dir, "master.mp4");
    const outDir = join(dir, "gate");
    const manifestPath = writeManifest(dir, "manifest.json", [{
      start_s: 10,
      duration_s: 20,
      regression_window: true,
      contact_sheet: ["before-window.jpg", "after-window.jpg"]
    }]);

    try {
      writeFileSync(mediaPath, "");
      const result = spawnSync("python3", [
        resolve("scripts/qc-engine/run_gate.py"),
        mediaPath,
        "--checks",
        "contact_sheet_evidence",
        "--manifest",
        manifestPath,
        "--out",
        outDir
      ], { cwd: resolve("."), encoding: "utf8" });
      const verdict = JSON.parse(readFileSync(join(outDir, "VERDICT.json"), "utf8"));

      expect(result.status).toBe(0);
      expect(verdict.verdict).toBe("SHIP-OK");
      expect(verdict.blocked).toEqual([]);
      expect(verdict.per_check.contact_sheet_evidence.pass).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("blocks through run_gate.py when required evidence is missing", () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-contact-sheet-gate-"));
    const mediaPath = join(dir, "master.mp4");
    const outDir = join(dir, "gate");
    const manifestPath = writeManifest(dir, "manifest.json", [{
      start_s: 60,
      duration_s: 15,
      notes: "Founder complaint repair window"
    }]);

    try {
      writeFileSync(mediaPath, "");
      const result = spawnSync("python3", [
        resolve("scripts/qc-engine/run_gate.py"),
        mediaPath,
        "--checks",
        "contact_sheet_evidence",
        "--manifest",
        manifestPath,
        "--out",
        outDir
      ], { cwd: resolve("."), encoding: "utf8" });
      const verdict = JSON.parse(readFileSync(join(outDir, "VERDICT.json"), "utf8"));

      expect(result.status).toBe(1);
      expect(verdict.verdict).toBe("BLOCK");
      expect(verdict.blocked).toEqual(["contact_sheet_evidence"]);
      expect(verdict.per_check.contact_sheet_evidence.findings[0]).toMatchObject({
        label: "CONTACT_SHEET_EVIDENCE",
        t_start: 60,
        t_end: 75
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
