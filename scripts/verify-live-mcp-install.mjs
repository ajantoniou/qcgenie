#!/usr/bin/env node
import { validateMcpInstallArtifact } from "./verify-live-public-artifacts.mjs";

const DEFAULT_BASE_URL = "https://api.uploadcheck.app";

async function main() {
  const baseUrl = trimTrailingSlash(process.env.UPLOADCHECK_LIVE_MCP_INSTALL_BASE_URL || DEFAULT_BASE_URL);
  const url = `${baseUrl}/mcp-install.json`;

  try {
    const response = await fetch(url);
    const contentType = response.headers.get("content-type") || "";
    const text = await response.text();
    if (!response.ok) {
      fail(`UploadCheck live MCP install: NOT READY\n${url} returned HTTP ${response.status}`);
    }
    if (!contentType.includes("application/json")) {
      fail(`UploadCheck live MCP install: NOT READY\n${url} returned ${contentType || "unknown content type"} instead of application/json`);
    }
    let payload;
    try {
      payload = JSON.parse(text);
    } catch (error) {
      fail(`UploadCheck live MCP install: NOT READY\n${url} returned invalid JSON: ${error.message}`);
    }

    const errors = validateMcpInstallArtifact(payload);
    if (errors.length) {
      fail(`UploadCheck live MCP install: NOT READY\n${JSON.stringify({ url, errors }, null, 2)}`);
    }

    console.log(JSON.stringify({
      ok: true,
      url,
      name: payload.name,
      package: payload.package,
      binary: payload.binary,
      distributionStatus: payload.distribution_status,
      currentInstall: payload.current_install,
      hostedApiBaseUrl: payload.hosted_api_base_url,
      recommendedFirstCallCount: payload.recommended_first_calls?.length || 0
    }, null, 2));
  } catch (error) {
    fail(`UploadCheck live MCP install: NOT READY\n${error.message}`);
  }
}

function trimTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

await main();
