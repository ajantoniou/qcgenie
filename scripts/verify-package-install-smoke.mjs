#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(".");
const packDir = mkdtempSync(join(tmpdir(), "uploadcheck-pack-"));
const smokeDir = mkdtempSync(join(tmpdir(), "uploadcheck-install-smoke-"));

try {
  execFileSync("npm", ["pack", "./cli", "--pack-destination", packDir], { cwd: root, stdio: "pipe" });
  execFileSync("npm", ["pack", "./mcp-server", "--pack-destination", packDir], { cwd: root, stdio: "pipe" });
  const tarballs = readdirSync(packDir).filter((name) => name.endsWith(".tgz")).map((name) => join(packDir, name));
  if (tarballs.length !== 2) throw new Error(`Expected 2 package tarballs, found ${tarballs.length}.`);

  execFileSync("npm", ["init", "-y"], { cwd: smokeDir, stdio: "pipe" });
  execFileSync("npm", ["install", ...tarballs], { cwd: smokeDir, stdio: "pipe" });

  const cli = execFileSync("npx", ["uploadcheck", "cost-basis", "--json"], {
    cwd: smokeDir,
    encoding: "utf8",
    timeout: 30_000
  });
  const costBasis = JSON.parse(cli);
  if (!costBasis.target_gross_margin_pct || !Array.isArray(costBasis.plans)) {
    throw new Error("Installed CLI did not return a valid cost-basis payload.");
  }

  const mcp = spawnSync(join(smokeDir, "node_modules/.bin/uploadcheck-mcp"), [], {
    cwd: smokeDir,
    input: "",
    encoding: "utf8",
    timeout: 3000,
    env: {
      ...process.env,
      UPLOADCHECK_API_BASE_URL: "https://api.uploadcheck.app",
      UPLOADCHECK_API_KEY: "install-smoke-placeholder"
    }
  });
  if (mcp.error && mcp.error.code !== "ETIMEDOUT") throw mcp.error;
  if (mcp.status && mcp.status !== 0 && mcp.signal !== "SIGTERM") {
    throw new Error(`Installed MCP binary exited unexpectedly: ${mcp.status}\n${mcp.stderr || mcp.stdout}`);
  }

  console.log(JSON.stringify({
    ok: true,
    smokeDir,
    tarballs: tarballs.map((path) => path.split("/").at(-1)),
    cli: "uploadcheck cost-basis --json",
    mcp: "uploadcheck-mcp started from installed package"
  }, null, 2));
} finally {
  rmSync(packDir, { recursive: true, force: true });
  rmSync(smokeDir, { recursive: true, force: true });
}
