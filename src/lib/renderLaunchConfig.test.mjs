import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("Render launch blueprint", () => {
  const renderYaml = readFileSync("render.yaml", "utf8");

  it("declares UploadCheck custom domains", () => {
    expect(renderYaml).toContain("uploadcheck.app");
    expect(renderYaml).toContain("www.uploadcheck.app");
    expect(renderYaml).toContain("api.uploadcheck.app");
  });

  it("uses a mounted disk for production JSON state and upload media", () => {
    expect(renderYaml).toContain("mountPath: /mnt/uploadcheck");
    expect(renderYaml).toContain("value: /mnt/uploadcheck/store.json");
    expect(renderYaml).toContain("value: /mnt/uploadcheck/uploads");
    expect(renderYaml).not.toMatch(/key:\s*UPLOADCHECK_STORE_PATH\s*\n\s*value:\s*\/tmp\//);
  });

  it("prompts for hashed API auth instead of plaintext API keys", () => {
    expect(renderYaml).toMatch(/key:\s*UPLOADCHECK_API_KEY_SHA256\s*\n\s*sync:\s*false/);
    expect(renderYaml).not.toMatch(/key:\s*UPLOADCHECK_API_KEY\s*\n\s*sync:\s*false/);
  });

  it("passes the launch config verifier", () => {
    const output = execFileSync("node", ["scripts/verify-render-launch-config.mjs"], { encoding: "utf8" });
    expect(output).toContain("hashed API auth");
  });
});
