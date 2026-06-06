# UploadCheck.app Expert Panel Readiness

## Verdict

UploadCheck.app has a credible wedge: full-timeline creator video QC with hard checks, evidence-backed review notes, editor handoff, self-serve upload, and programmatic agent access. It is now a stronger product prototype, but production launch still depends on backend execution, real ingest, auditable reports, billing integration, and public proof.

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
- Built deterministic v0 QC processing on job creation: lifecycle events, stored WATCH verdict, JSON report artifact, marker-export artifact, and honest engine warning fallback when hosted media cannot be resolved.
- Added hosted QC engine runner path for resolvable local/downloadable sources.
- Added `GET /v1/qc/jobs/{job_id}/events` and `GET /v1/qc/jobs/{job_id}/artifacts`.
- Built `GET /v1/qc/jobs/{job_id}/artifacts/markers` CSV export for editor handoff.
- Added idempotent job creation with `idempotency_key` so agent retries return the existing job instead of creating duplicate QC runs.
- Added list filters for recent jobs by `limit`, `status`, and `source_url`.
- Built v0 bearer-token scope enforcement for API endpoints; production still needs hashed key storage and usage logs.
- Added SHA-256 API-key hash verification support through `UPLOADCHECK_API_KEY_SHA256`; legacy `QCGENIE_API_KEY_SHA256` remains a migration fallback.
- Built MCP server wrapper artifacts for `qc_estimate_cost`, `qc_run_video`, `qc_get_job`, `qc_get_report`, `qc_get_events`, `qc_get_artifacts`, `qc_get_marker_csv`, `qc_submit_gate_verdict`, `qc_list_recent_jobs`, `qc_create_upload_url`.
- Added reference full-video QC engine scripts under `scripts/qc-engine/` and built `POST /v1/qc/jobs/{job_id}/gate-verdict` so external gate `VERDICT.json` results become hosted QC flags, reports, marker exports, and webhook-triggering verdicts.
- Added public OpenAPI at `/openapi.json`.
- Built v0 webhook registration and HMAC-SHA256 delivery-preview signatures.
- Built v0 webhook delivery queue on completed jobs, idempotent delivery records, delivery listing, manual retry execution with attempt counts, batch draining of due pending deliveries, and a Render cron runner script.
- Added encrypted-at-rest storage for new webhook signing secrets through `UPLOADCHECK_SECRET_ENCRYPTION_KEY`; legacy plaintext records stay readable for migration. Render still needs this env var configured before hosted webhooks are encrypted.
- Built server-side JSON persistence boundary for jobs, uploads, webhooks, webhook deliveries, and usage ledger entries.
- Report reads append rounded-minute usage entries and `GET /v1/usage` exposes the recent ledger.
- Added Supabase schema RLS hardening: workspace membership table, RLS enabled for all app tables, workspace-scoped policies for non-secret rows, and server-only default access for API key and webhook secret tables.
- Production still needs Render `UPLOADCHECK_SECRET_ENCRYPTION_KEY` configuration, live Supabase-backed persistence, database advisor verification, legacy webhook secret migration, and storage buckets for report artifacts.
- Production still needs hosted video file/object storage and worker execution for ffmpeg/frame/audio checks; external agents can now run the reference gate and import `VERDICT.json` into UploadCheck.app.

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
