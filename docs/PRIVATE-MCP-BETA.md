# UploadCheck Public NPM MCP Install

UploadCheck is currently a public npm MCP install with public GitHub/local checkout fallback. External Claude Code, Codex, Cursor, and MCP clients must use a workspace API key tied to included plan minutes or an operator-created account. Local NTO production can keep using the local repo path directly.

## Install Readiness Contract

- Customer-facing MCP/API runs use deterministic publish-readiness QC minutes.
- Internal Gemini, Qwen, Anthropic, or Omni oracle checks are for capture-rate backtests and roadmap discovery, not included customer minutes.
- `--fast` is not a spend guardrail. It only shortens expensive watchers when those watchers are explicitly requested.
- Local gate smoke tests and operator reruns should use `--deterministic-only` with any hand-built `--checks` list. `VERDICT.json` records `requested_checks`, `effective_checks`, `paid_oracle_checks_requested`, and `paid_oracle_checks_removed` so credit-safety is auditable.
- Paid oracle checks such as `twins`, `omni_watch`, `gemini_watch`, `narration_match`, `cheap_broll`, and `garble` require explicit `--checks`.
- Workspace API keys are returned once, stored hashed, scoped, and honored on job creation for workspace, owner email, plan, included minutes, subscription price, and operator-approved account-limit metadata. Stored customer keys force these server-side values over client-supplied workspace, plan, or cap fields.
- Stored customer keys can only create/read uploads, register/review/drain webhooks, read, report, cancel, import gate verdicts for, drain queued jobs, list, and meter jobs in their own workspace. Active-job concurrency limits are also evaluated within the stored key's workspace. If a stored key has API-key review/provisioning scopes, those routes are still pinned to the stored key's own workspace, owner, plan economics, and overage cap, including checkout provisioning. Operator/admin bearer keys keep broader provisioning and review access.
- Redacted workspace API keys must be reviewable through the dashboard or `GET /v1/api-keys` with `api_keys:read`, without exposing token hashes or bearer secrets.
- Abuse events must be visible through the dashboard or `GET /v1/abuse-events`.
- Extra deterministic minutes require approved `overage_cap_cents`; a zero or omitted cap blocks at included minutes and records `usage_limit_exceeded`.
- Owner spend alerts must record, email through Resend, and remain reviewable through the dashboard or `GET /v1/spend-alerts` when billable extra-minute spend crosses 100% of subscription value. COGS stays visible as audit context, but the trigger follows customer overage spend.

## Provision A Workspace Key

Use the dashboard API-key form or call the API with an operator bearer that has `api_keys:write`.

```bash
curl https://api.uploadcheck.app/v1/api-keys \
  -H "authorization: Bearer <operator_or_admin_bearer>" \
  -H "content-type: application/json" \
  -d '{
    "workspace_id": "creator-workspace",
    "owner_email": "owner@example.com",
    "plan_id": "creator",
    "included_minutes": 2400,
    "plan_price_cents": 9900,
    "scopes": ["jobs:write", "jobs:read", "reports:read", "uploads:write"]
  }'
```

Store the returned `apiKey` privately as `UPLOADCHECK_API_KEY`. It will not be returned again.

## Codex Public NPM Install

Use the public MCP package for new installs. The machine-readable install artifact at `/mcp-install.json` keeps the public npm snippets and GitHub/local fallback snippets aligned.

```toml
[mcp_servers.uploadcheck]
command = "npx"
args = ["-y", "@drantoniou/uploadcheck-mcp"]
startup_timeout_sec = 60

[mcp_servers.uploadcheck.env]
UPLOADCHECK_API_BASE_URL = "https://api.uploadcheck.app"
UPLOADCHECK_API_KEY = "<workspace_api_key>"
```

## Claude Code / Claude Desktop Public NPM Install

```json
{
  "mcpServers": {
    "uploadcheck": {
      "command": "npx",
      "args": ["-y", "@drantoniou/uploadcheck-mcp"],
      "env": {
        "UPLOADCHECK_API_BASE_URL": "https://api.uploadcheck.app",
        "UPLOADCHECK_API_KEY": "<workspace_api_key>"
      }
    }
  }
}
```

## Cursor Public NPM Install

Use the same JSON shape in `.cursor/mcp.json`.

## First Install Smoke

1. Call `qc_get_cost_basis`.
2. Call `qc_estimate_cost` with the exact deterministic checks the workspace plans to use.
3. Call `qc_run_local_file` on a tiny fixture with `checks: "canvas_fill"` or `checks: "dead_air"`.
4. Fetch `qc_get_job`, `qc_get_report`, and `qc_get_marker_csv`.
5. Confirm the job belongs to the created workspace and does not expose the stored key hash.
6. Confirm any abuse-limit run is persisted and visible in the dashboard abuse panel.
7. Confirm any overage-spend alert is persisted and visible in the dashboard spend-alert panel.

## Evidence Capture Contract

Use `docs/private-mcp-beta-evidence-template.json` to capture proof for Claude Code, Codex, and Cursor. Keep it sanitized: no raw workspace API keys, token hashes, private media, checkout URL paths, or customer secrets.

Each captured client proof must include:

- client name: `claude_code`, `codex`, or `cursor`
- workspace id tied to included plan minutes or an operator-created account
- install path and API base URL
- public MCP/API tools called
- deterministic checks requested
- job id
- report id or report URL
- final verdict
- sanitized evidence timestamp

Run `npm run private-mcp-beta:evidence` before treating the proof contract as valid. The verifier allows the template to remain `template_not_captured`, but Directory/public submission cannot move forward until all three client proofs are captured.

To merge one sanitized client proof into the evidence file:

```bash
npm run private-mcp-beta:capture -- /path/to/sanitized-client-proof.json
npm run private-mcp-beta:evidence
```

The capture helper rejects raw API keys, token/hash-looking strings, forbidden internal tools, missing cost preflight, and missing report fetches.

Before handing the beta instructions to another workspace, run:

```bash
npm run private-mcp-beta:verify
npm run private-mcp-beta:evidence
npm run packages:verify
npm run packages:install-smoke
npm run npm-publish:preflight
npm run saas-basics:verify
npm run mcp-install:verify
npm run anthropic-directory:verify
npm run product-agent:verify
```

## Not Yet Public Self-Serve

Do not publish broad install copy or submit Anthropic Directory until:

- `@drantoniou/uploadcheck` and `@drantoniou/uploadcheck-mcp` are published to npm.
- `npm run npm-publish:preflight` shows the current package versions are publishable and identifies npm auth state before founder publish.
- Hosted `/mcp-install.json`, launch doctor, and launch evidence are redeployed and pass their live verifiers.
- Registry install proof confirms clean `npx`/package installs after publish.
- A paid or beta workspace key can create a hosted QC job and fetch the report.
- Public GitHub MCP evidence from Claude Code, Codex, and Cursor is captured in `docs/private-mcp-beta-evidence-template.json`.
