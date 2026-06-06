import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildLocalFileRequest } from "../../mcp-server/local-file.mjs";

describe("MCP local file runner", () => {
  it("builds an inline Render job for small local media", () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-mcp-"));
    const file = join(dir, "short.mp4");

    try {
      writeFileSync(file, Buffer.from("fake-mp4"));
      const request = buildLocalFileRequest({
        file_path: file,
        checks: "canvas_fill,text_contrast",
        plan_id: "creator",
        cost_guardrail: "downgrade",
        max_inline_mb: 1
      });

      expect(request.kind).toBe("job");
      expect(request.path).toBe("/v1/qc/jobs");
      expect(request.payload).toMatchObject({
        filename: "short.mp4",
        media_content_type: "video/mp4",
        media_kind: "video",
        checks: "canvas_fill,text_contrast",
        plan_id: "creator",
        cost_guardrail: "downgrade"
      });
      expect(request.payload.media_base64).toBe(Buffer.from("fake-mp4").toString("base64"));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("builds a signed-upload plan when local media is over the inline limit", () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-mcp-"));
    const file = join(dir, "episode.wav");

    try {
      writeFileSync(file, Buffer.alloc(4096));
      const request = buildLocalFileRequest({
        file_path: file,
        checks: "dead_air,garble",
        max_inline_mb: 0.001
      });

      expect(request.kind).toBe("signed_upload");
      expect(request.contentType).toBe("audio/wav");
      expect(request.createUpload.payload).toMatchObject({
        filename: "episode.wav",
        content_type: "audio/wav",
        size_bytes: 4096
      });
      expect(request.createJob.payload.checks).toBe("dead_air,garble");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
