import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DEFAULT_MAX_MB = 128;

const EXT_BY_CONTENT_TYPE = new Map([
  ["video/mp4", ".mp4"],
  ["video/quicktime", ".mov"],
  ["video/webm", ".webm"],
  ["audio/mpeg", ".mp3"],
  ["audio/mp3", ".mp3"],
  ["audio/mp4", ".m4a"],
  ["audio/wav", ".wav"],
  ["audio/x-wav", ".wav"],
  ["audio/webm", ".webm"]
]);

export async function materializeInlineMedia(input, options = {}) {
  const payload = pickInlinePayload(input);
  if (!payload) return null;

  const maxMb = Number(options.maxMb || process.env.UPLOADCHECK_INLINE_MEDIA_MAX_MB || DEFAULT_MAX_MB);
  const { base64, contentType } = parseInlinePayload(payload.value, payload.contentType || input.content_type || input.contentType);
  const bytes = Buffer.from(base64, "base64");
  if (!bytes.length) throw new Error("inline media payload is empty");
  if (bytes.length > maxMb * 1024 * 1024) throw new Error(`inline media exceeds ${maxMb} MB limit`);

  const dir = await mkdtemp(join(tmpdir(), "uploadcheck-inline-"));
  const ext = extensionFor(contentType, input.filename || input.file_name || payload.name);
  const filePath = join(dir, `source${ext}`);
  await writeFile(filePath, bytes);

  return {
    filePath,
    cleanupPath: dir,
    contentType,
    bytes: bytes.length,
    checks: input.checks || defaultChecksFor(payload.kind)
  };
}

export async function cleanupInlineMedia(materialized) {
  if (!materialized?.cleanupPath) return;
  await rm(materialized.cleanupPath, { recursive: true, force: true });
}

function pickInlinePayload(input = {}) {
  if (input.media_base64) return { value: input.media_base64, contentType: input.media_content_type, kind: input.media_kind, name: input.filename };
  if (input.video_base64) return { value: input.video_base64, contentType: input.video_content_type || "video/mp4", kind: "video", name: input.filename };
  if (input.audio_base64) return { value: input.audio_base64, contentType: input.audio_content_type || "audio/mpeg", kind: "audio", name: input.filename };
  if (input.data_url) return { value: input.data_url, contentType: null, kind: input.media_kind, name: input.filename };
  return null;
}

function parseInlinePayload(value, fallbackContentType) {
  const dataUrl = String(value).match(/^data:([^;,]+)?(?:;[^,]*)?;base64,(.*)$/s);
  if (dataUrl) {
    return {
      contentType: dataUrl[1] || fallbackContentType || "application/octet-stream",
      base64: dataUrl[2]
    };
  }
  return {
    contentType: fallbackContentType || "application/octet-stream",
    base64: String(value)
  };
}

function extensionFor(contentType, filename) {
  if (filename && /\.[a-z0-9]{2,5}$/i.test(filename)) return filename.match(/\.[a-z0-9]{2,5}$/i)[0].toLowerCase();
  return EXT_BY_CONTENT_TYPE.get(String(contentType).toLowerCase()) || ".bin";
}

function defaultChecksFor(kind) {
  return kind === "audio" ? "garble" : undefined;
}
