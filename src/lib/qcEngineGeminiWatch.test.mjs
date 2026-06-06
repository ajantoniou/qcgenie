import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("gemini_watch.py", () => {
  it("loads GEMINI_API_KEY from the current UploadCheck .env", () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-gemini-env-"));
    const repoRoot = resolve(".");

    try {
      writeFileSync(join(dir, ".env"), "GEMINI_API_KEY=gemini-test-current-working-env-1234567890\n");
      const script = `
import importlib.util
spec = importlib.util.spec_from_file_location("gemini_watch", "${repoRoot}/scripts/qc-engine/gemini_watch.py")
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
print(mod.load_key())
`;
      const env = { ...process.env };
      delete env.GEMINI_API_KEY;
      delete env.GOOGLE_API_KEY;
      const result = spawnSync("python3", ["-c", script], { cwd: dir, encoding: "utf8", env });

      expect(result.status).toBe(0);
      expect(result.stdout.trim()).toBe("gemini-test-current-working-env-1234567890");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("normalizes transcript sidecars from word JSON", () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-gemini-transcript-"));
    const transcriptPath = join(dir, "words.json");

    try {
      writeFileSync(transcriptPath, JSON.stringify({ words: [{ text: "Jesus" }, { text: "speaks." }] }));
      const script = `
import importlib.util
spec = importlib.util.spec_from_file_location("gemini_watch", "scripts/qc-engine/gemini_watch.py")
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
print(mod.transcript_text(${JSON.stringify(transcriptPath)}))
`;
      const result = spawnSync("python3", ["-c", script], { cwd: resolve("."), encoding: "utf8" });

      expect(result.status).toBe(0);
      expect(result.stdout.trim()).toBe("Jesus speaks.");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("validates Gemini JSON flags", () => {
    const script = `
import importlib.util, json
spec = importlib.util.spec_from_file_location("gemini_watch", "scripts/qc-engine/gemini_watch.py")
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
parsed=mod.extract_json_object('preface {"flags":[{"type":"FREEZE_LOOP","severity":"block"}],"ok":false} suffix')
print(json.dumps(parsed))
`;
    const result = spawnSync("python3", ["-c", script], { cwd: resolve("."), encoding: "utf8" });
    const payload = JSON.parse(result.stdout);

    expect(result.status).toBe(0);
    expect(payload.flags[0]).toMatchObject({ type: "FREEZE_LOOP", severity: "block" });
  });

  it("uses the Gemini Files API and file_data generateContent shape", () => {
    const script = readFileSync(resolve("scripts/qc-engine/gemini_watch.py"), "utf8");

    expect(script).toContain("/upload/v1beta/files");
    expect(script).toContain("X-Goog-Upload-Protocol");
    expect(script).toContain('"file_data":{"mime_type":mime,"file_uri":file_uri}');
    expect(script).toContain("gemini_video_audio_oracle");
  });

  it("wires gemini_watch through run_gate.py with transcript sidecars", () => {
    const script = readFileSync(resolve("scripts/qc-engine/run_gate.py"), "utf8");

    expect(script).toContain('"gemini_watch"');
    expect(script).toContain('SCRIPT["gemini_watch"]="gemini_watch.py"');
    expect(script).toContain('if check=="gemini_watch" and transcript: cmd+=["--transcript",transcript]');
  });
});
