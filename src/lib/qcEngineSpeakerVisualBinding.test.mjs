import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("check_speaker_visual_binding.py", () => {
  it("blocks manifest rows that put one speaker under another character face", () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-speaker-"));
    const mediaPath = join(dir, "master.mp4");
    const manifestPath = join(dir, "storybook.json");
    const jsonPath = join(dir, "speaker.json");

    try {
      writeFileSync(mediaPath, "placeholder-media");
      writeFileSync(manifestPath, JSON.stringify({
        beats: [
          {
            t_start: 42,
            t_end: 58,
            speaker: "James",
            visual_character: "Miriam",
            visual_file: "clips/miriam-reaction.mp4"
          }
        ]
      }));
      const result = spawnSync("python3", [
        resolve("scripts/qc-engine/check_speaker_visual_binding.py"),
        mediaPath,
        "--manifest",
        manifestPath,
        "--json",
        jsonPath
      ], { cwd: resolve("."), encoding: "utf8" });
      const payload = JSON.parse(readFileSync(jsonPath, "utf8"));

      expect(result.status).toBe(1);
      expect(payload).toMatchObject({
        check: "speaker_visual_binding",
        pass: false,
        manifest_entries: 1
      });
      expect(payload.findings[0]).toMatchObject({
        label: "SPEAKER_VISUAL_MISMATCH",
        speaker: "James",
        visual_character: "Miriam",
        t_start: 42,
        visual_file: "clips/miriam-reaction.mp4"
      });
      expect(payload.findings[0].action).toContain("speaker-neutral b-roll");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("allows same-speaker and speaker-neutral manifest rows", () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-speaker-"));
    const mediaPath = join(dir, "master.mp4");
    const manifestPath = join(dir, "storybook.json");
    const jsonPath = join(dir, "speaker.json");

    try {
      writeFileSync(mediaPath, "placeholder-media");
      writeFileSync(manifestPath, JSON.stringify({
        beats: [
          { speaker: "James", visual_character: "James", visual_file: "clips/james.mp4" },
          { speaker: "James", visual_character: "speaker-neutral", visual_file: "clips/source-card.mp4" },
          { voice_speaker: "Miriam", face_character: "Miriam profile", file: "clips/miriam.mp4" }
        ]
      }));
      const result = spawnSync("python3", [
        resolve("scripts/qc-engine/check_speaker_visual_binding.py"),
        mediaPath,
        "--manifest",
        manifestPath,
        "--json",
        jsonPath
      ], { cwd: resolve("."), encoding: "utf8" });
      const payload = JSON.parse(readFileSync(jsonPath, "utf8"));

      expect(result.status).toBe(0);
      expect(payload).toMatchObject({
        check: "speaker_visual_binding",
        pass: true,
        manifest_entries: 3,
        findings: []
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("is wired through run_gate.py with manifest sidecars", () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-speaker-gate-"));
    const mediaPath = join(dir, "master.mp4");
    const manifestPath = join(dir, "storybook.json");
    const outDir = join(dir, "gate");

    try {
      writeFileSync(mediaPath, "placeholder-media");
      writeFileSync(manifestPath, JSON.stringify({
        beats: [{ speaker: "Miriam", visual_character: "Eli", visual_file: "clips/eli.mp4" }]
      }));
      const result = spawnSync("python3", [
        resolve("scripts/qc-engine/run_gate.py"),
        mediaPath,
        "--checks",
        "speaker_visual_binding",
        "--manifest",
        manifestPath,
        "--out",
        outDir
      ], { cwd: resolve("."), encoding: "utf8" });
      const verdict = JSON.parse(readFileSync(join(outDir, "VERDICT.json"), "utf8"));

      expect(result.status).toBe(1);
      expect(verdict.verdict).toBe("BLOCK");
      expect(verdict.blocked).toContain("speaker_visual_binding");
      expect(verdict.per_check.speaker_visual_binding.findings[0].label).toBe("SPEAKER_VISUAL_MISMATCH");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
