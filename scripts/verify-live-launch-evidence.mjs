#!/usr/bin/env node

const baseUrl = trimTrailingSlash(process.env.UPLOADCHECK_LIVE_LAUNCH_EVIDENCE_BASE_URL || "https://qcgenie-api.onrender.com");
const expectedSource = "https://qcgenie-api.onrender.com/v1/launch-doctor";
const url = `${baseUrl}/v1/launch-evidence`;

try {
  const response = await fetch(url);
  const contentType = response.headers.get("content-type") || "";
  const text = await response.text();
  if (!response.ok) {
    fail(`UploadCheck live launch evidence: NOT READY\n${url} returned HTTP ${response.status}`);
  }
  if (!contentType.includes("application/json")) {
    fail(`UploadCheck live launch evidence: NOT READY\n${url} returned ${contentType || "unknown content type"} instead of application/json`);
  }

  let payload;
  try {
    payload = JSON.parse(text);
  } catch (error) {
    fail(`UploadCheck live launch evidence: NOT READY\n${url} returned invalid JSON: ${error.message}`);
  }

  const serialized = JSON.stringify(payload);
  if (payload.name !== "UploadCheck.app Remote Launch Evidence") {
    fail(`UploadCheck live launch evidence: NOT READY\nExpected name UploadCheck.app Remote Launch Evidence, got ${JSON.stringify(payload.name)}`);
  }
  if (payload.source !== expectedSource) {
    fail(`UploadCheck live launch evidence: NOT READY\nExpected source ${expectedSource}, got ${JSON.stringify(payload.source)}`);
  }
  if (!Array.isArray(payload.commandCoverage) || !payload.commandCoverage.some((command) => command.includes("UPLOADCHECK_API_KEY=<private_bearer>"))) {
    fail("UploadCheck live launch evidence: NOT READY\nMissing redacted hosted media-ingress command coverage.");
  }
  if (serialized.includes("uck_") || /\/tmp\/uploadcheck\/(?!<redacted>)/.test(serialized)) {
    fail("UploadCheck live launch evidence: NOT READY\nPayload leaks a bearer-token or temp-path pattern.");
  }

  console.log(JSON.stringify({
    ok: true,
    url,
    name: payload.name,
    source: payload.source,
    productHuntReady: Boolean(payload.productHuntReady),
    status: payload.status,
    blockers: payload.blockers || [],
    commandCoverageCount: payload.commandCoverage.length,
    redactedHostedMediaIngressCommandPresent: true
  }, null, 2));
} catch (error) {
  fail(`UploadCheck live launch evidence: NOT READY\n${error.message}`);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function trimTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}
