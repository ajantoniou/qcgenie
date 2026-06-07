#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { getMcpToolNames } from "../src/lib/agentic.ts";

const root = resolve(".");

const packages = [
  {
    label: "CLI",
    dir: "cli",
    name: "@uploadcheck/cli",
    bin: { uploadcheck: "./index.mjs" },
    repositoryDirectory: "cli",
    filesField: ["index.mjs", "launch-evidence.mjs", "request-builder.mjs"],
    packedFiles: ["index.mjs", "launch-evidence.mjs", "package.json", "request-builder.mjs"]
  },
  {
    label: "MCP",
    dir: "mcp-server",
    name: "@uploadcheck/mcp",
    bin: { "uploadcheck-mcp": "./index.mjs" },
    repositoryDirectory: "mcp-server",
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
  if (pkg.homepage !== "https://uploadcheck.app") throw new Error(`${spec.label} package homepage should be https://uploadcheck.app.`);
  if (pkg.publishConfig?.access !== "public") throw new Error(`${spec.label} package must set publishConfig.access=public.`);
  assertDeepEqual(`${spec.label} repository`, pkg.repository, {
    type: "git",
    url: "git+https://github.com/ajantoniou/uploadcheck.git",
    directory: spec.repositoryDirectory
  });
  assertDeepEqual(`${spec.label} bin`, pkg.bin, spec.bin);
  assertDeepEqual(`${spec.label} files field`, pkg.files, spec.filesField);
  verifyBinShebangs(spec.dir, pkg.bin);

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
  if (spec.dir === "mcp-server") {
    verifyMcpInstallManifest(readJson("mcp-server/mcp-install.json"));
    verifyMcpRuntimeToolSurface();
  }

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
  if (manifest.distribution_status !== "public_github_mcp_not_npm_self_serve") throw new Error("MCP install manifest must declare public GitHub / not npm distribution status.");
  if (manifest.current_install !== "public_github_clone_or_local_checkout") throw new Error("MCP install manifest must keep public GitHub/local checkout as the current install path.");
  if (!String(manifest.future_npm_install || "").includes("after @uploadcheck/mcp is published")) throw new Error("MCP install manifest must guard npx snippets until npm publish.");
  if (manifest.hosted_api_base_url !== "https://api.uploadcheck.app") throw new Error("MCP install manifest must use the UploadCheck custom API base URL.");
  if (!manifest.codex_local?.toml?.includes("[mcp_servers.uploadcheck]")) throw new Error("MCP install manifest must include Codex TOML.");
  if (!manifest.codex_local?.toml?.includes('UPLOADCHECK_API_KEY = "<workspace_api_key>"')) {
    throw new Error("MCP install manifest Codex TOML must include UPLOADCHECK_API_KEY placeholder for public GitHub installs.");
  }
  for (const client of ["claude_desktop", "cursor"]) {
    const server = manifest[client]?.json?.mcpServers?.uploadcheck;
    if (!server) throw new Error(`MCP install manifest missing ${client} uploadcheck server.`);
    assertDeepEqual(`${client} command`, server.command, "npx");
    assertDeepEqual(`${client} args`, server.args, ["-y", "@uploadcheck/mcp"]);
  }
  for (const client of ["claude_desktop_local", "cursor_local"]) {
    const server = manifest[client]?.json?.mcpServers?.uploadcheck;
    if (!server) throw new Error(`MCP install manifest missing ${client} uploadcheck server.`);
    assertDeepEqual(`${client} command`, server.command, "node");
    if (!server.args?.[0]?.includes("/absolute/path/to/uploadcheck/mcp-server/index.mjs")) {
      throw new Error(`MCP install manifest ${client} must use the public GitHub/local checkout path.`);
    }
    if (server.env?.UPLOADCHECK_API_KEY !== "<workspace_api_key>") {
      throw new Error(`MCP install manifest ${client} must include UPLOADCHECK_API_KEY placeholder.`);
    }
  }
  if (!manifest.notes?.some((note) => note.includes("workspace API key tied to included plan minutes"))) {
    throw new Error("MCP install manifest must state public GitHub/local users need workspace API keys tied to included plan minutes.");
  }
  if (!manifest.recommended_first_calls?.includes("qc_get_npo_pipeline_handoff")) {
    throw new Error("MCP install manifest must recommend the NPO pipeline handoff tool.");
  }
}

function verifyMcpRuntimeToolSurface() {
  const source = readFileSync(resolve(root, "mcp-server/index.mjs"), "utf8");
  const registeredTools = Array.from(source.matchAll(/server\.tool\(\s*\n\s*"([^"]+)"/g)).map((match) => match[1]);
  const expectedPublicTools = getMcpToolNames();
  assertDeepEqual("MCP runtime registered tools", registeredTools, expectedPublicTools);
  for (const forbidden of ["qc_run_gemini_backtest", "gemini-backtest", "gemini_watch", "omni_watch", "deep_ai_review", "qwen"]) {
    if (registeredTools.some((tool) => tool.toLowerCase().includes(forbidden.toLowerCase()))) {
      throw new Error(`MCP runtime must not expose internal oracle tool: ${forbidden}`);
    }
  }
}

function verifyBinShebangs(dir, bin) {
  for (const [name, target] of Object.entries(bin)) {
    const fullPath = resolve(root, dir, target.replace(/^\.\//, ""));
    const source = readFileSync(fullPath, "utf8");
    if (!source.startsWith("#!/usr/bin/env node")) {
      throw new Error(`${name} bin must start with #!/usr/bin/env node.`);
    }
    const mode = statSync(fullPath).mode;
    if ((mode & 0o111) === 0) {
      throw new Error(`${name} bin must be executable.`);
    }
  }
}
