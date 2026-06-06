#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROADMAP_PATH = "docs/PRODUCT-ROADMAP.md";
const REQUIRED_EXPERT_MARKERS = [
  "AI agent workflow experts",
  "Claude Code / Codex experts",
  "Cursor / IDE experts",
  "MCP experts",
  "API experts",
  "Plugin/skill experts",
  "Omni/base-layer experts",
  "Video QC experts",
  "SaaS pricing experts",
  "Product Hunt launch experts",
  "NTO production-pipeline review"
];
const REQUIRED_EXECUTION_MARKERS = [
  "real QC engine exists",
  "global Codex MCP entry is installed",
  "global Codex install verifier",
  "public cost-basis verifier",
  "machine-readable repair-loop contract",
  "MCP `qc_run_local_file`",
  "Product Hunt launch checker",
  "observed provider usage is now priced"
];
const REQUIRED_PLAN_SECTIONS = [
  "### P0 - Margin-Safe Engine",
  "### P0 - Programmatic Render Ingest",
  "### P0 - Agent / MCP / CLI Surface",
  "### P0 - Product Proof",
  "### P1 - Production Platform"
];
const REQUIRED_NTO_SOURCE_PATHS = [
  "/Applications/DrAntoniou Projects/AgentCompanies/companies/NTO/PRODUCTION-PIPELINE-v3.md",
  "/Applications/DrAntoniou Projects/AgentCompanies/companies/NTO/personas/qc-engineer.md",
  "/Applications/DrAntoniou Projects/AgentCompanies/companies/NTO/personas/council/20-video-qc-watcher.md",
  "/Applications/DrAntoniou Projects/AgentCompanies/companies/NTO/personas/qc-snippets/visual-qc-learning-locks.md"
];

export function verifyRoadmap({ roadmapPath = ROADMAP_PATH } = {}) {
  const errors = [];
  const text = readText(roadmapPath, errors);
  if (!text) return { ok: false, errors };

  const planSection = sectionText(text, "## 50-Point Plan Update", "## NTO Pipeline Replacement Addendum");
  if (!planSection) {
    errors.push({ key: "50_point_plan", reason: "missing_section", detail: "Missing ## 50-Point Plan Update section." });
  }
  const planNumbers = extractNumberedItems(planSection);
  if (planNumbers.length !== 50) {
    errors.push({ key: "50_point_plan", reason: "wrong_count", detail: `Expected 50 numbered roadmap items; found ${planNumbers.length}.` });
  }
  const expected = Array.from({ length: 50 }, (_, index) => index + 1);
  if (JSON.stringify(planNumbers) !== JSON.stringify(expected)) {
    errors.push({ key: "50_point_plan", reason: "wrong_sequence", detail: `Expected sequence 1..50; found ${planNumbers.join(",")}.` });
  }
  for (const marker of REQUIRED_PLAN_SECTIONS) {
    if (!planSection.includes(marker)) {
      errors.push({ key: "50_point_plan", reason: "missing_plan_section", detail: `Missing plan section: ${marker}` });
    }
  }

  const ntoSection = sectionText(text, "## NTO Pipeline Replacement Addendum", "## Execution Status");
  if (!ntoSection) {
    errors.push({ key: "nto_addendum", reason: "missing_section", detail: "Missing ## NTO Pipeline Replacement Addendum section." });
  }
  const ntoNumbers = extractNumberedItems(sectionText(text, "NTO-derived private QC tasks to add to the product:", "Private moat note:"));
  if (ntoNumbers.length < 30) {
    errors.push({ key: "nto_addendum", reason: "too_few_tasks", detail: `Expected at least 30 NTO-derived QC tasks; found ${ntoNumbers.length}.` });
  }
  for (const sourcePath of REQUIRED_NTO_SOURCE_PATHS) {
    if (!ntoSection.includes(sourcePath)) {
      errors.push({ key: "nto_addendum", reason: "missing_source_evidence", detail: `Missing NTO source evidence path: ${sourcePath}` });
    }
  }
  if (!ntoSection.includes("text_contrast") || !ntoSection.includes("repair_loop")) {
    errors.push({ key: "nto_addendum", reason: "missing_private_qc_tasks", detail: "NTO addendum must preserve private QC task examples including text_contrast and repair_loop." });
  }

  if (!text.includes("## Expert Panel Synthesis")) {
    errors.push({ key: "expert_panel", reason: "missing_section", detail: "Missing ## Expert Panel Synthesis section." });
  }
  for (const marker of REQUIRED_EXPERT_MARKERS) {
    if (!text.includes(marker)) {
      errors.push({ key: "expert_panel", reason: "missing_marker", detail: `Missing expert marker: ${marker}` });
    }
  }
  if (!text.includes("## Execution Status")) {
    errors.push({ key: "execution_status", reason: "missing_section", detail: "Missing ## Execution Status section." });
  }
  for (const marker of ["- Done:", "- Partial:", "- Next:"]) {
    if (!text.includes(marker)) {
      errors.push({ key: "execution_status", reason: "missing_marker", detail: `Missing execution status marker: ${marker}` });
    }
  }
  for (const marker of REQUIRED_EXECUTION_MARKERS) {
    if (!text.includes(marker)) {
      errors.push({ key: "execution_status", reason: "missing_marker", detail: `Missing execution marker: ${marker}` });
    }
  }
  if (!text.includes("$99 / 5,000") || !text.includes("too generous")) {
    errors.push({ key: "pricing_verdict", reason: "missing_stress_verdict", detail: "Roadmap must preserve the $99 / 5,000 stress-plan verdict." });
  }
  if (!text.includes("Cost-per-minute target") || !text.includes("$0.00099") || !text.includes(">95%")) {
    errors.push({ key: "cost_per_minute", reason: "missing_target", detail: "Roadmap must preserve the cost-per-minute target." });
  }

  return {
    ok: errors.length === 0,
    roadmapPath,
    planItemCount: planNumbers.length,
    planNumbers,
    expertMarkerCount: REQUIRED_EXPERT_MARKERS.filter((marker) => text.includes(marker)).length,
    ntoTaskCount: ntoNumbers.length,
    executionMarkerCount: REQUIRED_EXECUTION_MARKERS.filter((marker) => text.includes(marker)).length,
    errors
  };
}

function readText(path, errors) {
  try {
    return readFileSync(resolve(path), "utf8");
  } catch (error) {
    errors.push({ key: "roadmap", reason: "read_failed", detail: error.message });
    return "";
  }
}

function sectionText(text, startMarker, endMarker) {
  const start = text.indexOf(startMarker);
  if (start < 0) return "";
  const bodyStart = start + startMarker.length;
  const end = endMarker ? text.indexOf(endMarker, bodyStart) : -1;
  return text.slice(bodyStart, end >= 0 ? end : undefined);
}

function extractNumberedItems(text) {
  return [...text.matchAll(/^\s*(\d+)\.\s+/gm)].map((match) => Number(match[1]));
}

const THIS_FILE = fileURLToPath(import.meta.url);

if (process.argv[1] && resolve(process.argv[1]) === THIS_FILE) {
  const result = verifyRoadmap();
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}
