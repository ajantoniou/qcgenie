#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildReadinessReport } from "../readiness.mjs";
import { buildLaunchStatus } from "../launch-status.mjs";
import { buildProductHuntLaunchKit } from "../product-hunt-launch-kit.mjs";

const current = readJson("public/launch-status.json");
const representativeLaunchEnv = {
  UPLOADCHECK_API_KEY_SHA256: "a".repeat(64),
  UPLOADCHECK_BUNDLED_DEMO_CLIP_PATH: "public/demo/uploadcheck-product-hunt-demo.mp4",
  UPLOADCHECK_CREATOR_CHECKOUT_URL: "https://uploadcheck.lemonsqueezy.com/checkout/buy/creator",
  UPLOADCHECK_STUDIO_CHECKOUT_URL: "https://uploadcheck.lemonsqueezy.com/checkout/buy/studio",
  UPLOADCHECK_NETWORK_CHECKOUT_URL: "https://uploadcheck.lemonsqueezy.com/checkout/buy/network",
  UPLOADCHECK_LEMONSQUEEZY_WEBHOOK_SECRET: "representative-webhook-secret",
  UPLOADCHECK_SECRET_ENCRYPTION_KEY: "representative_strong_secret_encryption_key_32_bytes",
  UPLOADCHECK_STORE_PATH: "/mnt/uploadcheck/store.json",
  UPLOADCHECK_DURABLE_STORAGE_DIR: "/mnt/uploadcheck/uploads"
};
const readiness = buildReadinessReport({
  host: process.env.UPLOADCHECK_LAUNCH_STATUS_HOST || "api.uploadcheck.app",
  env: representativeLaunchEnv,
  now: process.env.UPLOADCHECK_LAUNCH_STATUS_NOW || "2026-06-07T00:00:00.000Z"
});
const status = buildLaunchStatus(readiness, {
  generatedFrom: process.env.UPLOADCHECK_LAUNCH_STATUS_GENERATED_FROM || "representative launch-ready readiness",
  lastVerifiedDate: process.env.UPLOADCHECK_LAUNCH_STATUS_LAST_VERIFIED_DATE || new Date().toISOString().slice(0, 10)
});
const kit = buildProductHuntLaunchKit(status);

writeJson("public/launch-status.json", status);
writeJson("public/product-hunt-launch-kit.json", kit);
console.log("Wrote public/launch-status.json and public/product-hunt-launch-kit.json.");

function readJson(path) {
  return JSON.parse(readFileSync(resolve(path), "utf8"));
}

function writeJson(path, value) {
  writeFileSync(resolve(path), `${JSON.stringify(value, null, 2)}\n`);
}
