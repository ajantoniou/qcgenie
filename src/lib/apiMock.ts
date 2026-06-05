import { buildQcJobRequest, type BuildQcJobRequestInput, type JobStatus } from "./agentic";

export interface ApiJobCreated {
  jobId: string;
  status: JobStatus;
  statusUrl: string;
  reportUrl: string;
}

export interface ApiJob {
  jobId: string;
  status: JobStatus;
  progressPct: number;
  verdict: "PASS" | "WATCH" | "BLOCK" | null;
  minutesMetered: number;
  source: string;
  sourceType: string;
}

export interface ApiReport {
  jobId: string;
  verdict: "WATCH";
  flags: Array<{
    timestamp: string;
    severity: "warn";
    summary: string;
    evidenceSource: "transcript";
    transcriptEvidence: string;
  }>;
  artifacts: Array<{ type: string; url: string }>;
}

export interface UploadInput {
  filename: string;
  contentType: string;
  sizeBytes: number;
}

export interface UploadCreated {
  uploadId: string;
  signedPutUrl: string;
  expiresAt: string;
}

const jobs = new Map<string, ApiJob>();

export function createQcJob(input: BuildQcJobRequestInput): ApiJobCreated {
  const request = buildQcJobRequest(input);
  const jobId = `job_${cryptoRandom()}`;

  jobs.set(jobId, {
    jobId,
    status: "queued",
    progressPct: 0,
    verdict: null,
    minutesMetered: 0,
    source: request.source,
    sourceType: request.sourceType
  });

  return {
    jobId,
    status: "queued",
    statusUrl: `/v1/qc/jobs/${jobId}`,
    reportUrl: `/v1/qc/jobs/${jobId}/report`
  };
}

export function getQcJob(jobId: string): ApiJob {
  return jobs.get(jobId) ?? seedCompletedJob(jobId);
}

export function getQcReport(jobId: string): ApiReport {
  return {
    jobId,
    verdict: "WATCH",
    flags: [
      {
        timestamp: "00:09:12",
        severity: "warn",
        summary: "Caption sits near the Shorts UI safe area.",
        evidenceSource: "transcript",
        transcriptEvidence: "the payment failed twice"
      }
    ],
    artifacts: [
      { type: "json_report", url: `/v1/qc/jobs/${jobId}/report` },
      { type: "marker_export", url: `/v1/qc/jobs/${jobId}/artifacts/markers` }
    ]
  };
}

export function createUpload(input: UploadInput): UploadCreated {
  const uploadId = `upl_${cryptoRandom()}`;
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  const encodedName = encodeURIComponent(input.filename);

  return {
    uploadId,
    signedPutUrl: `https://uploads.qcgenie.com/${uploadId}/${encodedName}?content_type=${encodeURIComponent(input.contentType)}&size=${input.sizeBytes}`,
    expiresAt
  };
}

function seedCompletedJob(jobId: string): ApiJob {
  return {
    jobId,
    status: "completed",
    progressPct: 100,
    verdict: "WATCH",
    minutesMetered: 19,
    source: "https://youtube.com/watch?v=creator-cut",
    sourceType: "youtube"
  };
}

function cryptoRandom(): string {
  return Math.random().toString(36).slice(2, 10);
}
