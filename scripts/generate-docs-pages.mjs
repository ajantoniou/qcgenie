#!/usr/bin/env node
// Generates the static /docs, /docs/mcp, and /docs/api pages from the live
// MCP tool catalog and REST endpoint list so the documentation stays in sync
// with src/lib/agentic.ts. The homepage and Agent Workflow view link here so
// the full machinery lives in docs, not on the marketing surface.

import { mkdir, writeFile, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

// agentic.ts is TypeScript with no runtime-only syntax in the data tables, so
// we read and lightly transpile the two exported arrays we need rather than
// pulling in a TS loader.
const agenticSource = await readFile(resolve(root, "src/lib/agentic.ts"), "utf8");

function extractArray(name) {
  const marker = `export const ${name}`;
  const start = agenticSource.indexOf(marker);
  if (start === -1) throw new Error(`Could not find ${name} in agentic.ts`);
  // Skip past the `= ` assignment so a `: McpTool[]` type annotation between the
  // name and the value does not get mistaken for the array literal.
  const assign = agenticSource.indexOf("=", start);
  const open = agenticSource.indexOf("[", assign);
  let depth = 0;
  let end = open;
  for (let i = open; i < agenticSource.length; i += 1) {
    const ch = agenticSource[i];
    if (ch === "[") depth += 1;
    if (ch === "]") {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  const literal = agenticSource.slice(open, end + 1);
  // The array literals use plain JS object syntax with string/array values.
  // eslint-disable-next-line no-new-func
  return Function(`"use strict"; return (${literal});`)();
}

const MCP_TOOLS = extractArray("MCP_TOOLS");
const AGENT_API_ENDPOINTS = extractArray("AGENT_API_ENDPOINTS");

const escape = (value) =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const DOCS_STYLE = `
    <style>
      .docNav { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 18px; }
      .docNav a {
        text-decoration: none; font-weight: 800; font-size: 14px;
        padding: 9px 14px; border-radius: 8px; border: 1px solid #cfd8e3;
        background: #ffffff; color: #101827; min-height: 40px;
        display: inline-flex; align-items: center;
      }
      .docNav a.current { background: #0f766e; color: #ffffff; border-color: #0f766e; }
      .refList { display: grid; gap: 12px; margin-top: 16px; }
      .refItem { background: #ffffff; border: 1px solid #dce3ec; border-radius: 10px; padding: 18px; }
      .refItem h3 {
        margin: 0; font-size: 16px;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        color: #0f766e; overflow-wrap: anywhere;
      }
      .refItem p { margin: 8px 0 0; color: #475569; line-height: 1.55; }
      .refMeta { display: grid; gap: 6px; margin-top: 12px; }
      .refMeta code {
        display: block; background: #0f1623; color: #c7f9ee; border-radius: 8px;
        padding: 9px 11px; font-size: 13px; overflow-wrap: anywhere;
      }
      .refMeta span { color: #64748b; font-size: 12px; font-weight: 800; text-transform: uppercase; }
      .method {
        display: inline-block; font-size: 11px; font-weight: 900; border-radius: 6px;
        padding: 3px 7px; margin-right: 8px; vertical-align: middle;
      }
      .method.get { background: #d1fae5; color: #047857; }
      .method.post { background: #dbeafe; color: #1d4ed8; }
      .method.put { background: #fef3c7; color: #b45309; }
      .method.delete { background: #fee2e2; color: #b91c1c; }
    </style>`;

function shell({ title, description, canonical, body }) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="canonical" href="${canonical}" />
    <link rel="stylesheet" href="/seo-pages.css" />
    <meta name="description" content="${escape(description)}" />
    <title>${escape(title)}</title>${DOCS_STYLE}
  </head>
  <body>
    <main class="page">
      <nav class="nav">
        <a class="brand" href="/"><span>U</span>UploadCheck.app</a>
        <div class="navLinks"><a href="/pricing/">Pricing</a><a href="/sample-report/">Sample report</a><a href="/agent-install/">Install</a><a href="/docs/">Docs</a></div>
      </nav>
${body}
      <footer class="footer">UploadCheck is the QC authority. Agents repair only the flagged spans they can reach, then rerun before upload. Checked minutes are deterministic publish-readiness QC minutes.</footer>
    </main>
  </body>
</html>
`;
}

function docNav(current) {
  const links = [
    { href: "/docs/", label: "Overview", key: "home" },
    { href: "/docs/mcp/", label: "MCP reference", key: "mcp" },
    { href: "/docs/api/", label: "API reference", key: "api" },
    { href: "/agent-install/", label: "Install guide", key: "install" }
  ];
  return `<nav class="docNav" aria-label="Docs navigation">${links
    .map(
      (link) =>
        `<a href="${link.href}"${link.key === current ? ' class="current" aria-current="page"' : ""}>${link.label}</a>`
    )
    .join("")}</nav>`;
}

// ---- /docs ----
const docsHome = shell({
  title: "UploadCheck Docs | MCP, API, and Agent Install",
  description:
    "UploadCheck developer docs: the MCP tool reference, REST API reference, and agent install guide for Claude Code, Codex, Cursor, and MCP-capable agents.",
  canonical: "https://uploadcheck.app/docs/",
  body: `      <section class="hero">
        <div class="heroCopy">
          <h1>UploadCheck developer docs</h1>
          <p class="tagline">Everything an agent needs to run video QC before upload.</p>
          <p>UploadCheck exposes ${MCP_TOOLS.length} MCP tools and ${AGENT_API_ENDPOINTS.length} REST endpoints. Start with the install guide, then use the MCP or API reference to wire the QC loop into Claude Code, Codex, Cursor, or your own agent.</p>
          ${docNav("home")}
        </div>
        <aside class="panel">
          <h2>Quick start</h2>
          <ul>
            <li>Install: <code>npx -y uploadcheck-mcp</code></li>
            <li>Auth: <code>UPLOADCHECK_API_KEY=uck_...</code></li>
            <li>Run: <code>/check ./final-upload.mp4</code></li>
            <li>Handoff: <code>qc_get_cost_basis &rarr; qc_run_local_file &rarr; qc_get_report &rarr; qc_get_marker_csv</code></li>
          </ul>
        </aside>
      </section>
      <section class="section">
        <h2>Reference</h2>
        <div class="grid">
          <a class="card" href="/docs/mcp/" style="text-decoration:none"><h2>MCP reference</h2><p>All ${MCP_TOOLS.length} UploadCheck MCP tools with inputs and outputs for Claude Code, Codex, and Cursor.</p></a>
          <a class="card" href="/docs/api/" style="text-decoration:none"><h2>API reference</h2><p>All ${AGENT_API_ENDPOINTS.length} REST endpoints for jobs, reports, artifacts, uploads, and workspace keys.</p></a>
          <a class="card" href="/agent-install/" style="text-decoration:none"><h2>Install guide</h2><p>Per-client setup for Claude Code, Codex, Cursor, npm, and a local GitHub checkout.</p></a>
        </div>
      </section>
      <section class="section">
        <h2>Authentication</h2>
        <div class="twoGrid">
          <article class="answer"><h2>Workspace API key</h2><p>Every MCP or REST caller sends <code>Authorization: Bearer &lt;workspace_api_key&gt;</code>. Keys are tied to included plan minutes or an operator-created account. There is no public self-serve extra-minute or credit purchase flow yet.</p></article>
          <article class="answer"><h2>Machine-readable specs</h2><p>Pull the full OpenAPI document at <code>/openapi.json</code>, the agent manifest at <code>/agent-manifest.json</code>, and the discovery file at <code>/llms.txt</code>.</p></article>
        </div>
      </section>`
});

// ---- /docs/mcp ----
const mcpItems = MCP_TOOLS.map((tool) => {
  const inputs = tool.inputs && tool.inputs.length ? tool.inputs.join(", ") : "none";
  const outputs = tool.outputs && tool.outputs.length ? tool.outputs.join(", ") : "none";
  return `        <article class="refItem">
          <h3>${escape(tool.name)}</h3>
          <p>${escape(tool.purpose)}</p>
          <div class="refMeta">
            <span>Inputs</span>
            <code>${escape(inputs)}</code>
            <span>Outputs</span>
            <code>${escape(outputs)}</code>
          </div>
        </article>`;
}).join("\n");

const mcpDocs = shell({
  title: "UploadCheck MCP Tool Reference | UploadCheck.app",
  description: `Complete UploadCheck MCP tool reference: all ${MCP_TOOLS.length} tools with inputs and outputs for Claude Code, Codex, Cursor, and MCP-capable agents.`,
  canonical: "https://uploadcheck.app/docs/mcp/",
  body: `      <section class="hero">
        <div class="heroCopy">
          <h1>MCP tool reference</h1>
          <p class="tagline">All ${MCP_TOOLS.length} UploadCheck MCP tools.</p>
          <p>The <code>uploadcheck</code> MCP server exposes these tools to Claude Code, Codex, Cursor, and any MCP-capable agent. A typical run is <code>qc_get_cost_basis &rarr; qc_run_local_file &rarr; qc_get_report &rarr; qc_get_marker_csv</code>.</p>
          ${docNav("mcp")}
        </div>
        <aside class="panel">
          <h2>Connect the server</h2>
          <ul>
            <li>npm: <code>npx -y uploadcheck-mcp</code></li>
            <li>Server name: <code>uploadcheck</code></li>
            <li>Auth: <code>UPLOADCHECK_API_KEY</code></li>
            <li>Base URL: <code>UPLOADCHECK_API_BASE_URL</code></li>
          </ul>
        </aside>
      </section>
      <section class="section">
        <h2>Tools</h2>
        <div class="refList">
${mcpItems}
        </div>
      </section>`
});

// ---- /docs/api ----
const methodOf = (methodPath) => methodPath.trim().split(/\s+/)[0].toLowerCase();
const apiItems = AGENT_API_ENDPOINTS.map((endpoint) => {
  const method = methodOf(endpoint.methodPath);
  const path = endpoint.methodPath.trim().slice(endpoint.methodPath.trim().indexOf(" ") + 1);
  return `        <article class="refItem">
          <h3><span class="method ${method}">${method.toUpperCase()}</span>${escape(path)}</h3>
          <p>${escape(endpoint.purpose)}</p>
        </article>`;
}).join("\n");

const apiDocs = shell({
  title: "UploadCheck REST API Reference | UploadCheck.app",
  description: `Complete UploadCheck REST API reference: all ${AGENT_API_ENDPOINTS.length} endpoints for QC jobs, reports, artifacts, uploads, usage, and workspace API keys.`,
  canonical: "https://uploadcheck.app/docs/api/",
  body: `      <section class="hero">
        <div class="heroCopy">
          <h1>REST API reference</h1>
          <p class="tagline">All ${AGENT_API_ENDPOINTS.length} UploadCheck endpoints.</p>
          <p>Every request authenticates with <code>Authorization: Bearer &lt;workspace_api_key&gt;</code> against <code>https://api.uploadcheck.app</code>. The full machine-readable spec lives at <a href="/openapi.json">/openapi.json</a>.</p>
          ${docNav("api")}
        </div>
        <aside class="panel">
          <h2>Base</h2>
          <ul>
            <li>Host: <code>api.uploadcheck.app</code></li>
            <li>Auth: <code>Bearer &lt;workspace_api_key&gt;</code></li>
            <li>Spec: <code>/openapi.json</code></li>
            <li>Manifest: <code>/agent-manifest.json</code></li>
          </ul>
        </aside>
      </section>
      <section class="section">
        <h2>Endpoints</h2>
        <div class="refList">
${apiItems}
        </div>
      </section>`
});

async function emit(relPath, html) {
  const target = resolve(root, "public", relPath);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, html, "utf8");
  return relPath;
}

const written = await Promise.all([
  emit("docs/index.html", docsHome),
  emit("docs/mcp/index.html", mcpDocs),
  emit("docs/api/index.html", apiDocs)
]);

console.log(`Generated docs pages (${MCP_TOOLS.length} MCP tools, ${AGENT_API_ENDPOINTS.length} endpoints):`);
for (const file of written) console.log(`  public/${file}`);
