#!/usr/bin/env node
import { readFileSync } from "node:fs";

const text = readFileSync("render.yaml", "utf8");
const required = [
  ["web custom domain", /domains:\s*\n\s*-\s*uploadcheck\.app\s*\n\s*-\s*www\.uploadcheck\.app/],
  ["api custom domain", /domains:\s*\n\s*-\s*api\.uploadcheck\.app/],
  ["api persistent disk", /disk:\s*\n\s*name:\s*uploadcheck-data\s*\n\s*mountPath:\s*\/mnt\/uploadcheck\s*\n\s*sizeGB:\s*1/],
  ["durable JSON store path", /key:\s*UPLOADCHECK_STORE_PATH\s*\n\s*value:\s*\/mnt\/uploadcheck\/store\.json/],
  ["durable upload storage path", /key:\s*UPLOADCHECK_DURABLE_STORAGE_DIR\s*\n\s*value:\s*\/mnt\/uploadcheck\/uploads/],
  ["creator checkout prompt", /key:\s*UPLOADCHECK_CREATOR_CHECKOUT_URL\s*\n\s*sync:\s*false/],
  ["studio checkout prompt", /key:\s*UPLOADCHECK_STUDIO_CHECKOUT_URL\s*\n\s*sync:\s*false/],
  ["network checkout prompt", /key:\s*UPLOADCHECK_NETWORK_CHECKOUT_URL\s*\n\s*sync:\s*false/],
  ["webhook encryption prompt", /key:\s*UPLOADCHECK_SECRET_ENCRYPTION_KEY\s*\n\s*sync:\s*false/]
];

const missing = required.filter(([, pattern]) => !pattern.test(text)).map(([label]) => label);

if (missing.length) {
  console.error("Render launch config is incomplete:");
  for (const item of missing) console.error(`- ${item}`);
  process.exit(1);
}

console.log("Render launch config includes custom domains, durable disk paths, checkout prompts, and secret prompts.");
