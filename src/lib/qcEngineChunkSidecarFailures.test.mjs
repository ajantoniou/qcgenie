import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const checker = resolve("scripts/qc-engine/check_chunk_sidecar_failures.py");
const runner = resolve("scripts/qc-engine/run_gate.py");

describe("check_chunk_sidecar_failures.py", () => {
  it("skips cleanly when no sidecar dir is supplied", () => {
    const result = spawnSync("python3", [checker, "/tmp/media.mp3"], { cwd: resolve("."), encoding: "utf8" });
    const payload = JSON.parse(result.stdout);

    expect(result.status).toBe(0);
    expect(payload).toMatchObject({
      check: "chunk_sidecar_failures",
      skipped: true,
      pass: null,
      reason: "no sidecar dir supplied"
    });
  });

  it("blocks failed garble sidecars left by chunk rerender loops", () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-chunk-sidecars-"));
    const sidecars = join(dir, "_dialogue-chunks");
    const jsonPath = join(sidecars, "voice-17.garble-report.json");

    try {
      mkdirSync(sidecars, { recursive: true });
      writeFileSync(jsonPath, JSON.stringify({
        pass: false,
        status: "failed",
        findings: [{ reason: "Chunk 17 transcript was unreadable." }]
      }));

      const result = spawnSync("python3", [checker, "/tmp/media.mp3", "--sidecar-dir", sidecars], { cwd: resolve("."), encoding: "utf8" });
      const payload = JSON.parse(result.stdout);

      expect(result.status).toBe(1);
      expect(payload.pass).toBe(false);
      expect(payload.findings[0]).toMatchObject({
        label: "CHUNK_SIDECAR_FAILURE",
        sidecar_path: "voice-17.garble-report.json",
        status: "failed",
        pass: false
      });
      expect(payload.findings[0].action).toContain("rerender the affected chunk");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("allows clean pass sidecars", () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-chunk-sidecars-"));
    const sidecars = join(dir, "_dialogue-chunks");

    try {
      mkdirSync(sidecars, { recursive: true });
      writeFileSync(join(sidecars, "voice-17.garble-report.json"), JSON.stringify({ pass: true, status: "passed" }));

      const result = spawnSync("python3", [checker, "/tmp/media.mp3", "--sidecar-dir", sidecars], { cwd: resolve("."), encoding: "utf8" });
      const payload = JSON.parse(result.stdout);

      expect(result.status).toBe(0);
      expect(payload.pass).toBe(true);
      expect(payload.findings).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("is wired through run_gate.py", () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-run-gate-sidecars-"));
    const media = join(dir, "voiceover.mp3");
    const sidecars = join(dir, "_dialogue-chunks");
    const out = join(dir, "gate");

    try {
      mkdirSync(sidecars, { recursive: true });
      writeFileSync(media, "fake-media");
      writeFileSync(join(sidecars, "voice-04.garble-report.json"), JSON.stringify({
        verdict: "BLOCK",
        blocked: ["garble"],
        findings: [{ reason: "Chunk 4 failed after max rerenders." }]
      }));

      const result = spawnSync("python3", [
        runner,
        media,
        "--checks",
        "chunk_sidecar_failures",
        "--sidecar-dir",
        sidecars,
        "--out",
        out
      ], { cwd: resolve("."), encoding: "utf8" });
      const verdict = JSON.parse(readFileSync(join(out, "VERDICT.json"), "utf8"));

      expect(result.status).toBe(1);
      expect(verdict.verdict).toBe("BLOCK");
      expect(verdict.blocked).toEqual(["chunk_sidecar_failures"]);
      expect(verdict.per_check.chunk_sidecar_failures.findings[0].label).toBe("CHUNK_SIDECAR_FAILURE");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
