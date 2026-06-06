import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

function writeManifest(dir, name, rows) {
  const path = join(dir, name);
  writeFileSync(path, JSON.stringify({ scenes: rows }, null, 2));
  return path;
}

function runChecker(mediaPath, manifestPath, jsonPath) {
  return spawnSync("python3", [
    resolve("scripts/qc-engine/check_literal_subject_match.py"),
    mediaPath,
    "--manifest",
    manifestPath,
    "--json",
    jsonPath
  ], { cwd: resolve("."), encoding: "utf8" });
}

describe("check_literal_subject_match.py", () => {
  it("blocks named narration subjects paired with generic mood footage", () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-literal-subject-"));
    const mediaPath = join(dir, "master.mp4");
    const jsonPath = join(dir, "literal-subject.json");
    const manifestPath = writeManifest(dir, "manifest.json", [{
      t_start: 42,
      t_end: 55,
      vo_text_excerpt: "Nag Hammadi was discovered in 1945.",
      named_entities_in_vo: ["Nag Hammadi", "1945"],
      visual_class: "broll",
      visual_subject: "generic desert ruins atmosphere",
      literal_match_found: false,
      visual_file: "sphinx-pyramids-mood.mp4"
    }]);

    try {
      writeFileSync(mediaPath, "");
      const result = runChecker(mediaPath, manifestPath, jsonPath);
      const payload = JSON.parse(readFileSync(jsonPath, "utf8"));

      expect(result.status).toBe(1);
      expect(payload).toMatchObject({
        check: "literal_subject_match",
        pass: false,
        manifest_entries: 1
      });
      expect(payload.findings[0]).toMatchObject({
        label: "LITERAL_SUBJECT_MISMATCH",
        t_start: 42,
        t_end: 55,
        visual_file: "sphinx-pyramids-mood.mp4",
        visual_class: "broll"
      });
      expect(payload.findings[0].named_entities).toEqual(["Nag Hammadi", "1945"]);
      expect(payload.findings[0].action).toContain("source-card/Remotion");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("allows literal visual matches and explicit source-card fallbacks", () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-literal-subject-"));
    const mediaPath = join(dir, "master.mp4");
    const jsonPath = join(dir, "literal-subject.json");
    const manifestPath = writeManifest(dir, "manifest.json", [
      {
        start: 0,
        end: 12,
        vo_text_excerpt: "Jesus teaches on the Sermon on the Mount.",
        named_entities_in_vo: ["Jesus", "Sermon on the Mount"],
        visual_subject: "Jesus on the Sermon on the Mount",
        visual_class: "broll"
      },
      {
        start: 15,
        end: 26,
        vo_text_excerpt: "Marcion forced the church to answer.",
        named_entities_in_vo: ["Marcion"],
        visual_class: "remotion",
        visual_subject: "source card explaining Marcion",
        recommend_remotion: true,
        literal_match_found: false
      }
    ]);

    try {
      writeFileSync(mediaPath, "");
      const result = runChecker(mediaPath, manifestPath, jsonPath);
      const payload = JSON.parse(readFileSync(jsonPath, "utf8"));

      expect(result.status).toBe(0);
      expect(payload).toMatchObject({
        check: "literal_subject_match",
        pass: true,
        manifest_entries: 2
      });
      expect(payload.findings).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("is wired through run_gate.py with manifest sidecars", () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-literal-subject-gate-"));
    const mediaPath = join(dir, "master.mp4");
    const outDir = join(dir, "gate");
    const manifestPath = writeManifest(dir, "manifest.json", [{
      start_s: 90,
      end_s: 108,
      vo_text_excerpt: "When James quotes Jesus, the viewer should see Jesus.",
      named_entities: [{ name: "Jesus" }],
      visual_type: "generic mood b-roll",
      visual_description: "anonymous crowd reaction",
      literal_subject_present: false
    }]);

    try {
      writeFileSync(mediaPath, "");
      const result = spawnSync("python3", [
        resolve("scripts/qc-engine/run_gate.py"),
        mediaPath,
        "--checks",
        "literal_subject_match",
        "--manifest",
        manifestPath,
        "--out",
        outDir
      ], { cwd: resolve("."), encoding: "utf8" });
      const verdict = JSON.parse(readFileSync(join(outDir, "VERDICT.json"), "utf8"));

      expect(result.status).toBe(1);
      expect(verdict.verdict).toBe("BLOCK");
      expect(verdict.blocked).toEqual(["literal_subject_match"]);
      expect(verdict.per_check.literal_subject_match.findings[0].label).toBe("LITERAL_SUBJECT_MISMATCH");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
