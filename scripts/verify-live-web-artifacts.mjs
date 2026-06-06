#!/usr/bin/env node

const DEFAULT_WEB_BASE_URL = "https://uploadcheck.app";
const MIN_DEMO_BYTES = 1000;

export function validateWebArtifacts({ productHunt, pricing, sampleReport, agenticApi, sitemap, llms, demo }) {
  const errors = [];
  requiredText(errors, "product_hunt", productHunt, [
    "UploadCheck Product Hunt Launch",
    "Quality check videos, podcasts, and clips before you upload.",
    "/demo/uploadcheck-product-hunt-demo.mp4",
    "/product-hunt-launch-kit.json",
    "npm run launch:doctor",
    "npm run launch:check"
  ]);
  requiredText(errors, "pricing", pricing, [
    "UploadCheck Pricing",
    "$99/mo",
    "2,400 checked minutes",
    "$299/mo",
    "10,000 checked minutes",
    "Deep model review stays internal",
    "deterministic capture-rate measurement"
  ]);
  requiredText(errors, "sample_report", sampleReport, [
    "Sample UploadCheck Report",
    "/sample-reports/index.json",
    "/sample-reports/clean-upload.json",
    "/sample-reports/caption-warning.json",
    "/sample-reports/duplicate-characters-block.json",
    "Duplicate crowd characters",
    "distinct character variation"
  ]);
  requiredText(errors, "agentic_api", agenticApi, [
    "Agentic Media QC API and MCP Server",
    "MCP server",
    "uploadcheck",
    "@uploadcheck/cli",
    "@uploadcheck/mcp",
    "/agent-manifest.json",
    "/openapi.json"
  ]);
  requiredText(errors, "sitemap", sitemap, [
    "https://uploadcheck.app/product-hunt/",
    "https://uploadcheck.app/pricing/",
    "https://uploadcheck.app/sample-report/",
    "https://uploadcheck.app/agentic-media-qc-api/"
  ]);
  requiredText(errors, "llms", llms, [
    "UploadCheck.app",
    "https://uploadcheck.app/product-hunt/",
    "https://uploadcheck.app/pricing/",
    "https://uploadcheck.app/sample-report/",
    "https://api.uploadcheck.app/v1/launch-evidence",
    "Checked minutes are deterministic publish-readiness QC minutes"
  ]);
  if (!demo?.ok) {
    errors.push(error("demo_clip", "missing_demo_clip", "Demo clip must return HTTP 200."));
  }
  if (!String(demo?.contentType || "").includes("video/mp4")) {
    errors.push(error("demo_clip.content_type", "wrong_content_type", "Demo clip must return video/mp4."));
  }
  if (!Number.isFinite(Number(demo?.bytes)) || Number(demo.bytes) < MIN_DEMO_BYTES) {
    errors.push(error("demo_clip.bytes", "demo_too_small", "Demo clip must be a non-empty MP4 artifact."));
  }
  return errors;
}

async function main() {
  const baseUrl = trimTrailingSlash(process.env.UPLOADCHECK_LIVE_WEB_BASE_URL || DEFAULT_WEB_BASE_URL);
  const urls = {
    productHunt: `${baseUrl}/product-hunt/`,
    pricing: `${baseUrl}/pricing/`,
    sampleReport: `${baseUrl}/sample-report/`,
    agenticApi: `${baseUrl}/agentic-media-qc-api/`,
    sitemap: `${baseUrl}/sitemap.xml`,
    llms: `${baseUrl}/llms.txt`,
    demo: `${baseUrl}/demo/uploadcheck-product-hunt-demo.mp4`
  };

  try {
    const [productHunt, pricing, sampleReport, agenticApi, sitemap, llms, demo] = await Promise.all([
      fetchText(urls.productHunt, "Product Hunt page"),
      fetchText(urls.pricing, "pricing page"),
      fetchText(urls.sampleReport, "sample report page"),
      fetchText(urls.agenticApi, "agentic API page"),
      fetchText(urls.sitemap, "sitemap"),
      fetchText(urls.llms, "llms.txt"),
      fetchBinaryMeta(urls.demo, "demo clip")
    ]);
    const errors = validateWebArtifacts({ productHunt, pricing, sampleReport, agenticApi, sitemap, llms, demo });
    if (errors.length) {
      fail(`UploadCheck live web artifacts: NOT READY\n${JSON.stringify({ urls, errors }, null, 2)}`);
    }
    console.log(JSON.stringify({
      ok: true,
      urls,
      pages: 6,
      demoBytes: demo.bytes,
      demoContentType: demo.contentType
    }, null, 2));
  } catch (err) {
    fail(`UploadCheck live web artifacts: NOT READY\n${err.message}`);
  }
}

async function fetchText(url, label) {
  const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
  const text = await response.text();
  if (!response.ok) throw new Error(`${label} ${url} returned HTTP ${response.status}`);
  return text;
}

async function fetchBinaryMeta(url, label) {
  const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
  const contentType = response.headers.get("content-type") || "";
  const contentLength = Number(response.headers.get("content-length") || 0);
  const body = await response.arrayBuffer();
  if (!response.ok) throw new Error(`${label} ${url} returned HTTP ${response.status}`);
  return {
    ok: response.ok,
    contentType,
    bytes: contentLength || body.byteLength
  };
}

function requiredText(errors, key, text, values) {
  for (const value of values) {
    if (!String(text || "").includes(value)) {
      errors.push(error(key, "missing_text", `${key} missing: ${value}`));
    }
  }
}

function error(key, reason, detail) {
  return { key, reason, detail };
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function trimTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], "file://").href) {
  await main();
}
