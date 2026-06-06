import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

export function runGeminiBacktestRequest(input = {}) {
  const filePath = input.file_path || input.path;
  if (!filePath) throw new Error("uploadcheck gemini-backtest requires a file path.");
  if (!existsSync(filePath)) throw new Error(`File not found: ${filePath}`);
  if (input.transcript_path && !existsSync(input.transcript_path)) throw new Error(`Transcript not found: ${input.transcript_path}`);
  const scriptPath = resolve(process.cwd(), "scripts/qc-engine/gemini_watch.py");
  if (!existsSync(scriptPath)) throw new Error(`Gemini oracle script not found: ${scriptPath}. Run from the UploadCheck repo.`);
  const outputPath = input.output_path || resolve(process.cwd(), "gemini_watch.json");
  const args = [
    scriptPath,
    filePath,
    "--model",
    input.model || process.env.UPLOADCHECK_GEMINI_ORACLE_MODEL || "gemini-2.5-flash",
    "--json",
    outputPath
  ];
  if (input.transcript_path) args.push("--transcript", input.transcript_path);
  if (input.keep_file) args.push("--keep-file");

  const result = spawnSync("python3", args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
    maxBuffer: 1024 * 1024 * 16
  });
  let payload;
  if (existsSync(outputPath)) {
    payload = JSON.parse(readFileSync(outputPath, "utf8"));
  } else {
    payload = {
      check: "gemini_watch",
      pass: false,
      errors: 1,
      flags: [{ type: "_ERROR", severity: "block", detail: result.stderr || result.stdout || "gemini_watch produced no output" }]
    };
  }
  payload.outputPath = outputPath;
  payload.command = ["python3", ...args];
  payload.exitCode = result.status;
  return payload;
}
