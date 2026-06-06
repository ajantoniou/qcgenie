# UploadCheck MCP Server

Thin MCP wrapper over the hosted UploadCheck API. It does not run quality checks locally.

Canonical naming:

- MCP server: `uploadcheck`
- CLI/package: `@uploadcheck/cli` or `@uploadcheck/mcp`
- Tagline: Quality check videos, podcasts, and clips before you upload.

## Environment

```bash
export UPLOADCHECK_API_BASE_URL="https://qcgenie-api.onrender.com"
export UPLOADCHECK_API_KEY="<workspace_api_key>"
```

Legacy `QCGENIE_API_BASE_URL` and `QCGENIE_API_KEY` are still accepted as fallbacks during the rename.

## Agent Workflow

Use `/check` from Claude Code, Codex, or another slash-command capable workspace to quality check a media asset before upload.

```text
/check ./final-upload.mp4
```

Small and medium local files can be sent through Render without durable storage by base64-encoding the media and passing one of:

- `video_base64` with `video_content_type`
- `audio_base64` with `audio_content_type`
- `media_base64` with `media_content_type` and `media_kind`
- `data_url`

The API writes the payload to a temp file, runs the gate, and deletes the temp file after processing. Use signed URLs or future direct object storage for large files.

The agent should call `qc_run_local_file` for a reachable local export, or `qc_run_video` when it already has a YouTube URL, signed URL, upload id, or base64 payload. Then poll `qc_get_job`, fetch `qc_get_report`, and list timestamped evidence plus source-level issues it can reach.

For Codex, Claude Code, Cursor, or NTO/NPO production pipelines, `qc_run_local_file` is the default local workflow:

```json
{
  "file_path": "/path/to/final-upload.mp4",
  "checks": "canvas_fill,loop_freeze,repeat_fatigue,dead_air,text_contrast,text_safe_area",
  "manifest_path": "/path/to/storybook.json",
  "transcript_path": "/path/to/transcript.txt",
  "watchlist_path": "/path/to/watchlist.json",
  "expected_script_path": "/path/to/locked-script.txt",
  "sidecar_dir": "/path/to/_dialogue-chunks",
  "plan_id": "creator",
  "cost_guardrail": "downgrade"
}
```

Small files are base64 encoded by the local MCP process and evaluated through Render inline. Larger files use the signed-upload path automatically unless `upload_mode: "inline"` or `upload_mode: "signed"` is specified.

Hosted media ingress can be smoke-tested from the repo before handing the MCP to another production pipeline:

```bash
UPLOADCHECK_MEDIA_INGRESS_BASE_URL=https://qcgenie-api.onrender.com UPLOADCHECK_API_KEY=<private_bearer> npm run media-ingress:verify
```

When a project has a storybook, edit decision list, or visual timeline JSON, pass it as `manifest_json` with `checks: "repeat_fatigue"`. UploadCheck will use it to flag exact visual reuse and source-family dominance even before a final render is reviewed.

When a project has transcript text or a script-sidecar, pass it as `transcript_text` or `transcript_json` with `checks: "spoken_leaks"`. UploadCheck will flag spoken URLs, markdown, prompt text, stage directions, vendor/tool names, and known wrong-name substitutions without running ASR.

For customer-specific terms, pass `watchlist_json` with `checks: "pronunciation_watchlist"` plus transcript text. Watchlist entries can include `terms: [{ expected, banned: [] }]` and top-level `banned: []`.

When a project has a locked narration script and final transcript, pass `expected_script_text` or `expected_script_json` plus transcript text with `checks: "script_faithfulness"`. UploadCheck compares word error rate model-free, so agents can catch narration drift without paying for full multimodal review.

When a project has local chunk QC reports, pass `sidecar_dir` with `checks: "chunk_sidecar_failures"`. The local MCP process packages JSON sidecars such as `*.garble-report.json`, Render evaluates them from memory/temp storage, and failed chunk reports become BLOCK flags before upload.

For thumbnail candidates, call `qc_run_local_file` on the image with `checks: "thumbnail_text_readability"`. The same inline Render path evaluates OCR contrast and edge/safe-area readability without model spend.

Use `plan_id`, `ai_review_seconds`, and `cost_guardrail` when an agent is asking for paid AI review beyond deterministic checks. The default guardrail is `downgrade`: margin-breaking AI review is removed and the job runs deterministic checks. Use `block` to reject unsafe requests, or `off` only for internal experiments/deep-review add-ons.

Checked minutes mean deterministic pre-upload QC minutes. The old `$99 / 5,000` stress plan leaves only `0.0157` COGS cents/min after deterministic scanning, so unlimited full-video AI review is not included; model-backed deep review must be preflighted, downgraded, blocked, or sold separately to preserve the >95% gross-margin target.

Call `qc_get_launch_status` before launch-sensitive production workflows when an agent needs the live Product Hunt go/no-go state, remaining blockers, and operator commands. This status endpoint is public; the other QC tools still require an API key.

Call `qc_estimate_cost` before uploading large media or asking for model-backed checks. It returns the effective checks, removed checks, margin safety, and cost estimate without creating a job.

## Tools

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
- `qc_get_margin_telemetry`
- `qc_create_upload_url`

Use `idempotency_key` with `qc_run_video` when an agent may retry the same asset. The hosted API returns the existing job instead of creating a duplicate run.
Use `qc_submit_gate_verdict` after running `scripts/qc-engine/run_gate.py` so the hosted job report reflects the full-video gate result.

## Codex Install Shape

```bash
cd mcp-server
npm install
node index.mjs
```
