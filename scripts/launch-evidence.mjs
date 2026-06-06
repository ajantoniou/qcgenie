#!/usr/bin/env node
import { writeFileSync } from "node:fs";
import { buildLaunchEvidence, formatLaunchEvidence } from "../launch-evidence.mjs";

const json = process.argv.includes("--json");
const outIndex = process.argv.indexOf("--out");
const outPath = outIndex >= 0 ? process.argv[outIndex + 1] : null;

const evidence = buildLaunchEvidence();
const payload = json ? JSON.stringify(evidence, null, 2) : formatLaunchEvidence(evidence);

if (outPath) {
  writeFileSync(outPath, payload.endsWith("\n") ? payload : `${payload}\n`);
} else {
  console.log(payload);
}

process.exit(evidence.ok ? 0 : 1);
