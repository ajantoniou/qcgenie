# UploadCheck Anthropic Directory Prep

UploadCheck is currently a public GitHub MCP install, not an Anthropic Directory-ready public listing.

## Current Channel Priority

1. Keep SaaS basics verified: checkout, paid workspace API keys, included-minute enforcement, overage/spend alerts, durable persistence, and deployed docs.
2. Run public GitHub MCP install through Claude Code, Codex, Cursor, and local NTO production using the `uploadcheck` MCP server.
   - Install handoff: `docs/PRIVATE-MCP-BETA.md`
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
- `npm run npm-publish:preflight`
- `npm run mcp-install:verify`
- `npm run product-agent:verify`
- `npm run private-mcp-beta:verify`
- `npm run private-mcp-beta:evidence`
- `npm run private-mcp-beta:capture -- /path/to/sanitized-client-proof.json`
- `npm run checkout-launch:verify`
- `npm run saas-basics:verify`
- `npm run codex:verify-install`
- `npm run build`
- `npm run readiness:check` showing checkout, custom domain, persistence, storage, and demo readiness are configured
- `npm run live-mcp-install:verify` after Render redeploy, proving hosted `/mcp-install.json` is current
- Registry proof that `@uploadcheck/cli` and `@uploadcheck/mcp` are published
- A paid workspace API key can create a QC job and fetch the report
- The dashboard or checkout provisioning path can create a workspace API key only with authenticated provisioning authority, applies plan economics server-side, and never exposes the stored hash or future copies of the bearer
- Lemon Squeezy checkout webhooks are verified with `X-Signature` HMAC-SHA256 and `UPLOADCHECK_LEMONSQUEEZY_WEBHOOK_SECRET` before they can provision an MCP/API key
- A job that crosses the subscription-value threshold on billable extra-minute spend records a spend alert, sends the owner email through Resend, and remains reviewable through `GET /v1/spend-alerts` with COGS retained as audit context
- Public GitHub MCP proof from Claude Code, Codex, and Cursor using workspace API keys and the public MCP tool surface only, captured in `docs/private-mcp-beta-evidence-template.json`
- No public MCP manifest, package file list, Directory draft, or README path exposes `gemini_watch`, `omni_watch`, `qwen`, `anthropic_fallback_oracle`, or `deep_ai_review` as a customer tool

## Listing Positioning

Name: UploadCheck.app

Short description: Quality check videos, podcasts, and clips before upload.

User promise: Claude Code, Codex, Cursor, and MCP-capable agents can run `/check`, receive timestamped UploadCheck flags, fix only reachable issues, and rerun before claiming a media asset is upload-ready.

Commercial boundary: Deterministic publish-readiness minutes are the included unit. Deep model review remains internal product QA for capture-rate measurement and roadmap discovery unless sold separately.

## Draft Artifact

- Machine-readable draft: `docs/anthropic-directory-draft.json`
- Verifier: `npm run anthropic-directory:verify`
- Rule: the draft must remain `public_github_mcp_not_ready_for_directory` until package publish, hosted MCP install proof, paid workspace-key proof, and public GitHub MCP evidence are complete in `docs/private-mcp-beta-evidence-template.json`.

## Connector Decision

Do not apply for a broad connector or ChatGPT app yet. The current product-agent path should be:

1. Public GitHub MCP install through public GitHub clone or local checkout.
2. Public npm packages after `packages:install-smoke` and registry publish proof.
3. Anthropic Directory submission after hosted MCP install, paid workspace, spend-alert, and client beta evidence are captured.
4. Hosted HTTPS MCP endpoint or connector review only after account binding, report UX, and abuse/cost controls are proven in production.
