import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildEstimateRequest, buildJobRequest, buildUsageRequest, formatJobSummary, formatUsageSummary, parseArgs } from "./request-builder.mjs";

describe("UploadCheck CLI request builder", () => {
  it("builds a YouTube job request", () => {
    const request = buildJobRequest("https://youtu.be/example", {
      apiBaseUrl: "https://api.example.test/",
      checks: "garble,twins",
      idempotencyKey: "idem-1",
      planId: "creator",
      aiReviewSeconds: 30,
      costGuardrail: "downgrade"
    });

    expect(request.apiBaseUrl).toBe("https://api.example.test");
    expect(request.path).toBe("/v1/qc/jobs");
    expect(request.payload).toEqual({
      youtube_url: "https://youtu.be/example",
      checks: "garble,twins",
      idempotency_key: "idem-1",
      plan_id: "creator",
      ai_review_seconds: 30,
      cost_guardrail: "downgrade"
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

  it("builds an inline local image request for visual QC gates", () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-cli-"));
    const file = join(dir, "crowd.jpg");
    writeFileSync(file, Buffer.from("fake-jpeg"));

    const request = buildJobRequest(file, {
      maxInlineMb: 1,
      checks: "twins"
    });

    expect(request.payload.filename).toBe("crowd.jpg");
    expect(request.payload.media_content_type).toBe("image/jpeg");
    expect(request.payload.media_kind).toBe("image");
    expect(request.payload.checks).toBe("twins");
  });

  it("builds a signed-upload plan for oversized local files", () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-cli-"));
    const file = join(dir, "master.mp4");
    writeFileSync(file, Buffer.alloc(2048));

    const request = buildJobRequest(file, {
      apiBaseUrl: "http://127.0.0.1:10002",
      maxInlineMb: 0.001,
      checks: "canvas_fill,text_safe_area",
      idempotencyKey: "large-1",
      planPriceCents: 29900,
      includedMinutes: 5000
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
      idempotency_key: "large-1",
      plan_price_cents: 29900,
      included_minutes: 5000
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

  it("attaches transcript text to jobs", () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-cli-"));
    const file = join(dir, "master.mp4");
    const transcript = join(dir, "transcript.txt");
    writeFileSync(file, Buffer.from("fake-mp4"));
    writeFileSync(transcript, "This line says [pause] and https://example.com by mistake.");

    const request = buildJobRequest(file, {
      maxInlineMb: 1,
      checks: "spoken_leaks",
      transcriptPath: transcript
    });

    expect(request.payload.transcript_text).toContain("[pause]");
    expect(request.payload.transcript_filename).toBe("transcript.txt");
  });

  it("attaches pronunciation watchlists to jobs", () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-cli-"));
    const file = join(dir, "master.mp4");
    const transcript = join(dir, "transcript.txt");
    const watchlist = join(dir, "watchlist.json");
    writeFileSync(file, Buffer.from("fake-mp4"));
    writeFileSync(transcript, "Marcion was rendered as Martian.");
    writeFileSync(watchlist, JSON.stringify({ terms: [{ expected: "Marcion", banned: ["Martian"] }] }));

    const request = buildJobRequest(file, {
      maxInlineMb: 1,
      checks: "pronunciation_watchlist",
      transcriptPath: transcript,
      watchlistPath: watchlist
    });

    expect(request.payload.transcript_text).toContain("Martian");
    expect(request.payload.watchlist_json).toEqual({ terms: [{ expected: "Marcion", banned: ["Martian"] }] });
    expect(request.payload.watchlist_filename).toBe("watchlist.json");
  });

  it("attaches expected scripts to inline and signed jobs", () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-cli-"));
    const file = join(dir, "master.mp4");
    const transcript = join(dir, "transcript.txt");
    const expectedScript = join(dir, "locked-script.txt");
    writeFileSync(file, Buffer.from("fake-mp4"));
    writeFileSync(transcript, "Marcion was born in Sinope.");
    writeFileSync(expectedScript, "Marcion was born in Sinope and later challenged Rome.");

    const inline = buildJobRequest(file, {
      maxInlineMb: 1,
      checks: "script_faithfulness",
      transcriptPath: transcript,
      expectedScriptPath: expectedScript
    });
    expect(inline.payload.transcript_text).toContain("Marcion");
    expect(inline.payload.expected_script_text).toContain("challenged Rome");
    expect(inline.payload.expected_script_filename).toBe("locked-script.txt");

    const signed = buildJobRequest(file, {
      maxInlineMb: 0.000001,
      checks: "script_faithfulness",
      transcriptPath: transcript,
      expectedScriptPath: expectedScript
    });
    expect(signed.createJob.payload.expected_script_text).toContain("challenged Rome");
    expect(signed.createJob.payload.expected_script_filename).toBe("locked-script.txt");
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
      "--transcript",
      "transcript.txt",
      "--watchlist",
      "watchlist.json",
      "--expected-script",
      "locked-script.txt",
      "--plan",
      "studio",
      "--ai-review-seconds",
      "45",
      "--cost-guardrail",
      "block",
      "--json"
    ]);

    expect(parsed.target).toBe("cut.mp4");
    expect(parsed.options).toEqual({
      apiBaseUrl: "http://127.0.0.1:10001",
      checks: "garble",
      uploadMode: "signed",
      manifestPath: "storybook.json",
      transcriptPath: "transcript.txt",
      watchlistPath: "watchlist.json",
      expectedScriptPath: "locked-script.txt",
      planId: "studio",
      aiReviewSeconds: "45",
      costGuardrail: "block",
      json: true
    });
  });

  it("builds and parses a preflight estimate request", () => {
    const parsed = parseArgs([
      "estimate",
      "--api-base",
      "https://api.example.test",
      "--minutes",
      "10",
      "--checks",
      "canvas_fill,twins",
      "--plan",
      "creator",
      "--cost-guardrail",
      "downgrade",
      "--json"
    ]);
    expect(parsed.command).toBe("estimate");
    expect(parsed.target).toBeNull();

    const request = buildEstimateRequest(parsed.options);
    expect(request).toMatchObject({
      apiBaseUrl: "https://api.example.test",
      path: "/v1/qc/estimate",
      method: "POST",
      kind: "estimate"
    });
    expect(request.payload).toEqual({
      checks: "canvas_fill,twins",
      minutes: 10,
      plan_id: "creator",
      cost_guardrail: "downgrade"
    });
  });

  it("builds and parses a usage margin request", () => {
    const parsed = parseArgs([
      "usage",
      "--api-base",
      "https://api.example.test",
      "--billing-period",
      "2026-06",
      "--limit",
      "25",
      "--json"
    ]);
    const request = buildUsageRequest(parsed.options);

    expect(parsed.command).toBe("usage");
    expect(parsed.target).toBeNull();
    expect(request).toEqual({
      apiBaseUrl: "https://api.example.test",
      path: "/v1/usage/margins?billing_period=2026-06&limit=25",
      method: "GET",
      kind: "usage"
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
    expect(formatJobSummary({
      jobId: "job_2",
      status: "completed",
      verdict: "PASS",
      minutesMetered: 1,
      costEstimate: { estimatedCogsCents: 0.0833 }
    })).toContain("job_2: completed / PASS | 1 min | est. COGS $0.0008");
  });

  it("formats a compact usage margin summary", () => {
    expect(formatUsageSummary({
      summary: {
        minutes: 42,
        estimatedCogsCents: 3.4986,
        estimatedCostPerMinuteCents: 0.0833,
        estimatedGrossMarginPct: 95.79,
        marginSafe: true
      }
    })).toBe("UploadCheck usage: MARGIN SAFE | 42 min | est. COGS $0.0350 | cost/min 0.0833c | margin 95.79%");
  });
});
