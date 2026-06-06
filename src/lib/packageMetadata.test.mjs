import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { verifyCodexInstall } from "../../scripts/verify-codex-install.mjs";

function readJson(path) {
  return JSON.parse(readFileSync(resolve(path), "utf8"));
}

function packFiles(cwd) {
  const output = execFileSync("npm", ["pack", "--dry-run", "--json"], {
    cwd: resolve(cwd),
    encoding: "utf8"
  });
  return JSON.parse(output)[0].files.map((file) => file.path).sort();
}

describe("UploadCheck package metadata", () => {
  it("exposes an operator package verification command", () => {
    const output = execFileSync("npm", ["run", "--silent", "packages:verify"], {
      cwd: resolve("."),
      encoding: "utf8"
    });
    const payload = JSON.parse(output);

    expect(payload.ok).toBe(true);
    expect(payload.packages.map((pkg) => pkg.name)).toEqual(["@uploadcheck/cli", "@uploadcheck/mcp"]);
    expect(payload.packages[0].packedFiles).toEqual(["index.mjs", "package.json", "request-builder.mjs"]);
    expect(payload.packages[1].packedFiles).toEqual([
      "README.md",
      "index.mjs",
      "local-file.mjs",
      "package.json",
      "request-builder.mjs",
      "run-uploadcheck-mcp.sh"
    ]);
  });

  it("keeps CLI package install metadata aligned with public naming", () => {
    const pkg = readJson("cli/package.json");

    expect(pkg).toMatchObject({
      name: "@uploadcheck/cli",
      bin: { uploadcheck: "./index.mjs" },
      exports: {
        ".": "./index.mjs",
        "./request-builder": "./request-builder.mjs"
      }
    });
    expect(pkg.files).toEqual(["index.mjs", "request-builder.mjs"]);
    expect(packFiles("cli")).toEqual(["index.mjs", "package.json", "request-builder.mjs"]);
  });

  it("keeps MCP package standalone-installable", () => {
    const pkg = readJson("mcp-server/package.json");
    const lock = readJson("mcp-server/package-lock.json");
    const localFile = readFileSync(resolve("mcp-server/local-file.mjs"), "utf8");

    expect(pkg.name).toBe("@uploadcheck/mcp");
    expect(pkg.private).toBeUndefined();
    expect(pkg.bin).toEqual({ "uploadcheck-mcp": "./index.mjs" });
    expect(lock.packages[""]).toMatchObject({
      name: pkg.name,
      version: pkg.version,
      license: pkg.license,
      dependencies: pkg.dependencies
    });
    expect(lock.packages[""].bin).toEqual({ "uploadcheck-mcp": "index.mjs" });
    expect(pkg.files).toEqual([
      "index.mjs",
      "local-file.mjs",
      "request-builder.mjs",
      "run-uploadcheck-mcp.sh",
      "README.md"
    ]);
    expect(localFile).not.toContain("../cli/");
    expect(packFiles("mcp-server")).toEqual([
      "README.md",
      "index.mjs",
      "local-file.mjs",
      "package.json",
      "request-builder.mjs",
      "run-uploadcheck-mcp.sh"
    ]);
  });

  it("verifies the global Codex UploadCheck MCP and skill install shape", () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-codex-install-"));
    const wrapper = join(dir, "run-uploadcheck-mcp.sh");
    const config = join(dir, "config.toml");
    const skill = join(dir, "SKILL.md");

    try {
      writeFileSync(wrapper, "#!/bin/sh\nexec node index.mjs\n");
      chmodSync(wrapper, 0o755);
      writeFileSync(config, `
[mcp_servers.uploadcheck]
command = "${wrapper}"
args = []
startup_timeout_sec = 60

[mcp_servers.uploadcheck.env]
UPLOADCHECK_API_BASE_URL = "https://qcgenie-api.onrender.com"
`);
      writeFileSync(skill, `
---
name: uploadcheck
---
MCP server: \`uploadcheck\`
qc_get_launch_status
qc_estimate_cost
qc_run_local_file
qc_get_marker_csv
watchlist JSON
At \`$99 / 5,000\` minutes
Checked minutes mean deterministic pre-upload QC minutes
0.0157
UPLOADCHECK_MEDIA_INGRESS_BASE_URL=https://qcgenie-api.onrender.com
`);

      const result = verifyCodexInstall({
        configPath: config,
        skillPath: skill,
        expectedCommand: wrapper
      });

      expect(result.ok).toBe(true);
      expect(result.server.command).toBe(wrapper);
      expect(result.server.commandExecutable).toBe(true);
      expect(result.env.apiBaseUrl).toBe("https://qcgenie-api.onrender.com");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("fails Codex install verification when uploadcheck config drifts", () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-codex-install-"));
    const config = join(dir, "config.toml");
    const skill = join(dir, "SKILL.md");

    try {
      writeFileSync(config, `
[mcp_servers.other]
command = "node"
`);
      writeFileSync(skill, "name: wrong\n");

      const result = verifyCodexInstall({
        configPath: config,
        skillPath: skill,
        expectedCommand: join(dir, "missing.sh")
      });

      expect(result.ok).toBe(false);
      expect(result.errors.map((error) => error.reason)).toEqual(expect.arrayContaining([
        "missing",
        "wrong_command",
        "wrong_api_base",
        "not_executable",
        "missing_marker"
      ]));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
