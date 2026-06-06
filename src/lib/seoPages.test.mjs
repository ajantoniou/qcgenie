import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const pages = [
  ["youtube-video-qc", "Video Quality Checker Before YouTube Upload"],
  ["podcast-audio-qc", "Podcast Audio QC Before Publishing"],
  ["shorts-reels-qc", "Shorts and Reels Clip Quality Check"],
  ["audio-garble-checker", "Audio Garble and Dropout Checker"],
  ["agentic-media-qc-api", "Agentic Media QC API and MCP Server"],
  ["agent-install", "Install UploadCheck for Agents"],
  ["content-quality-check-before-publishing", "Content Quality Check Before Publishing"],
  ["ai-video-review-before-upload", "AI Video Review Tool Before Upload"],
  ["pricing", "UploadCheck Pricing"],
  ["sample-report", "Sample UploadCheck Report"],
  ["product-hunt", "UploadCheck Product Hunt Launch"]
];

describe("static SEO/AEO pages", () => {
  it("ships crawlable pages for creator search intents", () => {
    for (const [slug, h1] of pages) {
      const html = readFileSync(`public/${slug}/index.html`, "utf8");

      expect(html).toContain(`<h1>${h1}</h1>`);
      expect(html).toContain(`https://uploadcheck.app/${slug}/`);
      expect(html).toContain("Quality check videos, podcasts, and clips before you upload.");
      expect(html).toContain("UploadCheck.app");
    }
  });

  it("includes SEO pages in sitemap with canonical URLs", () => {
    const sitemap = readFileSync("public/sitemap.xml", "utf8");

    for (const [slug] of pages) {
      expect(sitemap).toContain(`<loc>https://uploadcheck.app/${slug}/</loc>`);
    }
  });

  it("keeps the Product Hunt page tied to live launch status", () => {
    const html = readFileSync("public/product-hunt/index.html", "utf8");

    expect(html).toContain("GET /v1/launch-status");
    expect(html).toContain("product_hunt_ready=true");
    expect(html).toContain("remaining_blockers is empty");
    expect(html).toContain("npm run launch:doctor exits 0");
    expect(html).toContain("npm run launch:check");
    expect(html).toContain("/product-hunt-launch-kit.json");
  });

  it("keeps pricing focused on deterministic publish-readiness minutes", () => {
    const html = readFileSync("public/pricing/index.html", "utf8");

    expect(html).toContain("Creator includes 2,400 checked minutes/month");
    expect(html).toContain("Generation cost vs QC cost");
    expect(html).toContain("Veo 3 Standard video+audio at $0.40 per generated second");
    expect(html).toContain("Higgsfield credit burn varies");
    expect(html).toContain("Studio includes 10,000 checked minutes/month");
    expect(html).toContain("Network includes 36,000 checked minutes/month");
    expect(html).toContain("feeds back to your LLM");
    expect(html).toContain("Included minutes cover deterministic publish-readiness QC");
    expect(html).toContain("not bundled AI review minutes");
    expect(html).toContain("Internal AI helps improve the engine");
    expect(html).toContain("stops before unapproved overage");
    expect(html).not.toContain("unlimited full-video AI review");
    expect(html).not.toContain("We never block a check");
  });

  it("links public sample report JSON artifacts from the sample page", () => {
    const html = readFileSync("public/sample-report/index.html", "utf8");

    expect(html).toContain("/sample-reports/index.json");
    expect(html).toContain("/sample-reports/clean-upload.json");
    expect(html).toContain("/sample-reports/caption-warning.json");
    expect(html).toContain("/sample-reports/duplicate-characters-block.json");
  });

  it("shows current agent install steps without pretending npm packages are published", () => {
    const html = readFileSync("public/agent-install/index.html", "utf8");
    const apiHtml = readFileSync("public/agentic-media-qc-api/index.html", "utf8");
    const pipelineDocs = readFileSync("docs/PIPELINE-INTEGRATION.md", "utf8");

    expect(html).toContain("git clone https://github.com/ajantoniou/uploadcheck.git");
    expect(html).toContain("/absolute/path/to/uploadcheck/mcp-server/index.mjs");
    expect(html).toContain("~/.codex/config.toml");
    expect(html).toContain(".cursor/mcp.json");
    expect(html).toContain("qc_get_cost_basis");
    expect(html).toContain("qc_run_local_file");
    expect(html).toContain("Do not use <code>npx -y @uploadcheck/mcp</code> until the npm package exists");
    expect(apiHtml).toContain("/agent-install/");
    expect(apiHtml).toContain("The npm package names are reserved in product copy, but the public npm packages are not published yet.");
    expect(pipelineDocs).toContain("Apply fixes only to the exact flagged spans");
    expect(pipelineDocs).toContain("Do not broadly rewrite the video");
    expect(pipelineDocs).toContain("agents are repair agents, not reviewers");
  });
});
