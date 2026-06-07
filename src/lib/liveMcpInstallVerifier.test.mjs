import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

function listen(handler) {
  const server = createServer(handler);
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({ server, baseUrl: `http://127.0.0.1:${address.port}` });
    });
  });
}

describe("live MCP install verifier", () => {
  it("passes when the hosted endpoint returns the current MCP install artifact", async () => {
    const install = JSON.parse(readFileSync("public/mcp-install.json", "utf8"));
    const { server, baseUrl } = await listen((_req, res) => {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(install));
    });

    try {
      const result = await execFileAsync("node", ["scripts/verify-live-mcp-install.mjs"], {
        cwd: process.cwd(),
        env: { ...process.env, UPLOADCHECK_LIVE_MCP_INSTALL_BASE_URL: baseUrl }
      });
      expect(JSON.parse(result.stdout)).toMatchObject({
        ok: true,
        package: "@uploadcheck/mcp",
        distributionStatus: "private_mcp_beta_not_public_self_serve",
        currentInstall: "local_checkout_or_private_clone"
      });
    } finally {
      server.close();
    }
  });

  it("blocks when the hosted MCP install artifact is missing", async () => {
    const { server, baseUrl } = await listen((_req, res) => {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("not found");
    });

    try {
      await expect(execFileAsync("node", ["scripts/verify-live-mcp-install.mjs"], {
        cwd: process.cwd(),
        env: { ...process.env, UPLOADCHECK_LIVE_MCP_INSTALL_BASE_URL: baseUrl }
      })).rejects.toMatchObject({
        stderr: expect.stringContaining("returned HTTP 404")
      });
    } finally {
      server.close();
    }
  });

  it("blocks when the hosted MCP install artifact omits private-beta status", async () => {
    const install = JSON.parse(readFileSync("public/mcp-install.json", "utf8"));
    delete install.distribution_status;
    const { server, baseUrl } = await listen((_req, res) => {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(install));
    });

    try {
      await expect(execFileAsync("node", ["scripts/verify-live-mcp-install.mjs"], {
        cwd: process.cwd(),
        env: { ...process.env, UPLOADCHECK_LIVE_MCP_INSTALL_BASE_URL: baseUrl }
      })).rejects.toMatchObject({
        stderr: expect.stringContaining("missing_private_beta_status")
      });
    } finally {
      server.close();
    }
  });
});
