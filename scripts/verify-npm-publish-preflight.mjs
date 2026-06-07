#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolve } from "node:path";

const packages = [
  { dir: "cli", packagePath: "cli/package.json" },
  { dir: "mcp-server", packagePath: "mcp-server/package.json" }
];

const results = packages.map((spec) => {
  const pkg = JSON.parse(readFileSync(resolve(spec.packagePath), "utf8"));
  const registry = npmView(`${pkg.name}@latest`, ["version", "dist.tarball", "dist.integrity", "--json"]);
  const exactVersion = npmView(`${pkg.name}@${pkg.version}`, ["version", "--json"]);
  return {
    name: pkg.name,
    version: pkg.version,
    publishableVersion: exactVersion.status === "not_found",
    latest: registry.status === "found" ? registry.payload : null,
    registryStatus: registry.status,
    exactVersionStatus: exactVersion.status,
    exactVersionPublished: exactVersion.status === "found"
  };
});

const auth = npmWhoami();
const blockers = [];

for (const result of results) {
  if (result.registryStatus === "error" || result.exactVersionStatus === "error") {
    blockers.push(`${result.name}@${result.version} registry lookup failed; rerun npm view before publish or release proof.`);
  }
}
const allExactVersionsPublished = results.every((result) => result.exactVersionPublished);
const founderActionRequired = auth.status !== "authenticated" || !allExactVersionsPublished;
const nextFounderActions = founderActionRequired
  ? [
      "Log in with npm as a package-publishing account or set NPM_TOKEN.",
      "Use the public account-scoped package names @drantoniou/uploadcheck and @drantoniou/uploadcheck-mcp unless an npm organization is created.",
      "Run npm publish --access public from cli/ and mcp-server/ after local package checks pass.",
      "After publish, rerun this preflight and npm view for both packages."
    ]
  : [
      "No npm publish action is required for the current package versions.",
      "Rotate or revoke the temporary npm automation token after deployment proof is complete."
    ];

console.log(JSON.stringify({
  ok: blockers.length === 0,
  packages: results,
  npmAuth: auth,
  registryInstallProofReady: allExactVersionsPublished,
  founderActionRequired,
  nextFounderActions,
  blockers
}, null, 2));

process.exit(blockers.length ? 1 : 0);

function npmView(packageSpecifier, args) {
  try {
    const cacheDir = mkdtempSync(join(tmpdir(), "uploadcheck-npm-view-"));
    const stdout = execFileSync("npm", ["view", packageSpecifier, ...args], {
      cwd: resolve("."),
      env: { ...process.env, npm_config_cache: cacheDir },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    }).trim();
    return {
      status: "found",
      payload: stdout ? JSON.parse(stdout) : null
    };
  } catch (error) {
    const output = `${error.stdout || ""}\n${error.stderr || ""}`;
    if (String(output).includes("E404") || String(output).includes("is not in this registry")) {
      return { status: "not_found", payload: null };
    }
    return {
      status: "error",
      error: trimError(output || error.message)
    };
  }
}

function npmWhoami() {
  try {
    const user = execFileSync("npm", ["whoami"], {
      cwd: resolve("."),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    }).trim();
    return { status: "authenticated", user };
  } catch (error) {
    const output = `${error.stdout || ""}\n${error.stderr || ""}`;
    if (String(output).includes("ENEEDAUTH") || String(output).includes("need auth")) {
      return {
        status: "not_authenticated",
        founderAction: "Run npm login or set NPM_TOKEN before publishing."
      };
    }
    return {
      status: "error",
      error: trimError(output || error.message)
    };
  }
}

function trimError(value) {
  return String(value).split("\n").map((line) => line.trim()).filter(Boolean).slice(0, 5).join(" ");
}
