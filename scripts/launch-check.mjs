#!/usr/bin/env node
import { buildLaunchCheck, formatLaunchCheck } from "../launch-check.mjs";

try {
  const result = await buildLaunchCheck();
  console.log(formatLaunchCheck(result));
  process.exit(result.ready ? 0 : 1);
} catch (error) {
  console.error(error instanceof Error ? error.message : "launch_check_failed");
  process.exit(2);
}
