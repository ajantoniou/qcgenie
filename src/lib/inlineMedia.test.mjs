import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { cleanupInlineMedia, materializeInlineMedia } from "../../inline-media.mjs";

describe("inline media materialization", () => {
  it("writes base64 video payloads to an ephemeral local file", async () => {
    const materialized = await materializeInlineMedia({
      filename: "clip.mp4",
      video_base64: Buffer.from("fake-mp4").toString("base64")
    });

    try {
      expect(materialized.filePath.endsWith(".mp4")).toBe(true);
      expect(materialized.bytes).toBe(8);
      expect(await readFile(materialized.filePath, "utf8")).toBe("fake-mp4");
    } finally {
      await cleanupInlineMedia(materialized);
    }

    expect(existsSync(materialized.filePath)).toBe(false);
  });

  it("defaults audio-only payloads to the garble check", async () => {
    const materialized = await materializeInlineMedia({
      audio_content_type: "audio/wav",
      audio_base64: Buffer.from("fake-wav").toString("base64")
    });

    try {
      expect(materialized.filePath.endsWith(".wav")).toBe(true);
      expect(materialized.checks).toBe("garble");
    } finally {
      await cleanupInlineMedia(materialized);
    }
  });

  it("honors media filename and mime aliases for inline image payloads", async () => {
    const materialized = await materializeInlineMedia({
      media_filename: "crowd-frame.jpg",
      media_mime_type: "image/jpeg",
      media_base64: Buffer.from("fake-jpeg").toString("base64")
    });

    try {
      expect(materialized.filePath.endsWith(".jpg")).toBe(true);
      expect(materialized.contentType).toBe("image/jpeg");
      expect(await readFile(materialized.filePath, "utf8")).toBe("fake-jpeg");
    } finally {
      await cleanupInlineMedia(materialized);
    }
  });
});
