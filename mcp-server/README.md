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

The agent should call `qc_run_video`, poll `qc_get_job`, fetch `qc_get_report`, then list timestamped evidence and fix captions, checklists, and source-level issues it can reach.

When a project has a storybook, edit decision list, or visual timeline JSON, pass it as `manifest_json` with `checks: "repeat_fatigue"`. UploadCheck will use it to flag exact visual reuse and source-family dominance even before a final render is reviewed.

When a project has transcript text or a script-sidecar, pass it as `transcript_text` or `transcript_json` with `checks: "spoken_leaks"`. UploadCheck will flag spoken URLs, markdown, prompt text, stage directions, vendor/tool names, and known wrong-name substitutions without running ASR.

## Tools

- `qc_run_video`
- `qc_get_job`
- `qc_get_report`
- `qc_get_events`
- `qc_get_artifacts`
- `qc_get_marker_csv`
- `qc_submit_gate_verdict`
- `qc_list_recent_jobs`
- `qc_create_upload_url`

Use `idempotency_key` with `qc_run_video` when an agent may retry the same asset. The hosted API returns the existing job instead of creating a duplicate run.
Use `qc_submit_gate_verdict` after running `scripts/qc-engine/run_gate.py` so the hosted job report reflects the full-video gate result.

## Codex Install Shape

```bash
cd mcp-server
npm install
node index.mjs
```
