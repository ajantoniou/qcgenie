# QC Genie

Agentic quality control for creator video assets. The beachhead is YouTube videos: creators import a URL or upload a cut, QC Genie runs deterministic gates across the full timeline, then adds grounded multimodal review notes.

## Product Rules

- Deterministic checks are the billable source of truth for `PASS`, `WATCH`, and `BLOCK`.
- Multimodal agent review is a grounded second opinion. It cannot create a hard fail unless the defect is supported by deterministic evidence or explicit transcript evidence.
- The UI does not expose the internal model rails to creator customers.
- Metering is by rounded video minutes.

## Agentic Surface

QC Genie supports self-serve users and programmatic agent workflows.

- Web users paste a YouTube URL or upload a cut.
- Claude, Codex, and other agents call the same REST API through an MCP server or connector.
- MCP tools are thin wrappers over the API; they do not run QC locally.
- Customer-facing tools do not expose internal model/provider rails.

Current API/MCP tools:

- `qc_run_video`
- `qc_get_job`
- `qc_get_report`
- `qc_get_events`
- `qc_get_artifacts`
- `qc_get_marker_csv`
- `qc_list_recent_jobs`
- `qc_create_upload_url`

See `public/agent-manifest.json`, `public/llms.txt`, and `docs/EXPERT-PANEL-READINESS.md`.

Public API:

- Public app: `https://qcgenie-web.onrender.com`
- Web service prototype: `https://qcgenie-webservice.onrender.com`
- Authenticated API: `https://qcgenie-api.onrender.com`
- OpenAPI: `https://qcgenie-api.onrender.com/openapi.json`
- MCP wrapper package: `mcp-server/`

Persistence state:

- Current hosted API stores jobs, uploads, webhook endpoints, webhook delivery previews, and usage ledger entries through `server-store.mjs`.
- API auth supports plaintext `QCGENIE_API_KEY` for bootstrapping and SHA-256 hash verification through `QCGENIE_API_KEY_SHA256`.
- Webhook delivery previews use HMAC-SHA256 signatures in the `X-QCGenie-Signature` format.
- Completed jobs enqueue signed webhook delivery records for registered `job.completed` endpoints.
- Webhook delivery logs are available at `/v1/webhooks/deliveries`; manual retry execution is available at `/v1/webhooks/deliveries/{delivery_id}/retry`.
- Report reads append rounded-minute usage ledger entries.
- Job creation currently runs deterministic v0 QC processing immediately and stores lifecycle events, one warning flag, and report artifact records.
- Editor marker CSV exports are available at `/v1/qc/jobs/{job_id}/artifacts/markers`.
- Job creation honors `idempotency_key` so agent retries return the existing job instead of creating duplicate QC runs.
- `supabase/schema.sql` includes workspace membership and RLS policies for the production persistence model.
- Production persistence still needs a live Supabase connection, advisor verification, encrypted webhook secret storage, and storage buckets.

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
