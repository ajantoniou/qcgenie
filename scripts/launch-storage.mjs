#!/usr/bin/env node
import { buildStorageSummary, formatStorageSummary } from "../launch-storage.mjs";

const summary = buildStorageSummary();
console.log(formatStorageSummary(summary));
process.exit(summary.ok ? 0 : 1);
