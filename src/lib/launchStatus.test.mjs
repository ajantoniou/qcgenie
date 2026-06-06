import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readJson(path) {
  return JSON.parse(readFileSync(resolve(path), "utf8"));
}

describe("public launch status", () => {
  it("publishes the current Product Hunt go/no-go state and blockers", () => {
    const status = readJson("public/launch-status.json");

    expect(status.product_hunt_ready).toBe(false);
    expect(status.status).toMatchObject({
      api: "pass",
      agent_preflight: "pass",
      api_auth: "pass",
      demo_clip: "pass",
      checkout: "blocked",
      custom_domain: "blocked",
      secret_encryption: "blocked",
      persistence: "blocked",
      storage: "blocked"
    });
    expect(status.remaining_blockers.map((blocker) => blocker.id)).toEqual([
      "checkout",
      "custom_domain",
      "secret_encryption",
      "persistence",
      "storage"
    ]);
    expect(status.operator_commands).toEqual(expect.arrayContaining([
      "npm run render:validate-env",
      "npm run launch:check",
      "npm run readiness:check"
    ]));
    expect(status.go_no_go_rule).toContain("readyForProductHunt=true");
  });

  it("links launch status from public agent metadata", () => {
    const manifest = readJson("public/agent-manifest.json");
    const openapi = readJson("public/openapi.json");

    expect(manifest.launch_status_url).toBe("https://qcgenie-api.onrender.com/launch-status.json");
    expect(openapi.paths["/launch-status.json"].get.security).toEqual([]);
  });

  it("verifies launch status against readiness and discovery metadata", () => {
    const output = execFileSync("npm", ["run", "--silent", "launch-status:verify"], {
      cwd: resolve("."),
      encoding: "utf8"
    });

    expect(output).toContain("Launch status metadata matches readiness");
  });
});
