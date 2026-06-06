import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { formatLaunchDoctor, runLaunchDoctor } from "../../launch-doctor.mjs";

describe("launch doctor", () => {
  it("summarizes passing and blocking launch steps", () => {
    const report = runLaunchDoctor({
      steps: [
        { id: "one", label: "First check", command: ["first"] },
        { id: "two", label: "Second check", command: ["second"] }
      ],
      runner: (command) => command[0] === "first"
        ? { status: 0, stdout: "first ok\n", stderr: "" }
        : { status: 1, stdout: "", stderr: "second failed\n" }
    });
    const text = formatLaunchDoctor(report);

    expect(report.ok).toBe(false);
    expect(text).toContain("UploadCheck launch doctor: NOT READY");
    expect(text).toContain("PASS one - First check");
    expect(text).toContain("BLOCK two - Second check");
    expect(text).toContain("Blockers: two");
  });

  it("returns nonzero in the current unconfigured local launch state", () => {
    const result = spawnSync("npm", ["run", "--silent", "launch:doctor"], {
      cwd: resolve("."),
      encoding: "utf8",
      env: { ...process.env, RENDER_API_KEY: "" }
    });

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("UploadCheck launch doctor: NOT READY");
    expect(result.stdout).toContain("BLOCK checkout");
    expect(result.stdout).toContain("BLOCK storage");
    expect(result.stdout).toContain("BLOCK readiness");
    expect(result.stdout).toContain("BLOCK launch-check");
  });
});
