#!/usr/bin/env node
import { buildCheckoutSummaryAsync, formatCheckoutSummary } from "../launch-checkout.mjs";

const summary = await buildCheckoutSummaryAsync();
console.log(formatCheckoutSummary(summary));
process.exit(summary.ok ? 0 : 1);
