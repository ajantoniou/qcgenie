#!/usr/bin/env node
import { readFileSync } from "node:fs";

const text = readFileSync("render.yaml", "utf8");
const required = [
  ["web custom domain", /domains:\s*\n\s*-\s*uploadcheck\.app\s*\n\s*-\s*www\.uploadcheck\.app/],
  ["api custom domain", /domains:\s*\n\s*-\s*api\.uploadcheck\.app/],
  ["api build installs dev dependencies", /key:\s*NPM_CONFIG_PRODUCTION\s*\n\s*value:\s*"false"/],
  ["api persistent disk", /disk:\s*\n\s*name:\s*uploadcheck-data\s*\n\s*mountPath:\s*\/mnt\/uploadcheck\s*\n\s*sizeGB:\s*1/],
  ["durable JSON store path", /key:\s*UPLOADCHECK_STORE_PATH\s*\n\s*value:\s*\/mnt\/uploadcheck\/store\.json/],
  ["durable upload storage path", /key:\s*UPLOADCHECK_DURABLE_STORAGE_DIR\s*\n\s*value:\s*\/mnt\/uploadcheck\/uploads/],
  ["hashed API key prompt", /key:\s*UPLOADCHECK_API_KEY_SHA256\s*\n\s*sync:\s*false/],
  ["creator checkout prompt", /key:\s*UPLOADCHECK_CREATOR_CHECKOUT_URL\s*\n\s*sync:\s*false/],
  ["studio checkout prompt", /key:\s*UPLOADCHECK_STUDIO_CHECKOUT_URL\s*\n\s*sync:\s*false/],
  ["network checkout prompt", /key:\s*UPLOADCHECK_NETWORK_CHECKOUT_URL\s*\n\s*sync:\s*false/],
  ["lemon squeezy store prompt", /key:\s*UPLOADCHECK_LEMONSQUEEZY_STORE_SLUG\s*\n\s*sync:\s*false/],
  ["lemon squeezy store URL prompt", /key:\s*UPLOADCHECK_LEMONSQUEEZY_STORE_URL\s*\n\s*sync:\s*false/],
  ["creator variant prompt", /key:\s*UPLOADCHECK_CREATOR_VARIANT_ID\s*\n\s*sync:\s*false/],
  ["studio variant prompt", /key:\s*UPLOADCHECK_STUDIO_VARIANT_ID\s*\n\s*sync:\s*false/],
  ["network variant prompt", /key:\s*UPLOADCHECK_NETWORK_VARIANT_ID\s*\n\s*sync:\s*false/],
  ["lemon squeezy webhook signing secret prompt", /key:\s*UPLOADCHECK_LEMONSQUEEZY_WEBHOOK_SECRET\s*\n\s*sync:\s*false/],
  ["api key provisioning scopes", /key:\s*UPLOADCHECK_API_SCOPES\s*\n\s*value:\s*jobs:write,jobs:read,reports:read,uploads:write,webhooks:write,api_keys:write,api_keys:read/],
  ["webhook encryption prompt", /key:\s*UPLOADCHECK_SECRET_ENCRYPTION_KEY\s*\n\s*sync:\s*false/]
];

const missing = required.filter(([, pattern]) => !pattern.test(text)).map(([label]) => label);

if (missing.length) {
  console.error("Render launch config is incomplete:");
  for (const item of missing) console.error(`- ${item}`);
  process.exit(1);
}

console.log("Render launch config includes custom domains, durable disk paths, hashed API auth, API-key provisioning scopes, direct checkout prompts, Lemon Squeezy checkout prompts, and secret prompts.");
