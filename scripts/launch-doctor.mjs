#!/usr/bin/env node
import { formatLaunchDoctor, runLaunchDoctor } from "../launch-doctor.mjs";

const report = runLaunchDoctor();
if (process.argv.includes("--json")) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(formatLaunchDoctor(report));
}
process.exit(report.ok ? 0 : 1);
