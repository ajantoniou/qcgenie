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
    expect(html).toContain("Included minutes reset monthly and do not roll over");
    expect(html).toContain("no public self-serve extra-minute or credit purchase flow yet");
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

  it("shows current agent install steps with npm and GitHub options", () => {
    const html = readFileSync("public/agent-install/index.html", "utf8");
    const apiHtml = readFileSync("public/agentic-media-qc-api/index.html", "utf8");
    const pipelineDocs = readFileSync("docs/PIPELINE-INTEGRATION.md", "utf8");

    expect(html).toContain("public GitHub clone, or local checkout");
    expect(html).toContain("/absolute/path/to/uploadcheck/mcp-server/index.mjs");
    expect(html).toContain("~/.codex/config.toml");
    expect(html).toContain(".cursor/mcp.json");
    expect(html).toContain("qc_get_cost_basis");
    expect(html).toContain("qc_run_local_file");
    expect(html).toContain("Users need a workspace API key tied to included plan minutes.");
    expect(html).toContain("/mcp-install.json");
    expect(html).toContain("npx -y @drantoniou/uploadcheck-mcp");
    expect(apiHtml).toContain("/agent-install/");
    expect(apiHtml).toContain("supports <code>npx -y @drantoniou/uploadcheck-mcp</code>, the public GitHub repo, or a local checkout");
    expect(apiHtml).toContain("Authorization: Bearer &lt;workspace_api_key&gt;");
    expect(apiHtml).toContain("Workspace keys are tied to included plan minutes or an operator-created account.");
    expect(apiHtml).toContain("curl https://api.uploadcheck.app/v1/qc/jobs");
    expect(apiHtml).toContain("Checked minutes are deterministic publish-readiness QC minutes.");
    expect(apiHtml).toContain("supports <code>npx -y @drantoniou/uploadcheck-mcp</code>, the public GitHub repo, or a local checkout");
    expect(pipelineDocs).toContain("Apply fixes only to the exact flagged spans");
    expect(pipelineDocs).toContain("Do not broadly rewrite the video");
    expect(pipelineDocs).toContain("agents are repair agents, not reviewers");
  });

  it("keeps answer-engine copy aligned with public npm MCP distribution", () => {
    const llms = readFileSync("public/llms.txt", "utf8");
    const aiReviewHtml = readFileSync("public/ai-video-review-before-upload/index.html", "utf8");
    const readme = readFileSync("README.md", "utf8");

    expect(llms).toContain("Current distribution state: public npm");
    expect(llms).toContain("Current install path: public npm or GitHub checkout.");
    expect(llms).toContain("Use @drantoniou/uploadcheck and @drantoniou/uploadcheck-mcp from npm.");
    expect(llms).toContain("Yes for npx, public GitHub, or local installs with a workspace API key.");
    expect(aiReviewHtml).toContain("npx -y @drantoniou/uploadcheck-mcp");
    expect(readme).toContain("The current agent distribution state is public npm MCP install plus public GitHub/local checkout fallback.");
    expect(readme).toContain("CLI/package options: `@drantoniou/uploadcheck` and `@drantoniou/uploadcheck-mcp`");
  });
});
