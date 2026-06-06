// qc-engine-runner.mjs — runs the real QC engine (scripts/qc-engine/run_gate.py) against a
// resolved local video file, returns the parsed VERDICT.json payload.
//
// The Python engine emits VERDICT.json with { verdict, blocked, skipped, per_check } — the exact
// shape JsonStore.ingestGateVerdict / buildFlagsFromGateVerdict already consume.
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ENGINE = join(HERE, "scripts", "qc-engine", "run_gate.py");
const REQUIREMENTS = join(HERE, "requirements.txt");
const PYTHON = process.env.UPLOADCHECK_PYTHON || process.env.QCGENIE_PYTHON || "python3";
const YTDLP = process.env.UPLOADCHECK_YTDLP || process.env.QCGENIE_YTDLP || "yt-dlp";
const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tif", ".tiff"]);
let pythonDepsReady = false;
let pythonDepsPath = null;

function isImagePath(path) {
  const lower = String(path || "").toLowerCase();
  return [...IMAGE_EXTS].some((ext) => lower.endsWith(ext));
}

// Resolve a job source (local path / file:// / youtube URL / signed URL) to a local file path.
// Returns { path, cleanup } or null if it cannot be resolved here.
export function resolveSourceToLocal(source, sourceType) {
  if (!source) return null;
  // already a local path
  if (existsSync(source)) return { path: source, cleanup: null };
  if (source.startsWith("file://")) {
    const p = fileURLToPath(source);
    return existsSync(p) ? { path: p, cleanup: null } : null;
  }
  // youtube / http(s): try yt-dlp (the user's own private/unlisted video, per ToS attestation)
  if (/^https?:\/\//.test(source)) {
    const dir = mkdtempSync(join(tmpdir(), "qcgenie-"));
    const out = join(dir, "source.%(ext)s");
    const r = spawnSync(YTDLP, ["-f", "mp4/best", "-o", out, source], { encoding: "utf8", timeout: 1000 * 60 * 15 });
    if (r.status === 0) {
      // find the produced file
      const produced = join(dir, "source.mp4");
      if (existsSync(produced)) return { path: produced, cleanup: dir };
      // fallback: any file in dir
      const f = readdirSync(dir)[0];
      if (f) return { path: join(dir, f), cleanup: dir };
    }
    return null; // yt-dlp not available or download failed
  }
  return null;
}

// Run the engine. opts: { checks, lang, fast }. Returns { verdict, ranEngine, error }.
export function runQcEngine(videoPath, opts = {}) {
  if (!existsSync(ENGINE)) return { ranEngine: false, error: `engine not found at ${ENGINE}` };
  if (!existsSync(videoPath)) return { ranEngine: false, error: `video not found: ${videoPath}` };

  const deps = ensurePythonGateDeps();
  if (!deps.ok) return { ranEngine: false, error: deps.error };

  const outdir = join(tmpdir(), "qcgenie-gate-" + basename(videoPath).replace(/\W+/g, "_"));
  const args = [ENGINE, videoPath, "--out", outdir];
  if (opts.checks) args.push("--checks", opts.checks);
  if (opts.lang) args.push("--lang", opts.lang);
  if (opts.manifestPath) args.push("--manifest", opts.manifestPath);
  if (opts.fast !== false) args.push("--fast"); // default fast for the SaaS pre-pass

  const r = spawnSync(PYTHON, args, { encoding: "utf8", timeout: 1000 * 60 * 30, env: pythonEnv() });
  const verdictPath = join(outdir, "VERDICT.json");
  if (existsSync(verdictPath)) {
    try {
      const verdict = JSON.parse(readFileSync(verdictPath, "utf8"));
      return { ranEngine: true, verdict, stdout: r.stdout, stderr: r.stderr };
    } catch (e) {
      return { ranEngine: false, error: "VERDICT.json parse failed: " + e.message };
    }
  }
  return { ranEngine: false, error: (r.stderr || r.stdout || "engine produced no VERDICT.json").slice(-400) };
}

function ensurePythonGateDeps() {
  if (pythonDepsReady) return { ok: true };
  const probe = spawnSync(PYTHON, ["-c", "import PIL"], { encoding: "utf8", timeout: 1000 * 15, env: pythonEnv() });
  if (probe.status === 0) {
    pythonDepsReady = true;
    return { ok: true };
  }
  if (!existsSync(REQUIREMENTS)) {
    return { ok: false, error: "Python gate dependency check failed and requirements.txt is missing" };
  }
  pythonDepsPath = join(tmpdir(), "uploadcheck-python-deps");
  const install = spawnSync(PYTHON, ["-m", "pip", "install", "--target", pythonDepsPath, "-r", REQUIREMENTS], {
    encoding: "utf8",
    timeout: 1000 * 60 * 5
  });
  if (install.status !== 0) {
    return { ok: false, error: `Python gate dependency install failed: ${(install.stderr || install.stdout || "").slice(-400)}` };
  }
  const verify = spawnSync(PYTHON, ["-c", "import PIL"], { encoding: "utf8", timeout: 1000 * 15, env: pythonEnv() });
  if (verify.status !== 0) {
    return { ok: false, error: `Python gate dependency verify failed: ${(verify.stderr || verify.stdout || "").slice(-400)}` };
  }
  pythonDepsReady = true;
  return { ok: true };
}

function pythonEnv() {
  if (!pythonDepsPath) return process.env;
  const existing = process.env.PYTHONPATH || "";
  return {
    ...process.env,
    PYTHONPATH: existing ? `${pythonDepsPath}:${existing}` : pythonDepsPath
  };
}

// Convenience: resolve source + run engine. Returns { verdict, ranEngine, error, durationS }.
export function runQcForJob(job, opts = {}) {
  const resolved = resolveSourceToLocal(job.source, job.sourceType);
  if (!resolved) return { ranEngine: false, error: "could not resolve source to a local file (no yt-dlp / not a local path)" };
  let durationS = null;
  if (isImagePath(resolved.path)) {
    durationS = 1;
  } else {
    try {
      const p = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", resolved.path], { encoding: "utf8" });
      durationS = Math.ceil(parseFloat((p.stdout || "0").trim()) || 0);
    } catch {}
  }
  if (!durationS || durationS <= 0) {
    if (resolved.cleanup) {
      try { rmSync(resolved.cleanup, { recursive: true, force: true }); } catch {}
    }
    return { ranEngine: false, error: "media probe failed or duration is zero", durationS: 0 };
  }
  const result = runQcEngine(resolved.path, opts);
  if (resolved.cleanup) {
    try { rmSync(resolved.cleanup, { recursive: true, force: true }); } catch {}
  }
  return { ...result, durationS };
}
