import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

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
    const localFile = readFileSync(resolve("mcp-server/local-file.mjs"), "utf8");

    expect(pkg.name).toBe("@uploadcheck/mcp");
    expect(pkg.private).toBeUndefined();
    expect(pkg.bin).toEqual({ "uploadcheck-mcp": "./index.mjs" });
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
});
