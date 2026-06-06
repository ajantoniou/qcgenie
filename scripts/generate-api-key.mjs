#!/usr/bin/env node
import { buildApiKeyMaterial, hashApiKey } from "../api-auth.mjs";

const supplied = process.argv.find((arg) => arg.startsWith("--key="))?.slice("--key=".length);
const material = supplied ? { apiKey: supplied, sha256: hashApiKey(supplied) } : buildApiKeyMaterial();

console.log(`# Store this bearer token in your password manager. Do not set it on Render if using the hash env.`);
console.log(`UPLOADCHECK_API_KEY=${material.apiKey}`);
console.log("");
console.log(`# Set this on Render for production API auth:`);
console.log(`UPLOADCHECK_API_KEY_SHA256=${material.sha256}`);
