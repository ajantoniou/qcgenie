# QC Genie MCP Server

Thin MCP wrapper over the hosted QC Genie API. It does not run QC locally.

## Environment

```bash
export QCGENIE_API_BASE_URL="https://qcgenie-webservice.onrender.com"
export QCGENIE_API_KEY="qcg_live_..."
```

## Tools

- `qc_run_video`
- `qc_get_job`
- `qc_get_report`
- `qc_list_recent_jobs`
- `qc_create_upload_url`

## Codex Install Shape

```bash
cd mcp-server
npm install
node index.mjs
```
