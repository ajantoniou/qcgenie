import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildLaunchEvidence, formatLaunchEvidence, redactLaunchText } from "../../launch-evidence.mjs";

describe("launch evidence", () => {
  it("summarizes launch doctor results without raw secret output", () => {
    const evidence = buildLaunchEvidence({
      generatedAt: "2026-06-06T00:00:00.000Z",
      report: {
        ok: false,
        status: "blocked",
        blockers: ["checkout"],
        results: [{
          id: "checkout",
          label: "Checkout",
          ok: false,
          status: 1,
          commandString: "UPLOADCHECK_API_KEY=uck_live_secret npm run launch:checkout",
          stdout: "url: https://checkout.example/creator-secret\nvariant https://uploadcheck.lemonsqueezy.com/checkout/buy/123456",
          stderr: "/tmp/uploadcheck/sidecar-secret/file.json"
        }]
      }
    });
    const json = JSON.stringify(evidence);
    const text = formatLaunchEvidence(evidence);

    expect(evidence.ok).toBe(false);
    expect(evidence.results[0]).toMatchObject({
      id: "checkout",
      commandString: "UPLOADCHECK_API_KEY=<private_bearer> npm run launch:checkout",
      summary: "url: https://checkout.example<checkout_path>"
    });
    expect(evidence.results[0].outputSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(json).not.toContain("uck_live_secret");
    expect(json).not.toContain("creator-secret");
    expect(json).not.toContain("123456");
    expect(json).not.toContain("/tmp/uploadcheck/sidecar-secret");
    expect(text).toContain("UploadCheck launch evidence: NOT READY");
  });

  it("redacts checkout and bearer patterns in free text", () => {
    expect(redactLaunchText("UPLOADCHECK_API_KEY=uck_secret https://checkout.example/network-secret")).toBe("UPLOADCHECK_API_KEY=<private_bearer> https://checkout.example<checkout_path>");
    expect(redactLaunchText("https://uploadcheck.lemonsqueezy.com/checkout/buy/987654")).toBe("https://uploadcheck.lemonsqueezy.com/checkout/buy/<variant_id>");
  });

  it("prints machine-readable local evidence for operators", () => {
    const result = spawnSync("npm", ["run", "--silent", "launch:evidence", "--", "--json"], {
      cwd: resolve("."),
      encoding: "utf8",
      env: { ...process.env, RENDER_API_KEY: "" }
    });
    const payload = JSON.parse(result.stdout);

    expect(result.status).toBe(1);
    expect(payload.name).toBe("UploadCheck.app Launch Evidence");
    expect(payload.ok).toBe(false);
    expect(payload.blockers).toEqual(expect.arrayContaining(["checkout", "hosted-media-ingress", "readiness"]));
    expect(JSON.stringify(payload)).not.toContain("uck_");
    expect(JSON.stringify(payload)).not.toContain("/tmp/uploadcheck/");
    expect(payload.results.find((result) => result.id === "hosted-media-ingress").commandString).toContain("UPLOADCHECK_API_KEY=<private_bearer>");
  }, 15_000);
});
