# UploadCheck.app

Quality check videos, podcasts, and clips before you upload.

The beachhead is YouTube videos: creators import a URL, upload a cut, or run `/check` from Claude Code/Codex; UploadCheck.app runs deterministic gates across the full timeline, then adds grounded multimodal review notes.

## Product Rules

- Deterministic checks are the billable source of truth for `PASS`, `WATCH`, and `BLOCK`.
- Multimodal agent review is a grounded second opinion. It cannot create a hard fail unless the defect is supported by deterministic evidence or explicit transcript evidence.
- The UI does not expose the internal model rails to creator customers.
- Metering is by rounded video minutes.

## Agentic Surface

UploadCheck.app supports self-serve users and programmatic agent workflows.

- Web users paste a YouTube URL or upload a cut.
- Agent users run `/check` against a media file, upload id, signed URL, or YouTube URL.
- Claude, Codex, and other agents call the same REST API through an MCP server or connector.
- MCP tools are thin wrappers over the API; they do not run QC locally.
- Customer-facing tools do not expose internal model/provider rails.
- MCP server name: `uploadcheck`.
- CLI/package options: `@uploadcheck/cli` and `@uploadcheck/mcp`.

Current API/MCP tools:

- MCP server: `uploadcheck`
- CLI/package: `@uploadcheck/cli` or `@uploadcheck/mcp`

- `qc_run_video`
- `qc_get_job`
- `qc_get_report`
- `qc_get_events`
- `qc_get_artifacts`
- `qc_get_marker_csv`
- `qc_submit_gate_verdict`
- `qc_list_recent_jobs`
- `qc_create_upload_url`

See `public/agent-manifest.json`, `public/llms.txt`, `docs/PRODUCT-ROADMAP.md`, and `docs/EXPERT-PANEL-READINESS.md`.
See `docs/DEPLOYMENT-CUTOVER.md` for the current Render custom-domain and DNS cutover state.

Public API:

- Public app: `https://qcgenie-web.onrender.com` while `uploadcheck.app` DNS/custom-domain cutover is pending. Render display name: `uploadcheck-web`.
- Authenticated API: `https://qcgenie-api.onrender.com` while the Render legacy slug remains active. Render display name: `uploadcheck-api`.
- OpenAPI: `https://qcgenie-api.onrender.com/openapi.json`
- MCP wrapper package: `mcp-server/`
- CLI package: `cli/`

Persistence state:

- Current hosted API stores jobs, uploads, webhook endpoints, webhook delivery previews, and usage ledger entries through `server-store.mjs`.
- API auth supports plaintext `UPLOADCHECK_API_KEY` for bootstrapping and SHA-256 hash verification through `UPLOADCHECK_API_KEY_SHA256`. Legacy `QCGENIE_*` names are still accepted during migration.
- Webhook delivery previews use HMAC-SHA256 signatures in the `X-QCGenie-Signature` format until the webhook header rename is shipped.
- New webhook signing secrets are returned once on creation and encrypted at rest when `UPLOADCHECK_SECRET_ENCRYPTION_KEY` is configured; legacy plaintext records remain readable for migration. Set this env var on Render before treating hosted webhook secrets as encrypted.
- Completed jobs enqueue signed webhook delivery records for registered `job.completed` endpoints.
- Webhook delivery logs are available at `/v1/webhooks/deliveries`; manual retry execution is available at `/v1/webhooks/deliveries/{delivery_id}/retry`.
- Due pending webhook deliveries can be drained in batches through `/v1/webhooks/deliveries/drain`.
- Render cron can run `node scripts/drain-webhooks.mjs` with `UPLOADCHECK_API_KEY`, `UPLOADCHECK_API_BASE_URL`, and `UPLOADCHECK_DRAIN_LIMIT` to process due deliveries on a schedule.
- Report reads append rounded-minute usage ledger entries.
- Job creation currently runs deterministic v0 QC processing immediately and stores lifecycle events, one warning flag, and report artifact records.
- When a job source resolves to a local video or downloadable URL, `qc-engine-runner.mjs` can run the reference gate; otherwise the hosted job records a `WATCH` engine warning instead of pretending the asset passed.
- Editor marker CSV exports are available at `/v1/qc/jobs/{job_id}/artifacts/markers`.
- Job creation honors `idempotency_key` so agent retries return the existing job instead of creating duplicate QC runs.
- External full-video gate outputs can be imported with `/v1/qc/jobs/{job_id}/gate-verdict`; imported findings become stored flags, reports, marker CSV rows, and webhook-triggering job verdicts.
- Reference full-video gate scripts live under `scripts/qc-engine/`.
- `supabase/schema.sql` includes workspace membership and RLS policies for the production persistence model.
- Production persistence still needs hosted `UPLOADCHECK_SECRET_ENCRYPTION_KEY` configuration, a live Supabase connection, advisor verification, legacy webhook secret migration, and storage buckets.

## Stack

- React + Vite app
- Vitest for core engine tests
- Supabase-ready schema in `supabase/schema.sql`
- Render-ready static deployment in `render.yaml`
- Lemon Squeezy-ready env names in `.env.example`

## Local Development

```bash
npm install
npm run dev
```

## Verification

```bash
npm test
npm run build
```
