import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildGeminiBacktestRequest } from "../../mcp-server/gemini-backtest.mjs";

describe("Gemini backtest MCP runner", () => {
  it("builds a local Gemini backtest request for Claude Code", () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-gemini-runner-"));
    const video = join(dir, "video.mp4");
    const transcript = join(dir, "words.json");

    try {
      writeFileSync(video, "fake-video");
      writeFileSync(transcript, JSON.stringify({ words: [{ text: "test" }] }));

      expect(buildGeminiBacktestRequest({
        file_path: video,
        transcript_path: transcript,
        model: "gemini-2.5-flash",
        output_path: join(dir, "out.json"),
        keep_file: true
      })).toMatchObject({
        filePath: video,
        transcriptPath: transcript,
        model: "gemini-2.5-flash",
        outputPath: join(dir, "out.json"),
        keepFile: true
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("fails clearly when the local media file is missing", () => {
    expect(() => buildGeminiBacktestRequest({ file_path: "/tmp/no-such-uploadcheck-video.mp4" }))
      .toThrow("File not found");
  });
});
