#!/usr/bin/env node
import { formatReadinessSummary } from "../readiness-actions.mjs";

const apiBaseUrl = (process.env.UPLOADCHECK_API_BASE_URL || process.env.QCGENIE_API_BASE_URL || "https://qcgenie-api.onrender.com").replace(/\/+$/, "");
const response = await fetch(`${apiBaseUrl}/v1/readiness`);

if (!response.ok) {
  console.error(`UploadCheck readiness failed: HTTP ${response.status}`);
  process.exit(2);
}

const report = await response.json();
console.log(formatReadinessSummary(report));
process.exit(report.readyForProductHunt ? 0 : 1);
