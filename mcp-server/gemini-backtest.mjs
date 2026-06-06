import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));

export function buildGeminiBacktestRequest(input = {}) {
  const filePath = input.file_path || input.path;
  if (!filePath) throw new Error("qc_run_gemini_backtest requires file_path.");
  if (!existsSync(filePath)) throw new Error(`File not found: ${filePath}`);
  if (input.transcript_path && !existsSync(input.transcript_path)) throw new Error(`Transcript not found: ${input.transcript_path}`);
  return {
    filePath,
    transcriptPath: input.transcript_path || null,
    model: input.model || process.env.UPLOADCHECK_GEMINI_ORACLE_MODEL || "gemini-2.5-flash",
    outputPath: input.output_path || null,
    keepFile: Boolean(input.keep_file)
  };
}

export function runGeminiBacktestRequest(input = {}) {
  const request = buildGeminiBacktestRequest(input);
  const tmp = request.outputPath ? null : mkdtempSync(join(tmpdir(), "uploadcheck-gemini-backtest-"));
  const outputPath = request.outputPath || join(tmp, "gemini_watch.json");
  const args = [
    resolve(repoRoot, "scripts/qc-engine/gemini_watch.py"),
    request.filePath,
    "--model",
    request.model,
    "--json",
    outputPath
  ];
  if (request.transcriptPath) args.push("--transcript", request.transcriptPath);
  if (request.keepFile) args.push("--keep-file");

  try {
    const result = spawnSync("python3", args, {
      cwd: repoRoot,
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
  } finally {
    if (tmp) rmSync(tmp, { recursive: true, force: true });
  }
}
