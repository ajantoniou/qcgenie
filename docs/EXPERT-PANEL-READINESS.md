# QC Genie Expert Panel Readiness

## Verdict

QC Genie has a credible wedge: full-timeline creator video QC with hard checks, evidence-backed review notes, editor handoff, self-serve upload, and programmatic agent access. It is now a stronger product prototype, but production launch still depends on backend execution, real ingest, auditable reports, billing integration, and public proof.

## Panel Recommendations

### Creator QC Panel

- Make `WATCH` a real verdict for warning-only runs.
- Turn reports into editor handoff: preview clips, thumbnails, marker exports, copyable notes, share links, and fix/ignore states.
- Add creator pain gates: loudness/LUFS, clipping, dead air, black frames, bitrate/resolution, Shorts safe area, language/caption drift.
- Package around safer publishing and fewer revision loops, not raw minutes alone.
- Add retention loops: weekly channel digest, saved presets, recurring checklist, trend alerts.

### Agentic Integration Panel

- Implement the REST API as the canonical service surface.
- Make MCP tools thin authenticated wrappers over the REST API.
- Use workspace-scoped API keys with scopes and hashed storage.
- Store real job lifecycle: queued, ingesting, metadata_probe, transcribing, deterministic_qc, agent_review, reporting, completed, failed, cancelled.
- Add uploads, artifacts, lifecycle events, webhook deliveries, and usage ledger tables.

### Growth, UX, SEO, and AEO Panel

- Add a public conversion surface separate from the post-login dashboard.
- Rewrite customer-facing copy to avoid internal model/provider wording.
- Add sample reports, concrete trust proof, privacy stance, pricing, and FAQ.
- Add metadata, JSON-LD, robots.txt, sitemap.xml, manifest, llms.txt, and agent manifest.
- Make mobile acquisition pages CTA-first and use stacked report cards instead of compressed tables.

## Launch Task List

### P0 - Product Trust

- Persist gate thresholds, source hash, duration, frame rate, coverage percentage, and suppressed review notes.
- Add sample report artifacts with timestamp evidence and editor handoff actions.
- Record whether each flag came from automated evidence, transcript evidence, or advisory review.

### P0 - Backend and Agentic Surface

- Built v0 `POST /v1/qc/jobs`, `GET /v1/qc/jobs/{job_id}`, `GET /v1/qc/jobs/{job_id}/report`, `POST /v1/qc/jobs/{job_id}/cancel`.
- Built v0 `POST /v1/uploads` signed upload URL response shape.
- Built v0 `GET /v1/uploads/{upload_id}` upload metadata lookup.
- Built deterministic v0 QC processing on job creation: lifecycle events, stored WATCH verdict, caption-safe-area warning, JSON report artifact, and marker-export artifact.
- Added `GET /v1/qc/jobs/{job_id}/events` and `GET /v1/qc/jobs/{job_id}/artifacts`.
- Built `GET /v1/qc/jobs/{job_id}/artifacts/markers` CSV export for editor handoff.
- Built v0 bearer-token scope enforcement for API endpoints; production still needs hashed key storage and usage logs.
- Added SHA-256 API-key hash verification support through `QCGENIE_API_KEY_SHA256`.
- Built MCP server wrapper artifacts for `qc_run_video`, `qc_get_job`, `qc_get_report`, `qc_list_recent_jobs`, `qc_create_upload_url`.
- Added public OpenAPI at `/openapi.json`.
- Built v0 webhook registration and HMAC-SHA256 delivery-preview signatures.
- Built server-side JSON persistence boundary for jobs, uploads, webhooks, webhook deliveries, and usage ledger entries.
- Report reads append rounded-minute usage entries and `GET /v1/usage` exposes the recent ledger.
- Production still needs webhook retry execution, idempotent delivery, encrypted webhook secret storage, Supabase-backed persistence, RLS, and storage buckets for report artifacts.
- Production still needs real video ingestion, ffmpeg/frame/audio checks, transcript handling, and grounded multimodal review behind the deterministic v0 processor.

### P1 - Creator Workflow

- Replace demo input with live YouTube URL import and file upload.
- Add job progress states and loading/error/empty states.
- Add Premiere, Resolve, Final Cut marker exports.
- Add shareable report links for editors and clients.

### P1 - Growth Readiness

- Add FAQ, privacy/security section, pricing comparison, and sample report CTA.
- Add conversion instrumentation for CTA clicks, import attempts, pricing clicks, sample report opens, and checkout starts.
- Add public pages for YouTube video QC, Shorts QC, audio garble checks, and agentic QC API.

### P2 - Retention

- Add weekly channel digest.
- Add saved QC presets by channel/content type.
- Add “same issue happened repeatedly” trend alerts.
- Add scheduled pre-publish reminders.
