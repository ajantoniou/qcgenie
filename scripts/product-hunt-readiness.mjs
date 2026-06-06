#!/usr/bin/env node
import { formatReadinessSummary } from "../readiness-actions.mjs";

const expectedContractVersion = "2026-06-06.render-web-proof";
const apiBaseUrl = (process.env.UPLOADCHECK_API_BASE_URL || process.env.QCGENIE_API_BASE_URL || "https://api.uploadcheck.app").replace(/\/+$/, "");
const response = await fetch(`${apiBaseUrl}/v1/readiness`);

if (!response.ok) {
  console.error(`UploadCheck readiness failed: HTTP ${response.status}`);
  process.exit(2);
}

const report = await response.json();
if (report.contractVersion !== expectedContractVersion) {
  console.error(`UploadCheck readiness stale: expected contractVersion ${expectedContractVersion}, got ${JSON.stringify(report.contractVersion)}`);
  process.exit(2);
}
console.log(formatReadinessSummary(report));
process.exit(report.readyForProductHunt ? 0 : 1);
