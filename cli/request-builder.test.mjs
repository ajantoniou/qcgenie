import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildJobRequest, formatJobSummary, parseArgs } from "./request-builder.mjs";

describe("UploadCheck CLI request builder", () => {
  it("builds a YouTube job request", () => {
    const request = buildJobRequest("https://youtu.be/example", {
      apiBaseUrl: "https://api.example.test/",
      checks: "garble,twins",
      idempotencyKey: "idem-1"
    });

    expect(request.apiBaseUrl).toBe("https://api.example.test");
    expect(request.path).toBe("/v1/qc/jobs");
    expect(request.payload).toEqual({
      youtube_url: "https://youtu.be/example",
      checks: "garble,twins",
      idempotency_key: "idem-1"
    });
  });

  it("builds an inline local audio request", () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-cli-"));
    const file = join(dir, "episode.wav");
    writeFileSync(file, Buffer.from("RIFFfake"));

    const request = buildJobRequest(file, { maxInlineMb: 1 });

    expect(request.payload.filename).toBe("episode.wav");
    expect(request.payload.media_content_type).toBe("audio/wav");
    expect(request.payload.media_kind).toBe("audio");
    expect(request.payload.media_base64).toBe(Buffer.from("RIFFfake").toString("base64"));
  });

  it("builds a signed-upload plan for oversized local files", () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-cli-"));
    const file = join(dir, "master.mp4");
    writeFileSync(file, Buffer.alloc(2048));

    const request = buildJobRequest(file, {
      apiBaseUrl: "http://127.0.0.1:10002",
      maxInlineMb: 0.001,
      checks: "canvas_fill,text_safe_area",
      idempotencyKey: "large-1"
    });

    expect(request.kind).toBe("signed_upload");
    expect(request.createUpload).toMatchObject({
      path: "/v1/uploads",
      payload: {
        filename: "master.mp4",
        content_type: "video/mp4",
        size_bytes: 2048
      }
    });
    expect(request.createJob.payload).toEqual({
      checks: "canvas_fill,text_safe_area",
      idempotency_key: "large-1"
    });
  });

  it("attaches an edit manifest to inline and signed jobs", () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-cli-"));
    const file = join(dir, "master.mp4");
    const manifest = join(dir, "storybook.json");
    writeFileSync(file, Buffer.from("fake-mp4"));
    writeFileSync(manifest, JSON.stringify({ beats: [{ visual_file: "clips/a.mp4" }] }));

    const inline = buildJobRequest(file, {
      maxInlineMb: 1,
      checks: "repeat_fatigue",
      manifestPath: manifest
    });
    expect(inline.payload.manifest_json).toEqual({ beats: [{ visual_file: "clips/a.mp4" }] });
    expect(inline.payload.manifest_filename).toBe("storybook.json");

    const signed = buildJobRequest(file, {
      maxInlineMb: 0.000001,
      checks: "repeat_fatigue",
      manifestPath: manifest
    });
    expect(signed.createJob.payload.manifest_json).toEqual({ beats: [{ visual_file: "clips/a.mp4" }] });
    expect(signed.createJob.payload.manifest_filename).toBe("storybook.json");
  });

  it("parses command flags", () => {
    const parsed = parseArgs([
      "check",
      "cut.mp4",
      "--api-base",
      "http://127.0.0.1:10001",
      "--checks",
      "garble",
      "--upload-mode",
      "signed",
      "--manifest",
      "storybook.json",
      "--json"
    ]);

    expect(parsed.target).toBe("cut.mp4");
    expect(parsed.options).toEqual({
      apiBaseUrl: "http://127.0.0.1:10001",
      checks: "garble",
      uploadMode: "signed",
      manifestPath: "storybook.json",
      json: true
    });
  });

  it("formats a compact job summary", () => {
    expect(formatJobSummary({
      jobId: "job_1",
      status: "completed",
      verdict: "WATCH",
      minutesMetered: 2,
      costEstimate: { estimatedCogsUsd: 0.0017 }
    })).toContain("job_1: completed / WATCH | 2 min | est. COGS $0.0017");
  });
});
