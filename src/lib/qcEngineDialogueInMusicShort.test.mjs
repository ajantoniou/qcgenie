import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

function runChecker(mediaPath, transcriptPath, jsonPath) {
  const args = [
    resolve("scripts/qc-engine/check_dialogue_in_music_short.py"),
    mediaPath,
    "--json",
    jsonPath
  ];
  if (transcriptPath) args.splice(2, 0, "--transcript", transcriptPath);
  return spawnSync("python3", args, { cwd: resolve("."), encoding: "utf8" });
}

describe("check_dialogue_in_music_short.py", () => {
  it("skips when no transcript sidecar is supplied", () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-dialogue-short-"));
    const mediaPath = join(dir, "short.mp4");
    const jsonPath = join(dir, "dialogue.json");

    try {
      writeFileSync(mediaPath, "");
      const result = runChecker(mediaPath, null, jsonPath);
      const payload = JSON.parse(readFileSync(jsonPath, "utf8"));

      expect(result.status).toBe(0);
      expect(payload).toMatchObject({
        check: "dialogue_in_music_short",
        pass: null,
        skipped: true,
        reason: "no transcript supplied"
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("allows music-only transcript markers", () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-dialogue-short-"));
    const mediaPath = join(dir, "short.mp4");
    const transcriptPath = join(dir, "transcript.txt");
    const jsonPath = join(dir, "dialogue.json");

    try {
      writeFileSync(mediaPath, "");
      writeFileSync(transcriptPath, "[music] ♪ instrumental background music ♪");
      const result = runChecker(mediaPath, transcriptPath, jsonPath);
      const payload = JSON.parse(readFileSync(jsonPath, "utf8"));

      expect(result.status).toBe(0);
      expect(payload).toMatchObject({
        check: "dialogue_in_music_short",
        pass: true,
        speech_word_count: 0
      });
      expect(payload.findings).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("blocks transcribed speech in a music-only Short", () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-dialogue-short-"));
    const mediaPath = join(dir, "short.mp4");
    const transcriptPath = join(dir, "transcript.json");
    const jsonPath = join(dir, "dialogue.json");

    try {
      writeFileSync(mediaPath, "");
      writeFileSync(transcriptPath, JSON.stringify({
        words: [{ text: "Welcome" }, { text: "back" }, { text: "everyone" }]
      }));
      const result = runChecker(mediaPath, transcriptPath, jsonPath);
      const payload = JSON.parse(readFileSync(jsonPath, "utf8"));

      expect(result.status).toBe(1);
      expect(payload).toMatchObject({
        check: "dialogue_in_music_short",
        pass: false,
        speech_word_count: 3
      });
      expect(payload.findings[0]).toMatchObject({
        label: "DIALOGUE_IN_MUSIC_SHORT"
      });
      expect(payload.findings[0].action).toContain("Remove the spoken dialogue");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("is wired through run_gate.py with transcript sidecars", () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-dialogue-short-gate-"));
    const mediaPath = join(dir, "short.mp4");
    const transcriptPath = join(dir, "transcript.txt");
    const outDir = join(dir, "gate");

    try {
      writeFileSync(mediaPath, "");
      writeFileSync(transcriptPath, "This was supposed to be music only.");
      const result = spawnSync("python3", [
        resolve("scripts/qc-engine/run_gate.py"),
        mediaPath,
        "--checks",
        "dialogue_in_music_short",
        "--transcript",
        transcriptPath,
        "--out",
        outDir
      ], { cwd: resolve("."), encoding: "utf8" });
      const verdict = JSON.parse(readFileSync(join(outDir, "VERDICT.json"), "utf8"));

      expect(result.status).toBe(1);
      expect(verdict.verdict).toBe("BLOCK");
      expect(verdict.blocked).toEqual(["dialogue_in_music_short"]);
      expect(verdict.per_check.dialogue_in_music_short.findings[0].label).toBe("DIALOGUE_IN_MUSIC_SHORT");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
