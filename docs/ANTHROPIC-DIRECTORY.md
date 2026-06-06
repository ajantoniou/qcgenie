# UploadCheck Anthropic Directory Prep

UploadCheck is currently a private MCP beta, not an Anthropic Directory-ready public listing.

## Current Channel Priority

1. Finish SaaS basics: checkout, paid workspace API keys, included-minute enforcement, overage/spend alerts, durable persistence, and deployed docs.
2. Run private MCP beta through Claude Code, Codex, Cursor, and local NTO production using the `uploadcheck` MCP server.
3. Publish `@uploadcheck/cli` and `@uploadcheck/mcp` after package smoke tests pass and the founder is logged in to npm.
4. Prepare Anthropic Directory submission around the MCP/API workflow.
5. Defer OpenAI ChatGPT app/connector work until the hosted HTTPS MCP endpoint, account binding, and report UX justify that review path.

## Directory Candidate Scope

Public MCP tools should stay narrow:

- `qc_get_cost_basis`
- `qc_estimate_cost`
- `qc_run_video`
- `qc_run_local_file`
- `qc_get_job`
- `qc_get_report`
- `qc_get_events`
- `qc_get_artifacts`
- `qc_get_marker_csv`
- `qc_create_upload_url`

Internal product-testing oracles such as `scripts/qc-engine/gemini_watch.py` are not customer tools and must not be listed in public package docs, MCP manifests, or Directory copy.

## Required Evidence Before Submission

- `npm run packages:verify`
- `npm run packages:install-smoke`
- `npm run codex:verify-install`
- `npm run build`
- `npm run readiness:check` showing checkout is configured
- Registry proof that `@uploadcheck/cli` and `@uploadcheck/mcp` are published
- A paid workspace API key can create a QC job and fetch the report
- The dashboard or checkout provisioning path can create a workspace API key only with authenticated provisioning authority, and never exposes the stored hash or future copies of the bearer
- A job that crosses the subscription-value spend threshold records a spend alert and sends the owner email through Resend

## Listing Positioning

Name: UploadCheck.app

Short description: Quality check videos, podcasts, and clips before upload.

User promise: Claude Code, Codex, Cursor, and MCP-capable agents can run `/check`, receive timestamped UploadCheck flags, fix only reachable issues, and rerun before claiming a media asset is upload-ready.

Commercial boundary: Deterministic publish-readiness minutes are the included unit. Deep model review remains internal product QA for capture-rate measurement and roadmap discovery unless sold separately.
