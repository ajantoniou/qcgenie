#!/usr/bin/env node
import { buildCheckoutSummary, formatCheckoutSummary } from "../launch-checkout.mjs";

const summary = buildCheckoutSummary();
console.log(formatCheckoutSummary(summary));
process.exit(summary.ok ? 0 : 1);
