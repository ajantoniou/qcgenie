# UploadCheck Pipeline Integration

Tagline: Quality check videos, podcasts, and clips before you upload.

Canonical surfaces:

- MCP server: `uploadcheck`
- CLI/package: `@uploadcheck/cli`
- MCP package: `@uploadcheck/mcp`
- API base: `https://qcgenie-api.onrender.com` while the UploadCheck custom-domain cutover is pending.

## Codex MCP Install

The local Codex config should point at the repository MCP server:

```toml
[mcp_servers.uploadcheck]
command = "node"
args = ["/Applications/DrAntoniou Projects/QCGenie/mcp-server/index.mjs"]

[mcp_servers.uploadcheck.env]
UPLOADCHECK_API_BASE_URL = "https://qcgenie-api.onrender.com"
UPLOADCHECK_API_KEY = "<workspace_api_key>"
```

The server exposes `qc_run_video`, `qc_get_job`, `qc_get_report`, `qc_get_events`, `qc_get_artifacts`, `qc_get_marker_csv`, `qc_submit_gate_verdict`, `qc_list_recent_jobs`, and `qc_create_upload_url`.

## CLI Usage

Run a local video through the hosted API as an ephemeral inline payload:

```bash
UPLOADCHECK_API_KEY="<workspace_api_key>" \
node "/Applications/DrAntoniou Projects/QCGenie/cli/index.mjs" check "/path/to/final-cut.mp4" --json
```

Run a podcast/audio file:

```bash
UPLOADCHECK_API_KEY="<workspace_api_key>" \
node "/Applications/DrAntoniou Projects/QCGenie/cli/index.mjs" check "/path/to/episode.wav" --checks garble --json
```

Run a YouTube URL or signed asset URL:

```bash
UPLOADCHECK_API_KEY="<workspace_api_key>" \
node "/Applications/DrAntoniou Projects/QCGenie/cli/index.mjs" check "https://youtu.be/example" --idempotency-key "nto-ep1-final"
```

The CLI inlines files up to `UPLOADCHECK_INLINE_MEDIA_MAX_MB` or `--max-inline-mb` and sends them to `POST /v1/qc/jobs`. Larger assets automatically use the signed upload API unless `--upload-mode inline` is specified.

Force the signed-upload path:

```bash
UPLOADCHECK_API_KEY="<workspace_api_key>" \
node "/Applications/DrAntoniou Projects/QCGenie/cli/index.mjs" check "/path/to/master.mp4" \
  --upload-mode signed \
  --checks canvas_fill,text_safe_area,loop_freeze \
  --json
```

Signed-upload flow:

1. `POST /v1/uploads` creates a tokenized `signedPutUrl`.
2. The CLI `PUT`s the file bytes to `/v1/uploads/{upload_id}/content?token=...`.
3. The CLI creates a job with `upload_id`.
4. Render reads the uploaded temp file locally, runs the deterministic gate, and records the report.

## NTO/NPO Pipeline Pattern

For NTO long-form episodes, shorts, or NPO media exports:

1. Render the final candidate to a local file.
2. Call `uploadcheck check <file>`. Small files inline; larger files use signed upload. MCP callers can use `media_base64` for small files or `qc_create_upload_url` + `qc_run_video` with `upload_id` for large files.
3. Poll `qc_get_job` until `status=completed`.
4. Fetch `qc_get_report` and `qc_get_marker_csv`.
5. Treat `BLOCK` as stop-ship, `WATCH` as source review, and `PASS` as ready only after the project-specific editorial checklist is also complete.

The hosted API writes inline media to temporary server storage, runs the deterministic gate, parses the gate verdict, stores the report, and deletes the temporary media file after the request finishes.

For NTO specifically, UploadCheck is the replacement target for the current production QC personas and scripts. The product should eventually cover the NTO gates for audio garble, script faithfulness, pronunciation watchlists, visual-to-narration match, literal named-subject match, canvas/aspect errors, Shorts safe area, low-contrast overlay text, repeat fatigue, source-family dominance, cheap filler, dead air, first-three-second hook quality, re-hook cadence, and repair-loop instructions. The current engine already includes `canvas_fill`, `dead_air`, `text_contrast`, `text_safe_area`, and opt-in `shorts_format`.

Agent repair loop:

1. Call `qc_run_video` or `uploadcheck check`.
2. Fetch `qc_get_report`.
3. Show all flags grouped by `BLOCK`, `WATCH`, and fixability.
4. Ask the user whether to fix now.
5. Apply fixes only where the agent has reachable source files or captions. For render/source defects, return timestamped patch instructions and rerun UploadCheck after the user or renderer updates the asset.

## Cost Guard

Job responses include `costEstimate`. The current roadmap verdict is that `$99 / 5000 minutes` is not margin-safe for every creator account if every minute receives full multimodal AI review. It is viable only when deterministic scan minutes are the billable baseline and expensive model calls are sampled or reserved for flagged regions.
