# QC Genie MCP Server

Thin MCP wrapper over the hosted QC Genie API. It does not run QC locally.

## Environment

```bash
export QCGENIE_API_BASE_URL="https://qcgenie-api.onrender.com"
export QCGENIE_API_KEY="qcg_live_..."
```

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
