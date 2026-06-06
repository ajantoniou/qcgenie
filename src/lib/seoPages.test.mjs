import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const pages = [
  ["youtube-video-qc", "Video Quality Checker Before YouTube Upload"],
  ["podcast-audio-qc", "Podcast Audio QC Before Publishing"],
  ["shorts-reels-qc", "Shorts and Reels Clip Quality Check"],
  ["audio-garble-checker", "Audio Garble and Dropout Checker"],
  ["agentic-media-qc-api", "Agentic Media QC API and MCP Server"],
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
    expect(html).toContain("npm run launch:check");
  });
});
