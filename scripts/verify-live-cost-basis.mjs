#!/usr/bin/env node
import { verifyCostBasis } from "./verify-cost-basis.mjs";

const baseUrl = trimTrailingSlash(process.env.UPLOADCHECK_LIVE_COST_BASIS_BASE_URL || "https://qcgenie-api.onrender.com");
const url = `${baseUrl}/cost-basis.json`;

try {
  const response = await fetch(url);
  const contentType = response.headers.get("content-type") || "";
  const text = await response.text();
  if (!response.ok) {
    fail(`UploadCheck live cost basis: NOT READY\n${url} returned HTTP ${response.status}`);
  }
  if (!contentType.includes("application/json")) {
    fail(`UploadCheck live cost basis: NOT READY\n${url} returned ${contentType || "unknown content type"} instead of application/json`);
  }

  let payload;
  try {
    payload = JSON.parse(text);
  } catch (error) {
    fail(`UploadCheck live cost basis: NOT READY\n${url} returned invalid JSON: ${error.message}`);
  }

  const result = verifyCostBasis({ basis: payload, costBasisPath: url });
  if (!result.ok) {
    fail(`UploadCheck live cost basis: NOT READY\n${JSON.stringify({ url, errors: result.errors }, null, 2)}`);
  }

  console.log(JSON.stringify({
    ok: true,
    url,
    name: payload.name,
    targetGrossMarginPct: result.targetGrossMarginPct,
    defaultGuardrail: result.defaultGuardrail,
    stressVerdict: result.stressVerdict,
    sourceAuditDate: payload.source_audit?.last_verified_date || null,
    openAiMiniTranscribeCentsPerMinute: payload.cost_assumptions?.openai_gpt_4o_mini_transcribe_cents_per_minute,
    planCount: result.planSummary.length
  }, null, 2));
} catch (error) {
  fail(`UploadCheck live cost basis: NOT READY\n${error.message}`);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function trimTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}
