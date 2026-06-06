import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("check_twins.py", () => {
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
