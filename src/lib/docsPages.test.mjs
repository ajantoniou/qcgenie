import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";
import { AGENT_API_ENDPOINTS, MCP_TOOLS } from "./agentic.ts";

describe("generated docs pages", () => {
  test("publish the current MCP and API interfaces with the scoped install command", async () => {
    const [overview, mcp, api] = await Promise.all([
      readFile("public/docs/index.html", "utf8"),
      readFile("public/docs/mcp/index.html", "utf8"),
      readFile("public/docs/api/index.html", "utf8")
    ]);

    expect(overview).toContain(`View ${MCP_TOOLS.length} MCP tools`);
    expect(overview).toContain(`View ${AGENT_API_ENDPOINTS.length} endpoints`);
    expect(mcp).toContain("npx -y @drantoniou/uploadcheck-mcp");
    expect(mcp).toContain("qc_run_local_file");
    expect(api).toContain("POST</span> /v1/qc/jobs");
    expect(api).toContain("GET</span> /v1/qc/jobs/{job_id}/report");
  });
});
