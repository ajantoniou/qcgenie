#!/usr/bin/env node
import { formatLaunchDoctor, runLaunchDoctor } from "../launch-doctor.mjs";

const report = runLaunchDoctor();
console.log(formatLaunchDoctor(report));
process.exit(report.ok ? 0 : 1);
