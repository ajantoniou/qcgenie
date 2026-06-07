#!/usr/bin/env node
import { buildLaunchHandoff, formatLaunchHandoff } from "../launch-handoff.mjs";

const apiBaseUrl = (process.env.UPLOADCHECK_API_BASE_URL || "https://api.uploadcheck.app").replace(/\/+$/, "");
const response = await fetch(`${apiBaseUrl}/v1/readiness`);

if (!response.ok) {
  console.error(`UploadCheck launch handoff failed: HTTP ${response.status}`);
  process.exit(2);
}

const report = await response.json();
const handoff = buildLaunchHandoff(report, { apiBaseUrl, generatedAt: report.generatedAt || new Date().toISOString() });

if (process.argv.includes("--text")) {
  console.log(formatLaunchHandoff(handoff));
} else {
  console.log(JSON.stringify(handoff, null, 2));
}

process.exit(handoff.productHuntReady ? 0 : 1);
