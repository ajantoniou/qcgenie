import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("deployment cutover docs", () => {
  it("includes hosted media-ingress verification in the post-Render launch checklist", () => {
    const text = readFileSync(resolve("docs/DEPLOYMENT-CUTOVER.md"), "utf8");

    expect(text).toContain("npm run media-ingress:verify");
    expect(text).toContain("UPLOADCHECK_MEDIA_INGRESS_BASE_URL=https://api.uploadcheck.app UPLOADCHECK_API_KEY=<private_bearer> npm run media-ingress:verify");
    expect(text).toContain("The hosted media-ingress probe sends tiny inline video/audio payloads and a signed-upload audio payload");
    expect(text).toContain("not the SHA-256 hash stored on Render");
  });

  it("documents stale hosted MCP and launch-command coverage redeploy checks", () => {
    const text = readFileSync(resolve("docs/DEPLOYMENT-CUTOVER.md"), "utf8");
    const checklist = readFileSync(resolve("PUBLISH-CHECKLIST.md"), "utf8");

    expect(text).toContain("hosted launch doctor/evidence verifiers also require `saas-basics:verify`, `mcp-install:verify`, `private-mcp-beta:verify`, `private-mcp-beta:evidence`, `anthropic-directory:verify`, and `product-agent:verify`");
    expect(text).toContain("npm run live-mcp-install:verify");
    expect(text).toContain("hosted `/mcp-install.json`");
    expect(checklist).toContain("launch-status.json, product-hunt-launch-kit.json, mcp-install.json");
    expect(checklist).toContain("npm run live-launch-doctor:verify");
    expect(checklist).toContain("hosted `/mcp-install.json` is missing");
  });
});
