import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("omni_watch.py", () => {
  it("loads Qwen keys from the current UploadCheck .env before falling back", () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-omni-env-"));
    const repoRoot = resolve(".");

    try {
      writeFileSync(join(dir, ".env"), "DASHSCOPE_API_KEY=sk-qwen-current-working-env-1234567890\n");
      const script = `
import importlib.util
spec = importlib.util.spec_from_file_location("omni_watch", "${repoRoot}/scripts/qc-engine/omni_watch.py")
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
print(mod.load_key("DASHSCOPE_API_KEY","QWEN_API_KEY"))
`;
      const env = { ...process.env };
      delete env.DASHSCOPE_API_KEY;
      delete env.QWEN_API_KEY;
      const result = spawnSync("python3", ["-c", script], {
        cwd: dir,
        encoding: "utf8",
        env
      });

      expect(result.status).toBe(0);
      expect(result.stdout.trim()).toBe("sk-qwen-current-working-env-1234567890");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("defaults Anthropic fallback to Sonnet for product-oracle quality", () => {
    const script = `
import importlib.util
spec = importlib.util.spec_from_file_location("omni_watch", "scripts/qc-engine/omni_watch.py")
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
print(mod.DEFAULT_ANTHROPIC_MODEL)
`;
    const result = spawnSync("python3", ["-c", script], { cwd: resolve("."), encoding: "utf8" });

    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe("claude-sonnet-4-5");
  });

  it("parses streaming Qwen responses and validates JSON flags", () => {
    const script = `
import importlib.util, json
spec = importlib.util.spec_from_file_location("omni_watch", "scripts/qc-engine/omni_watch.py")
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
chunks=[
  {"choices":[{"delta":{"content":"{\\"flags\\":["}}]},
  {"choices":[{"delta":{"content":"{\\"type\\":\\"FREEZE/LOOP\\",\\"severity\\":\\"block\\"}"}}]},
  {"choices":[{"delta":{"content":"]}"}}],"usage":{"input_tokens":11,"output_tokens":7}},
]
raw=("\\n\\n".join("data: "+json.dumps(chunk) for chunk in chunks)+"\\n\\ndata: [DONE]\\n").encode()
text, usage = mod.parse_streaming_chat_completion(raw)
parsed = mod.extract_json_object(text)
print(json.dumps({"flags": parsed["flags"], "usage": usage}))
`;
    const result = spawnSync("python3", ["-c", script], { cwd: resolve("."), encoding: "utf8" });
    const payload = JSON.parse(result.stdout);

    expect(result.status).toBe(0);
    expect(payload.usage).toMatchObject({ input_tokens: 11, output_tokens: 7 });
    expect(payload.flags[0]).toMatchObject({ type: "FREEZE/LOOP", severity: "block" });
  });

  it("uses the documented Qwen audio+video request shape", () => {
    const script = readFileSync(resolve("scripts/qc-engine/omni_watch.py"), "utf8");

    expect(script).toContain('"data":"data:;base64,"+audio_b64');
    expect(script).toContain('"stream":True');
    expect(script).toContain('"modalities":["text"]');
    expect(script).toContain('"operation":"multimodal_audio_video_window"');
    expect(script).toContain('"--require-audio-video"');
  });

  it("wires transcript sidecars through run_gate.py into omni_watch", () => {
    const script = readFileSync(resolve("scripts/qc-engine/run_gate.py"), "utf8");

    expect(script).toContain('if check=="omni_watch" and transcript: cmd+=["--transcript",transcript]');
  });
});
