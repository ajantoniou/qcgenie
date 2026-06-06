import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { validateWebArtifacts } from "../../scripts/verify-live-web-artifacts.mjs";

function readText(path) {
  return readFileSync(resolve(path), "utf8");
}

function currentArtifacts() {
  return {
    productHunt: readText("public/product-hunt/index.html"),
    pricing: readText("public/pricing/index.html"),
    sampleReport: readText("public/sample-report/index.html"),
    agenticApi: readText("public/agentic-media-qc-api/index.html"),
    sitemap: readText("public/sitemap.xml"),
    llms: readText("public/llms.txt"),
    demo: {
      ok: true,
      contentType: "video/mp4",
      bytes: statSync(resolve("public/demo/uploadcheck-product-hunt-demo.mp4")).size
    }
  };
}

describe("live web artifacts verifier", () => {
  it("accepts the current Product Hunt web artifact contract", () => {
    expect(validateWebArtifacts(currentArtifacts())).toEqual([]);
  });

  it("rejects stale web copy missing pricing and launch proof", () => {
    const artifacts = currentArtifacts();
    artifacts.pricing = artifacts.pricing.replace("0.0157 COGS cents/minute", "unlimited AI review");
    artifacts.productHunt = artifacts.productHunt.replace("npm run launch:doctor", "launch soon");
    artifacts.demo = { ok: true, contentType: "text/html", bytes: 12 };

    expect(validateWebArtifacts(artifacts).map((error) => error.reason)).toEqual(expect.arrayContaining([
      "missing_text",
      "wrong_content_type",
      "demo_too_small"
    ]));
  });
});
