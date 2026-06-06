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
- MCP tools call the hosted API; `qc_run_local_file` only reads/encodes local media before sending it to Render.
- Customer-facing tools do not expose internal model/provider rails.
- MCP server name: `uploadcheck`.
- CLI/package options: `@uploadcheck/cli` and `@uploadcheck/mcp`.

Current API/MCP tools:

- MCP server: `uploadcheck`
- CLI/package: `@uploadcheck/cli` or `@uploadcheck/mcp`
- Installed Codex skill: `uploadcheck` at `/Users/drantoniou/.codex/skills/uploadcheck`

- `qc_estimate_cost`
- `qc_get_launch_status`
- `qc_run_video`
- `qc_run_local_file`
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
- Launch readiness: `https://qcgenie-api.onrender.com/v1/readiness`
- Live launch status: `https://qcgenie-api.onrender.com/v1/launch-status`
- Launch status metadata: `https://qcgenie-api.onrender.com/launch-status.json`
- MCP wrapper package: `mcp-server/`
- CLI package: `cli/`
- Launch doctor: `npm run launch:doctor`
- Product Hunt launch checker: `npm run launch:check`
- DNS cutover helper: `npm run launch:dns`
- Checkout config helper: `npm run launch:checkout`
- Persistence/storage config helper: `npm run launch:storage`
- Launch status verifier: `npm run launch-status:verify`
- Product Hunt readiness CLI: `npm run readiness:check`
- Render Blueprint verifier: `npm run render:verify`
- Render API launch helper: `npm run render:bootstrap-env`, `npm run render:env-template`, `npm run render:plan`, `npm run render:validate-env-file -- /tmp/uploadcheck-render-launch.env`, `npm run render:validate-env`, `npm run render:audit`, `npm run render:apply`
- Package publish verifier: `npm run packages:verify` checks `@uploadcheck/cli` and `@uploadcheck/mcp` identity, bins, lock metadata, and `npm pack --dry-run` contents.
- Codex install verifier: `npm run codex:verify-install` checks the global `uploadcheck` MCP server entry, hosted API base URL, executable MCP wrapper, and installed UploadCheck skill.
- Cost-basis verifier: `npm run cost-basis:verify` checks public cost-per-minute and 95% gross-margin assumptions against `cost-model.mjs`.
- Roadmap verifier: `npm run roadmap:verify` checks the 50-point plan, expert-panel coverage, NTO replacement addendum, and execution-status markers.
- CLI margin telemetry: `uploadcheck usage --billing-period YYYY-MM`

Persistence state:

- Current hosted API stores jobs, uploads, webhook endpoints, webhook delivery previews, and usage ledger entries through `server-store.mjs`.
- API auth supports plaintext `UPLOADCHECK_API_KEY` for local clients/bootstrap and SHA-256 hash verification through `UPLOADCHECK_API_KEY_SHA256`. Generate a key/hash pair with `npm run --silent api-key:generate`; save the bearer token privately for clients and set `UPLOADCHECK_API_KEY_SHA256` on Render. Legacy `QCGENIE_*` names are still accepted during migration.
- Webhook delivery previews use HMAC-SHA256 signatures in the `X-UploadCheck-Signature` format. Legacy `X-QCGenie-Signature` aliases are still sent during migration.
- New webhook signing secrets are returned once on creation and encrypted at rest when a strong `UPLOADCHECK_SECRET_ENCRYPTION_KEY` is configured; legacy plaintext records remain readable for migration. Generate a key with `npm run --silent secret:generate`, then set this env var on Render before treating hosted webhook secrets as encrypted.
- Completed jobs enqueue signed webhook delivery records for registered `job.completed` endpoints.
- Webhook delivery logs are available at `/v1/webhooks/deliveries`; manual retry execution is available at `/v1/webhooks/deliveries/{delivery_id}/retry`.
- Due pending webhook deliveries can be drained in batches through `/v1/webhooks/deliveries/drain`.
- Render cron can run `node scripts/drain-webhooks.mjs` with `UPLOADCHECK_API_KEY`, `UPLOADCHECK_API_BASE_URL`, and `UPLOADCHECK_DRAIN_LIMIT` to process due deliveries on a schedule.
- Report reads append rounded-minute usage ledger entries.
- Usage metering is idempotent per job and billing period; declared jobs with `plan_id` plus `minutes`, `duration_seconds`, or `ai_review_seconds` are rejected with `usage_limit_exceeded` before QC if they would exceed included plan minutes or AI-review seconds.
- Abuse limits fail fast before QC compute: `duration_limit_exceeded`, `upload_size_limit_exceeded`, and `active_job_limit_exceeded`. Defaults are 240 minutes, 2048 MB, and 25 active jobs, configurable with `UPLOADCHECK_MAX_DURATION_MINUTES`, `UPLOADCHECK_MAX_UPLOAD_MB`, and `UPLOADCHECK_MAX_ACTIVE_JOBS`.
- `uploadcheck usage` reads `/v1/usage/margins` and prints current estimated COGS, cost/minute, and gross margin.
- Job creation currently runs deterministic v0 QC processing immediately and stores lifecycle events, one warning flag, and report artifact records.
- Jobs persist observability telemetry: `startedAt`, `completedAt`, `processingDurationMs`, stage elapsed times, provider-usage entry counts, and fallback `failureReason`.
- Queued execution is available with `process_async=true` on `POST /v1/qc/jobs`; workers or Render cron/workflows can process queued jobs with `POST /v1/qc/jobs/drain`. Inline media and inline sidecars remain synchronous because their temporary files are deleted after the create request.
- When a job source resolves to a local video or downloadable URL, `qc-engine-runner.mjs` can run the reference gate; otherwise the hosted job records a `WATCH` engine warning instead of pretending the asset passed.
- Editor marker CSV exports are available at `/v1/qc/jobs/{job_id}/artifacts/markers`.
- Job creation honors `idempotency_key` so agent retries return the existing job instead of creating duplicate QC runs.
- External full-video gate outputs can be imported with `/v1/qc/jobs/{job_id}/gate-verdict`; imported findings become stored flags, reports, marker CSV rows, and webhook-triggering job verdicts.
- Reference full-video gate scripts live under `scripts/qc-engine/`.
- `supabase/schema.sql` includes workspace membership and RLS policies for the production persistence model.
- Production persistence currently uses the server-side JsonStore; launch-ready persistence requires `UPLOADCHECK_STORE_PATH` outside temp storage, for example `/mnt/uploadcheck-data/store.json`. Supabase remains the future multi-workspace persistence target until a server adapter is wired.
- Production still needs hosted `UPLOADCHECK_SECRET_ENCRYPTION_KEY` configuration with a generated strong key and legacy webhook secret migration.
- Durable upload retention can use a mounted storage path via `UPLOADCHECK_DURABLE_STORAGE_DIR`; object-storage buckets remain the next storage adapter.
- `/v1/readiness` exposes no-secret booleans for checkout, custom domain, API auth, encryption, persistence, storage, demo clip, and Product Hunt readiness.
- `/v1/launch-status` derives a live machine-readable launch go/no-go summary from readiness, including current blockers and operator commands.
- `/launch-status.json` publishes machine-readable completed controls, current blockers, operator commands, and Product Hunt go/no-go rules; `npm run launch-status:generate` rebuilds it with the Product Hunt kit, and `npm run launch-status:verify` keeps it aligned with readiness and public agent metadata.
- `npm run live-public-artifacts:verify` checks hosted `/launch-status.json`, `/product-hunt-launch-kit.json`, `/sample-reports/index.json`, the individual PASS/WATCH/BLOCK sample report JSON files, and `/llms.txt` before Product Hunt readiness can pass.
- `npm run live-web-artifacts:verify` checks hosted Product Hunt, pricing, sample-report, agentic API, sitemap, `llms.txt`, and demo MP4 content before Product Hunt readiness can pass.
- `/npo-pipeline-handoff.json` publishes the focused NPO podcast/audio MCP sequence, sidecar contract, Render media-ingress rules, marker CSV handoff, and "Fix now?" rerun loop; `npm run live-npo-pipeline-handoff:verify` blocks stale hosted copies.
- `/cost-basis.json` publishes the plan-level revenue/minute, max COGS/minute, and full-review margin safety answer; `npm run cost-basis:verify` keeps it aligned with the cost model.
- `/product-hunt-launch-kit.json` publishes Product Hunt launch copy, demo flow, sample-report links, cost-basis proof, and the launch go/no-go source of truth.
- `npm run product-hunt-kit:generate` rebuilds `/product-hunt-launch-kit.json` from `/launch-status.json`.
- `/sample-reports/index.json` publishes PASS, WATCH, and BLOCK report examples with source-hash proof, timestamped flags, editor handoff artifacts, and repair-loop guidance.
- `npm run roadmap:verify` keeps `docs/PRODUCT-ROADMAP.md` honest about the exact 50-point plan, expert-panel inputs, NTO-derived product tasks, and execution markers.
- `npm run launch:doctor` runs the local launch helpers, explicit checkout/storage probes, public metadata verifiers, and live readiness/DNS checks in one ordered report.
- `npm run launch:dns` prints copy-paste DNS records and verification commands from `public/launch-targets.json`.
- `npm run launch:checkout` prints the configured checkout source, host, and redacted URL for Creator, Studio, and Network without exposing checkout path secrets or Lemon Squeezy variant IDs.
- `npm run launch:storage` prints mounted JSON-store, durable upload path, and object-storage completeness without exposing access keys or secret keys.
- `npm run launch:check` combines live readiness, live launch status, DNS, and HTTP checks for `uploadcheck.app`, `www.uploadcheck.app`, and `api.uploadcheck.app`.
- `npm run readiness:check` fetches live readiness and prints the exact remaining Render/DNS/checkout actions.
- `npm run render:verify` checks that `render.yaml` declares custom domains, a mounted disk, durable store/media paths, checkout prompts, and webhook encryption prompts.
- `npm run render:bootstrap-env` prints a fillable local env file with generated `UPLOADCHECK_API_KEY_SHA256` and `UPLOADCHECK_SECRET_ENCRYPTION_KEY` values already filled; it prints the client bearer token to stderr so it is not saved in the Render env file. `npm run render:env-template` prints the same template with placeholders only. `npm run render:validate-env-file -- /tmp/uploadcheck-render-launch.env` checks a filled local file before sourcing it. `npm run render:validate-env` checks the currently loaded environment. Both validators reject placeholders, invalid checkout/storage URLs or Lemon Squeezy variant inputs, weak encryption keys, invalid API key hashes, and non-durable paths before `render:apply`. `npm run render:plan`, `npm run render:audit`, and `npm run render:apply` use `RENDER_API_KEY` to inspect or apply Render custom domains, durable env values, provided checkout configuration, and provided secret values.
- `npm run codex:verify-install` checks that the local Codex app still exposes UploadCheck globally through `[mcp_servers.uploadcheck]` and the `/Users/drantoniou/.codex/skills/uploadcheck` skill.

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
npm run packages:verify
```
