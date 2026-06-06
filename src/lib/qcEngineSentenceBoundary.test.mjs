import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("check_sentence_boundary.py", () => {
  it("blocks transcript sidecars that end mid-sentence", () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-sentence-"));
    const mediaPath = join(dir, "short.mp4");
    const transcriptPath = join(dir, "transcript.txt");
    const jsonPath = join(dir, "sentence.json");

    try {
      writeFileSync(mediaPath, "placeholder-media");
      writeFileSync(transcriptPath, "What Jesus intentionally left behind was");
      const result = spawnSync("python3", [
        resolve("scripts/qc-engine/check_sentence_boundary.py"),
        mediaPath,
        "--transcript",
        transcriptPath,
        "--json",
        jsonPath
      ], { cwd: resolve("."), encoding: "utf8" });
      const payload = JSON.parse(readFileSync(jsonPath, "utf8"));

      expect(result.status).toBe(1);
      expect(payload).toMatchObject({
        check: "sentence_boundary",
        pass: false,
        has_word_timestamps: false
      });
      expect(payload.findings[0]).toMatchObject({
        label: "MID_SENTENCE_END"
      });
      expect(payload.findings[0].action).toContain("complete sentence");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("passes complete transcript sidecars", () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-sentence-"));
    const mediaPath = join(dir, "short.mp4");
    const transcriptPath = join(dir, "transcript.txt");
    const jsonPath = join(dir, "sentence.json");

    try {
      writeFileSync(mediaPath, "placeholder-media");
      writeFileSync(transcriptPath, "What Jesus intentionally left behind was a question.");
      const result = spawnSync("python3", [
        resolve("scripts/qc-engine/check_sentence_boundary.py"),
        mediaPath,
        "--transcript",
        transcriptPath,
        "--json",
        jsonPath
      ], { cwd: resolve("."), encoding: "utf8" });
      const payload = JSON.parse(readFileSync(jsonPath, "utf8"));

      expect(result.status).toBe(0);
      expect(payload).toMatchObject({
        check: "sentence_boundary",
        pass: true,
        findings: []
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("is wired through run_gate.py with transcript sidecars", () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-sentence-gate-"));
    const mediaPath = join(dir, "short.mp4");
    const transcriptPath = join(dir, "transcript.txt");
    const outDir = join(dir, "gate");

    try {
      writeFileSync(mediaPath, "placeholder-media");
      writeFileSync(transcriptPath, "He kept the question open because");
      const result = spawnSync("python3", [
        resolve("scripts/qc-engine/run_gate.py"),
        mediaPath,
        "--checks",
        "sentence_boundary",
        "--transcript",
        transcriptPath,
        "--out",
        outDir
      ], { cwd: resolve("."), encoding: "utf8" });
      const verdict = JSON.parse(readFileSync(join(outDir, "VERDICT.json"), "utf8"));

      expect(result.status).toBe(1);
      expect(verdict.verdict).toBe("BLOCK");
      expect(verdict.blocked).toContain("sentence_boundary");
      expect(verdict.per_check.sentence_boundary.findings[0].label).toBe("MID_SENTENCE_END");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
