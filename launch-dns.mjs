import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export function readLaunchTargets(path = "public/launch-targets.json") {
  return JSON.parse(readFileSync(resolve(path), "utf8"));
}

export function formatLaunchDns(targets = readLaunchTargets()) {
  const lines = [];
  lines.push("UploadCheck DNS cutover records");
  lines.push("");
  lines.push("| Type | Name | Host | Target | Notes |");
  lines.push("| --- | --- | --- | --- | --- |");
  for (const record of targets.dns_records || []) {
    lines.push(`| ${record.type} | ${record.name} | ${record.host} | ${record.target} | ${record.notes || ""} |`);
  }
  lines.push("");
  lines.push("Render service targets");
  lines.push(`- Web: ${targets.render?.web_service?.display_name} (${targets.render?.web_service?.service_id}) -> ${targets.render?.web_service?.immutable_render_host}`);
  lines.push(`- API: ${targets.render?.api_service?.display_name} (${targets.render?.api_service?.service_id}) -> ${targets.render?.api_service?.immutable_render_host}`);
  lines.push("");
  lines.push("Verification commands");
  for (const command of targets.verification_commands || []) {
    lines.push(`- ${command}`);
  }
  return lines.join("\n");
}
