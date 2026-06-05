import { describe, expect, it } from "vitest";
import { createQcJob, createUpload, getQcJob, getQcReport } from "./apiMock";

describe("api mock service contract", () => {
  it("creates and polls a QC job from a YouTube URL", () => {
    const job = createQcJob({
      source: "https://youtube.com/watch?v=creator-cut",
      sourceType: "youtube",
      requestedBy: "api"
    });

    expect(job.status).toBe("queued");
    expect(job.statusUrl).toBe(`/v1/qc/jobs/${job.jobId}`);

    const polled = getQcJob(job.jobId);
    expect(polled).toMatchObject({
      jobId: job.jobId,
      status: "queued",
      progressPct: 0,
      verdict: null
    });
  });

  it("returns a timestamped report for a known job", () => {
    const job = createQcJob({
      source: "https://youtube.com/watch?v=creator-cut",
      sourceType: "youtube",
      requestedBy: "codex"
    });

    const report = getQcReport(job.jobId);
    expect(report.verdict).toBe("WATCH");
    expect(report.flags[0]).toMatchObject({
      timestamp: "00:09:12",
      evidenceSource: "transcript"
    });
  });

  it("creates signed upload targets for agent clients", () => {
    const upload = createUpload({
      filename: "rough-cut.mp4",
      contentType: "video/mp4",
      sizeBytes: 42_000_000
    });

    expect(upload.uploadId).toMatch(/^upl_/);
    expect(upload.signedPutUrl).toContain(upload.uploadId);
    expect(upload.expiresAt).toContain("T");
  });
});
