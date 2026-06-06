#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(".");

const packages = [
  {
    label: "CLI",
    dir: "cli",
    name: "@uploadcheck/cli",
    bin: { uploadcheck: "./index.mjs" },
    filesField: ["index.mjs", "request-builder.mjs"],
    packedFiles: ["index.mjs", "package.json", "request-builder.mjs"]
  },
  {
    label: "MCP",
    dir: "mcp-server",
    name: "@uploadcheck/mcp",
    bin: { "uploadcheck-mcp": "./index.mjs" },
    filesField: [
      "index.mjs",
      "local-file.mjs",
      "mcp-install.json",
      "request-builder.mjs",
      "run-uploadcheck-mcp.sh",
      "README.md"
    ],
    packedFiles: [
      "README.md",
      "index.mjs",
      "local-file.mjs",
      "mcp-install.json",
      "package.json",
      "request-builder.mjs",
      "run-uploadcheck-mcp.sh"
    ],
    lockFile: "package-lock.json"
  }
];

function readJson(path) {
  return JSON.parse(readFileSync(resolve(root, path), "utf8"));
}

function assertDeepEqual(label, actual, expected) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label} mismatch.\nExpected: ${JSON.stringify(expected)}\nActual:   ${JSON.stringify(actual)}`);
  }
}

function packFiles(dir) {
  const output = execFileSync("npm", ["pack", "--dry-run", "--json"], {
    cwd: resolve(root, dir),
    encoding: "utf8"
  });
  return JSON.parse(output)[0].files.map((file) => file.path).sort();
}

const results = [];

for (const spec of packages) {
  const pkgPath = `${spec.dir}/package.json`;
  const pkg = readJson(pkgPath);

  if (pkg.name !== spec.name) throw new Error(`${spec.label} package name should be ${spec.name}, got ${pkg.name}.`);
  if (pkg.private !== undefined) throw new Error(`${spec.label} package must not set private.`);
  if (pkg.license !== "UNLICENSED") throw new Error(`${spec.label} package license should be UNLICENSED.`);
  assertDeepEqual(`${spec.label} bin`, pkg.bin, spec.bin);
  assertDeepEqual(`${spec.label} files field`, pkg.files, spec.filesField);

  if (spec.lockFile) {
    const lock = readJson(`${spec.dir}/${spec.lockFile}`);
    assertDeepEqual(`${spec.label} package-lock root package`, lock.packages[""], {
      name: pkg.name,
      version: pkg.version,
      license: pkg.license,
      dependencies: pkg.dependencies,
      bin: Object.fromEntries(Object.entries(pkg.bin).map(([name, target]) => [name, target.replace(/^\.\//, "")]))
    });
  }

  const packedFiles = packFiles(spec.dir);
  assertDeepEqual(`${spec.label} npm pack files`, packedFiles, spec.packedFiles);
  if (spec.dir === "mcp-server") verifyMcpInstallManifest(readJson("mcp-server/mcp-install.json"));

  results.push({
    name: pkg.name,
    version: pkg.version,
    bin: Object.keys(pkg.bin),
    packedFiles
  });
}

console.log(JSON.stringify({ ok: true, packages: results }, null, 2));

function verifyMcpInstallManifest(manifest) {
  if (manifest.name !== "uploadcheck") throw new Error("MCP install manifest must name the uploadcheck server.");
  if (manifest.package !== "@uploadcheck/mcp") throw new Error("MCP install manifest must reference @uploadcheck/mcp.");
  if (manifest.binary !== "uploadcheck-mcp") throw new Error("MCP install manifest must reference uploadcheck-mcp.");
  if (manifest.hosted_api_base_url !== "https://api.uploadcheck.app") throw new Error("MCP install manifest must use the UploadCheck custom API base URL.");
  if (!manifest.codex_local?.toml?.includes("[mcp_servers.uploadcheck]")) throw new Error("MCP install manifest must include Codex TOML.");
  for (const client of ["claude_desktop", "cursor"]) {
    const server = manifest[client]?.json?.mcpServers?.uploadcheck;
    if (!server) throw new Error(`MCP install manifest missing ${client} uploadcheck server.`);
    assertDeepEqual(`${client} command`, server.command, "npx");
    assertDeepEqual(`${client} args`, server.args, ["-y", "@uploadcheck/mcp"]);
  }
  if (!manifest.recommended_first_calls?.includes("qc_get_npo_pipeline_handoff")) {
    throw new Error("MCP install manifest must recommend the NPO pipeline handoff tool.");
  }
}
