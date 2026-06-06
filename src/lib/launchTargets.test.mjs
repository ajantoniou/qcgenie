import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildLaunchCheck } from "../../launch-check.mjs";
import { formatLaunchDns } from "../../launch-dns.mjs";

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
    expect(targets.http_targets.find((target) => target.host === "uploadcheck.app").expected_addresses).toContain("216.24.57.1");
  });

  it("prints copy-paste DNS cutover records from launch-targets.json", () => {
    const targets = readJson("public/launch-targets.json");
    const formatted = formatLaunchDns(targets);
    const cliOutput = execFileSync("npm", ["run", "--silent", "launch:dns"], {
      cwd: resolve("."),
      encoding: "utf8"
    });

    expect(cliOutput).toBe(`${formatted}\n`);
    for (const record of targets.dns_records) {
      expect(cliOutput).toContain(`| ${record.type} | ${record.name} | ${record.host} | ${record.target} |`);
    }
    for (const command of targets.verification_commands) {
      expect(cliOutput).toContain(`- ${command}`);
    }
  });

  it("links launch targets from the public agent manifest", () => {
    const manifest = readJson("public/agent-manifest.json");

    expect(manifest.launch_targets_url).toBe("https://api.uploadcheck.app/launch-targets.json");
  });

  it("keeps launch status DNS blockers aligned with launch targets", () => {
    const targets = readJson("public/launch-targets.json");
    const launchStatus = readJson("public/launch-status.json");
    const customDomain = launchStatus.remaining_blockers.find((blocker) => blocker.id === "custom_domain");

    expect(customDomain.required_dns).toEqual(
      targets.dns_records.map((record) => ({
        type: record.type,
        name: record.name,
        target: record.target
      }))
    );
  });

  it("keeps deployment cutover docs aligned with launch targets", () => {
    const targets = readJson("public/launch-targets.json");
    const docs = readFileSync("docs/DEPLOYMENT-CUTOVER.md", "utf8");

    expect(docs).toContain("https://qcgenie-api.onrender.com/launch-targets.json");
    for (const record of targets.dns_records) {
      expect(docs).toContain(`| ${record.type} | \`${record.name}\` | \`${record.target}\``);
    }
    for (const target of targets.http_targets) {
      expect(docs).toContain(`curl -i ${target.url}`);
    }
  });

  it("uses launch-targets.json in the launch checker domain plan", async () => {
    const result = await buildLaunchCheck({
      apiBaseUrl: "https://api.example.test",
      fetchImpl: async (url) => ({
        ok: true,
        status: String(url).includes("/v1/readiness") ? 200 : 200,
        json: async () => ({ readyForProductHunt: true })
      }),
      resolver: async () => [{ address: "216.24.57.1", family: 4 }],
      cnameResolver: async (host) => host === "api.uploadcheck.app"
        ? ["qcgenie-api.onrender.com"]
        : ["qcgenie-web.onrender.com"]
    });

    expect(result.domains.map((domain) => [domain.host, domain.expectedRenderHost])).toEqual([
      ["uploadcheck.app", "qcgenie-web.onrender.com"],
      ["www.uploadcheck.app", "qcgenie-web.onrender.com"],
      ["api.uploadcheck.app", "qcgenie-api.onrender.com"]
    ]);
  });
});
