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

The agent should call `qc_run_video`, poll `qc_get_job`, fetch `qc_get_report`, then list timestamped evidence and fix captions, checklists, and source-level issues it can reach.

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
