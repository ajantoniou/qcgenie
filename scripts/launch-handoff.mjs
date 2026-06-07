#!/usr/bin/env node
import { buildLaunchHandoff, formatLaunchHandoff } from "../launch-handoff.mjs";
import { buildReadinessReport } from "../readiness.mjs";

const apiBaseUrl = (process.env.UPLOADCHECK_API_BASE_URL || process.env.QCGENIE_API_BASE_URL || "https://api.uploadcheck.app").replace(/\/+$/, "");
const report = await loadReadinessReport(apiBaseUrl);
const handoff = buildLaunchHandoff(report, {
  apiBaseUrl,
  generatedAt: report.generatedAt || new Date().toISOString()
});

if (process.argv.includes("--text")) {
  console.log(formatLaunchHandoff(handoff));
} else {
  console.log(JSON.stringify(handoff, null, 2));
}

process.exit(handoff.productHuntReady ? 0 : 1);

async function loadReadinessReport(baseUrl) {
  const readinessUrl = `${baseUrl}/v1/readiness`;
  try {
    const response = await fetch(readinessUrl);
    if (response.ok) return response.json();
    console.error(`UploadCheck launch handoff live readiness unavailable: HTTP ${response.status}; using local readiness fallback.`);
  } catch (error) {
    console.error(`UploadCheck launch handoff live readiness unavailable: ${error instanceof Error ? error.message : "fetch_failed"}; using local readiness fallback.`);
  }
  return buildReadinessReport({
    host: new URL(baseUrl).host
  });
}
