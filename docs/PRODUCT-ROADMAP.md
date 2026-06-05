# UploadCheck.app Product Roadmap

Canonical naming:

- MCP server: `uploadcheck`
- CLI/package: `@uploadcheck/cli` or `@uploadcheck/mcp`
- Tagline: Quality check videos, podcasts, and clips before you upload.

## Built Now

- Real QC engine scripts live in `scripts/qc-engine/`: loop/freeze, cheap b-roll, garble, twins, narration match, omni watch, and `run_gate.py`.
- `qc-engine-runner.mjs` resolves local, file URL, YouTube, or signed URL sources where possible, runs `scripts/qc-engine/run_gate.py`, and parses `VERDICT.json`.
- `server-store.mjs` runs the engine during job processing for resolvable sources, ingests gate verdicts, stores flags/artifacts, and records honest `WATCH` / `NEEDS_REVIEW` fallback when the engine cannot run.
- REST API, OpenAPI, MCP wrapper, upload metadata shape, webhook delivery records, marker CSV export, usage ledger, and idempotency keys exist in v0 form.
- The visible product surface is now branded as UploadCheck.app with `/check` agent workflow positioning.

## P0 - Product Trust

- Persist gate thresholds, source hash, duration, frame rate, coverage percentage, and suppressed advisory notes per job.
- Store the exact engine version and check set used for every report.
- Add sample reports with timestamped evidence, thumbnails, preview clips, and editor handoff actions.
- Keep deterministic checks as the billable verdict source; advisory/agent review remains grounded context.

## P0 - Hosted Execution

- Add durable upload/object storage for source videos, reports, marker exports, and preview clips.
- Move synchronous JSON-store processing into a worker queue with retryable engine runs.
- Configure hosted secrets and migrate legacy webhook signing-secret records.
- Replace JSON persistence with live Supabase-backed persistence and verify RLS/advisor output.

## P1 - Creator Workflow

- Replace demo input with live YouTube import and first-class file upload.
- Add clear loading, error, empty, cancelled, failed, and completed job states.
- Add Premiere, Resolve, and Final Cut marker export variants.
- Add shareable report links for editors and clients.

## P1 - Agent Workflow

- Package `@uploadcheck/cli` and `@uploadcheck/mcp` around the existing API surface.
- Make `/check ./final-upload.mp4` the canonical agent workflow.
- Return structured findings that agents can summarize, fix when source files are reachable, or route to humans when the defect is render/source-only.

## P2 - Growth and Retention

- Add pricing, FAQ, privacy/security, public sample reports, and proof pages.
- Add pages for YouTube QC, Shorts QC, podcast QC, audio garble checks, and agentic media QC.
- Add weekly channel digest, saved presets, recurring upload reminders, and repeated-issue trend alerts.

## Current Production Risks

- Hosted URLs and env vars still use legacy `qcgenie` / `QCGENIE_*` identifiers for compatibility.
- Hosted video storage and worker execution are not production-complete.
- Full hosted production readiness still depends on live persistence, secrets migration, billing wiring, and public proof assets.
