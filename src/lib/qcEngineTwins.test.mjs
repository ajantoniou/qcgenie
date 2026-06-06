import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("check_twins.py", () => {
  it("normalizes duplicate-person findings to require more character variation", () => {
    const script = `
import importlib.util
spec = importlib.util.spec_from_file_location("check_twins", "scripts/qc-engine/check_twins.py")
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
print(mod.json.dumps(mod.normalize_twins_finding({
  "has_twins": True,
  "needs_more_character_variation": False,
  "duplicate_count": 4,
  "reason": "The same person's face appears four times.",
  "action": "Remove the duplicate grid layout."
}, 12.5)))
`;
    const result = spawnSync("python3", ["-c", script], { cwd: resolve("."), encoding: "utf8" });
    const payload = JSON.parse(result.stdout);

    expect(result.status).toBe(0);
    expect(payload).toMatchObject({
      t: 12.5,
      duplicate_count: 4,
      needs_more_character_variation: true,
      reason: "The same person's face appears four times.",
      action: "Remove the duplicate grid layout."
    });
  });

  it("blocks when an image path cannot be decoded into a real frame", () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-twins-"));
    const mediaPath = join(dir, "crowd.jpg");
    const jsonPath = join(dir, "twins.json");

    try {
      writeFileSync(mediaPath, "fake-jpeg");
      const result = spawnSync("python3", [
        resolve("scripts/qc-engine/check_twins.py"),
        mediaPath,
        "--json",
        jsonPath
      ], { cwd: resolve("."), encoding: "utf8" });
      const payload = JSON.parse(readFileSync(jsonPath, "utf8"));

      expect(result.status).toBe(1);
      expect(payload).toMatchObject({
        check: "twins",
        pass: false,
        frames_checked: 0
      });
      expect(payload.findings[0].reason).toContain("Could not decode any image/video frames");
      expect(payload.findings[0].action).toContain("rerun UploadCheck");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
