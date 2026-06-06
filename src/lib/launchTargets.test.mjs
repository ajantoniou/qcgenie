import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildLaunchCheck } from "../../launch-check.mjs";

function readJson(path) {
  return JSON.parse(readFileSync(resolve(path), "utf8"));
}

describe("UploadCheck launch targets", () => {
  it("publishes DNS records for the real Render service slugs", () => {
    const targets = readJson("public/launch-targets.json");

    expect(targets.render.web_service).toMatchObject({
      display_name: "uploadcheck-web",
      service_id: "srv-d8hk200jo6nc73er93u0",
      immutable_render_host: "qcgenie-web.onrender.com"
    });
    expect(targets.render.api_service).toMatchObject({
      display_name: "uploadcheck-api",
      service_id: "srv-d8hk74svikkc73cu6atg",
      immutable_render_host: "qcgenie-api.onrender.com"
    });
    expect(targets.dns_records.map((record) => [record.name, record.target])).toEqual([
      ["@", "qcgenie-web.onrender.com"],
      ["www", "qcgenie-web.onrender.com"],
      ["api", "qcgenie-api.onrender.com"]
    ]);
    expect(targets.verification_commands).toContain("curl -i https://qcgenie-api.onrender.com/v1/launch-status");
  });

  it("links launch targets from the public agent manifest", () => {
    const manifest = readJson("public/agent-manifest.json");

    expect(manifest.launch_targets_url).toBe("https://qcgenie-api.onrender.com/launch-targets.json");
  });

  it("uses launch-targets.json in the launch checker domain plan", async () => {
    const result = await buildLaunchCheck({
      apiBaseUrl: "https://api.example.test",
      fetchImpl: async (url) => ({
        ok: true,
        status: String(url).includes("/v1/readiness") ? 200 : 200,
        json: async () => ({ readyForProductHunt: true })
      }),
      resolver: async () => [{ address: "216.24.57.1", family: 4 }]
    });

    expect(result.domains.map((domain) => [domain.host, domain.expectedRenderHost])).toEqual([
      ["uploadcheck.app", "qcgenie-web.onrender.com"],
      ["www.uploadcheck.app", "qcgenie-web.onrender.com"],
      ["api.uploadcheck.app", "qcgenie-api.onrender.com"]
    ]);
  });
});
