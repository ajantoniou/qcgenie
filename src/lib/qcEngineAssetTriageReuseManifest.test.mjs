import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const checker = resolve("scripts/qc-engine/check_asset_triage_reuse_manifest.py");
const runner = resolve("scripts/qc-engine/run_gate.py");

function writeManifest(dir, rows) {
  const path = join(dir, "manifest.json");
  writeFileSync(path, JSON.stringify({ post_ship: rows }, null, 2));
  return path;
}

describe("check_asset_triage_reuse_manifest.py", () => {
  it("skips when no manifest is supplied", () => {
    const result = spawnSync("python3", [checker, "/tmp/master.mp4"], { cwd: resolve("."), encoding: "utf8" });
    const payload = JSON.parse(result.stdout);

    expect(result.status).toBe(0);
    expect(payload).toMatchObject({
      check: "asset_triage_reuse_manifest",
      pass: null,
      skipped: true
    });
  });

  it("blocks required asset triage missing cleanup candidates", () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-asset-triage-"));
    const manifest = writeManifest(dir, [{
      asset_triage_required: true,
      reusable_assets: [{ path: "brand/reusable-assets/music/cue-09.mp3" }],
      notes: "post ship asset triage required"
    }]);

    try {
      const result = spawnSync("python3", [checker, "/tmp/master.mp4", "--manifest", manifest], { cwd: resolve("."), encoding: "utf8" });
      const payload = JSON.parse(result.stdout);

      expect(result.status).toBe(1);
      expect(payload.pass).toBe(false);
      expect(payload.findings[0]).toMatchObject({
        label: "ASSET_TRIAGE_INCOMPLETE",
        missing: ["cleanup_candidates"],
        reusable_count: 1,
        cleanup_count: 0
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("passes when reusable assets and cleanup candidates are recorded", () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-asset-triage-"));
    const manifest = writeManifest(dir, [{
      asset_triage_required: true,
      reusable_assets: [
        { path: "brand/reusable-assets/remotion/source-card-template.tsx" },
        { path: "brand/reusable-assets/clean-segments/zef-sotm-014.mp4" }
      ],
      cleanup_candidates: [
        { path: "render-v4.candidate.mp4" },
        { path: "_spotcheck/frame-001.jpg" }
      ]
    }]);

    try {
      const result = spawnSync("python3", [checker, "/tmp/master.mp4", "--manifest", manifest], { cwd: resolve("."), encoding: "utf8" });
      const payload = JSON.parse(result.stdout);

      expect(result.status).toBe(0);
      expect(payload.pass).toBe(true);
      expect(payload.findings).toEqual([]);
      expect(payload.required_triage_entries).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("is wired through run_gate.py with manifest sidecars", () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-asset-triage-gate-"));
    const media = join(dir, "master.mp4");
    const manifest = writeManifest(dir, [{
      post_ship_asset_triage: true,
      cleanup_candidates: [{ path: "candidate-v1.mp4" }]
    }]);
    const out = join(dir, "gate");

    try {
      writeFileSync(media, "placeholder");
      const result = spawnSync("python3", [
        runner,
        media,
        "--checks",
        "asset_triage_reuse_manifest",
        "--manifest",
        manifest,
        "--out",
        out
      ], { cwd: resolve("."), encoding: "utf8" });
      const verdict = JSON.parse(readFileSync(join(out, "VERDICT.json"), "utf8"));

      expect(result.status).toBe(1);
      expect(verdict.verdict).toBe("BLOCK");
      expect(verdict.blocked).toEqual(["asset_triage_reuse_manifest"]);
      expect(verdict.per_check.asset_triage_reuse_manifest.findings[0].label).toBe("ASSET_TRIAGE_INCOMPLETE");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
