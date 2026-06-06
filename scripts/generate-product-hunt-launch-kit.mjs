#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildProductHuntLaunchKit } from "../product-hunt-launch-kit.mjs";

const status = JSON.parse(readFileSync(resolve("public/launch-status.json"), "utf8"));
const kit = buildProductHuntLaunchKit(status);

writeFileSync(resolve("public/product-hunt-launch-kit.json"), `${JSON.stringify(kit, null, 2)}\n`);
console.log("Wrote public/product-hunt-launch-kit.json from public/launch-status.json.");
