# UploadCheck.app Deployment Cutover

Current verified state on 2026-06-05:

- Render static site display name: `uploadcheck-web`
- Render static site service id: `srv-d8hk200jo6nc73er93u0`
- Live Render static URL: `https://qcgenie-web.onrender.com`
- Render API display name: `uploadcheck-api`
- Render API service id: `srv-d8hk74svikkc73cu6atg`
- Live Render API URL: `https://qcgenie-api.onrender.com`
- Root custom domain on Render: `uploadcheck.app`, status `unverified`
- Redirect custom domain on Render: `www.uploadcheck.app`, status `unverified`, redirects to `uploadcheck.app`
- API custom domain on Render: `api.uploadcheck.app`, status `unverified`

The `uploadcheck-api.onrender.com` and `uploadcheck-web.onrender.com` hostnames are not live because Render retained the original immutable service slugs after the display-name rename. Use the live `qcgenie-*` Render URLs until DNS/custom domains verify.

## DNS Records Needed

Machine-readable DNS and HTTP launch targets are published at `https://qcgenie-api.onrender.com/launch-targets.json` and mirrored in `public/launch-targets.json`.

If the domain uses Cloudflare DNS:

| Type | Name | Target | Notes |
| --- | --- | --- | --- |
| CNAME | `@` | `qcgenie-web.onrender.com` | Cloudflare flattens apex CNAME records. |
| CNAME | `www` | `qcgenie-web.onrender.com` | Render redirects `www` to the apex. |
| CNAME | `api` | `qcgenie-api.onrender.com` | Points API traffic to the Render API service. |

Cloudflare SSL/TLS mode should be `Full`, and any `AAAA` records for these names should be removed while Render verification is pending.

If the DNS provider does not support apex CNAME flattening, use either an `ALIAS`/`ANAME` record for `@` pointing to `qcgenie-web.onrender.com`, or an `A` record to Render's load balancer IP `216.24.57.1`. Keep `www` and `api` as CNAME records to their Render subdomains.

## Render Blueprint Sync

`render.yaml` declares the Product Hunt launch shape:

- Static site custom domains: `uploadcheck.app`, `www.uploadcheck.app`
- API custom domain: `api.uploadcheck.app`
- API persistent disk: `uploadcheck-data` mounted at `/mnt/uploadcheck`
- JSON persistence: `UPLOADCHECK_STORE_PATH=/mnt/uploadcheck/store.json`
- Durable signed-upload media: `UPLOADCHECK_DURABLE_STORAGE_DIR=/mnt/uploadcheck/uploads`
- API auth prompt: `UPLOADCHECK_API_KEY_SHA256` (keep the bearer token private for clients)
- Optional S3/R2 upload retention: set `UPLOADCHECK_STORAGE_BUCKET`, `UPLOADCHECK_STORAGE_ENDPOINT`, `UPLOADCHECK_STORAGE_ACCESS_KEY_ID`, and `UPLOADCHECK_STORAGE_SECRET_ACCESS_KEY`. Optional: `UPLOADCHECK_STORAGE_REGION`, `UPLOADCHECK_STORAGE_PREFIX`, `UPLOADCHECK_STORAGE_PUBLIC_BASE_URL`.
- Checkout prompts: HTTPS direct `UPLOADCHECK_CREATOR_CHECKOUT_URL`, `UPLOADCHECK_STUDIO_CHECKOUT_URL`, `UPLOADCHECK_NETWORK_CHECKOUT_URL`, or Lemon Squeezy `UPLOADCHECK_LEMONSQUEEZY_STORE_SLUG` plus `UPLOADCHECK_<PLAN>_VARIANT_ID`
- Webhook encryption prompt: `UPLOADCHECK_SECRET_ENCRYPTION_KEY`

Before Product Hunt launch, sync the Blueprint or manually apply the same values in Render, then run:

```bash
npm run launch:doctor
npm run launch:handoff -- --text
npm run launch:dns
npm run launch:checkout
UPLOADCHECK_CHECKOUT_PROBE=1 npm run launch:checkout
npm run launch:storage
UPLOADCHECK_STORAGE_PROBE=1 npm run launch:storage
npm run media-ingress:verify
UPLOADCHECK_MEDIA_INGRESS_BASE_URL=https://qcgenie-api.onrender.com UPLOADCHECK_API_KEY=<private_bearer> npm run media-ingress:verify
npm run live-launch-doctor:verify
npm run live-launch-evidence:verify
npm run live-cost-basis:verify
npm run live-agent-manifest:verify
npm run live-pipeline-recipes:verify
npm run live-pipeline-handoff:verify
npm run live-npo-pipeline-handoff:verify
npm run live-openapi:verify
npm run live-public-artifacts:verify
npm run live-web-artifacts:verify
npm run render:verify
npm run launch:check
npm run readiness:check
```

`launch:handoff` includes a structured `blockerFixPlan` in JSON mode and a `Fix plan` section in text mode. Use it as the operator sequence for Render env preparation, checkout URLs, mounted persistence, durable upload storage, domain cutover, webhook secret encryption, and final proof commands before Product Hunt launch.

Agents can use `npm run launch:doctor -- --json` to read the same launch checks as structured data, including blocked step ids and normalized command strings, without scraping the text output.
Agents and operators can use `npm run launch:evidence -- --json` for a redacted handoff bundle that keeps step status, blockers, command strings, summaries, and output hashes while omitting raw stdout/stderr, bearer tokens, checkout paths, variant IDs, and temp paths.
The launch doctor includes the hosted Render media-ingress probe command and reports `hosted-media-ingress` as a blocker until `UPLOADCHECK_API_KEY=<private_bearer>` is present in the operator environment.
The launch doctor also includes `npm run live-launch-evidence:verify` and reports `hosted-launch-evidence` as a blocker until the hosted Render API serves `GET /v1/launch-evidence` with a redacted evidence bundle.
The launch doctor also includes `npm run live-cost-basis:verify` and reports `hosted-cost-basis` as a blocker until hosted `/cost-basis.json` matches the current 95% gross-margin verifier, source-audit, and `$99 / 5,000` stress-plan verdict.
The launch doctor also includes `npm run live-agent-manifest:verify` and reports `hosted-agent-manifest` as a blocker until hosted `/agent-manifest.json` exposes the current MCP tools, NPO profile, repair loop, and cost guardrail.
The launch doctor also includes `npm run live-pipeline-recipes:verify` and reports `hosted-pipeline-recipes` as a blocker until hosted `/pipeline-recipes.json` exposes the current NTO/NPO profiles, low-contrast text gate, clone-crowd gate, and repair-loop contract.
The launch doctor also includes `npm run live-pipeline-handoff:verify` and reports `hosted-pipeline-handoff` as a blocker until hosted `/pipeline-handoff.json` exposes the current launch preflight, cost preflight, media-ingress, marker CSV, repair-loop, and rerun sequence.
The launch doctor also includes `npm run live-npo-pipeline-handoff:verify` and reports `hosted-npo-pipeline-handoff` as a blocker until hosted `/npo-pipeline-handoff.json` exposes the focused NPO audio MCP sequence, sidecars, cost guardrail, media-ingress privacy rule, marker CSV, and repair-loop contract.
The launch doctor also includes `npm run live-openapi:verify` and reports `hosted-openapi` as a blocker until hosted `/openapi.json` exposes launch evidence, queued worker drain, media/base64 inputs, remote sidecar URLs, cost guardrails, usage margins, and signed uploads.
The launch doctor also includes `npm run live-public-artifacts:verify` and reports `hosted-public-artifacts` as a blocker until hosted `/launch-status.json`, `/product-hunt-launch-kit.json`, `/sample-reports/index.json`, the individual PASS/WATCH/BLOCK sample reports, and `/llms.txt` expose the current launch-evidence, cost, sample-report, and public go/no-go contract.
The launch doctor also includes `npm run live-web-artifacts:verify` and reports `hosted-web-artifacts` as a blocker until hosted Product Hunt, pricing, sample-report, agentic API, sitemap, `llms.txt`, and demo MP4 content expose the current public launch proof.

Agents outside this repo can use the packaged CLI fallback `uploadcheck launch-doctor --json`; it fetches the live launch handoff and blocker fix plan from Render without requiring local repo scripts. They can also call `GET /v1/launch-evidence`, MCP `qc_get_launch_evidence`, or `uploadcheck launch-evidence --json` to get a redacted evidence bundle for handoff.

The Blueprint can request Render domains and disk settings, but DNS still has to point to the `qcgenie-*` Render hostnames before `/v1/readiness` can mark `customDomain` ready.

If a Render API key is available locally, the same launch shape can be audited or partially applied without opening the dashboard:

```bash
npm run --silent render:bootstrap-env > /tmp/uploadcheck-render-launch.env
# Fill /tmp/uploadcheck-render-launch.env with private values.
# The generated UPLOADCHECK_API_KEY bearer token is printed to stderr; store it privately for clients.
# Validate the file before sourcing it:
npm run render:validate-env-file -- /tmp/uploadcheck-render-launch.env
# Then load the completed local file:
set -a
source /tmp/uploadcheck-render-launch.env
set +a

npm run render:plan
npm run render:validate-env
npm run render:audit
npm run render:apply
npm run launch:doctor
npm run launch:handoff -- --text
npm run launch:dns
npm run launch:checkout
UPLOADCHECK_CHECKOUT_PROBE=1 npm run launch:checkout
npm run launch:storage
UPLOADCHECK_STORAGE_PROBE=1 npm run launch:storage
npm run media-ingress:verify
UPLOADCHECK_MEDIA_INGRESS_BASE_URL=https://qcgenie-api.onrender.com UPLOADCHECK_API_KEY=<private_bearer> npm run media-ingress:verify
npm run live-launch-doctor:verify
npm run live-launch-evidence:verify
npm run live-cost-basis:verify
npm run live-agent-manifest:verify
npm run live-pipeline-recipes:verify
npm run live-pipeline-handoff:verify
npm run live-npo-pipeline-handoff:verify
npm run live-openapi:verify
npm run launch:check
npm run readiness:check
```

`render:bootstrap-env` is the recommended launch handoff because it pre-fills a hashed API key and webhook encryption key while leaving Render, checkout, and optional object-storage values for the operator. `render:env-template` is still available when you need a placeholders-only file. The generated env template is safe to commit only while placeholders are intact. A filled copy contains Render, checkout, API, webhook, and optional storage secrets and must stay local.
`render:plan` reports `placeholderInputs` when a generated placeholder such as `<render_api_key>` or `https://...` is still present. Replace those values before running `render:apply`; the helper ignores placeholders instead of sending them to Render.
`render:validate-env-file -- /tmp/uploadcheck-render-launch.env` checks the filled local file before it is sourced. `render:validate-env` checks the currently loaded shell environment before apply: real Render API key, valid API-key hash or bootstrap key, HTTPS checkout URLs or Lemon Squeezy store/variant inputs, strong webhook encryption key, durable `/mnt/...` paths, and complete optional object-storage settings. `launch:checkout` and `/v1/readiness` also reject non-HTTPS direct checkout URLs so Product Hunt readiness cannot pass with an insecure payment link. `render:apply` refuses to run when validation fails.

After checkout env is configured, run `UPLOADCHECK_CHECKOUT_PROBE=1 npm run launch:checkout` in the same environment. The regular checkout helper validates env shape and HTTPS without network calls; probe mode performs redacted live HEAD/GET reachability checks for Creator, Studio, and Network checkout URLs. Output shows only host and redacted checkout URL shape, never direct checkout paths or Lemon Squeezy variant IDs.

`render:apply` adds the custom domains, sets the fixed durable env values, sets only the secret env values that are present in the local environment, and triggers web/API redeploys. It does not configure DNS; Cloudflare or the domain registrar still needs the CNAME records above.

After Render redeploys with `UPLOADCHECK_STORE_PATH` and `UPLOADCHECK_DURABLE_STORAGE_DIR`, run `UPLOADCHECK_STORAGE_PROBE=1 npm run launch:storage` in the same environment. The regular storage helper validates durable path shape and object-storage completeness without writing; probe mode writes and deletes tiny test files in the mounted store/upload directories so the launch decision does not rely on path names alone.

After the API redeploys with auth, run `npm run media-ingress:verify` locally and then run the hosted probe with the private client bearer token:

```bash
UPLOADCHECK_MEDIA_INGRESS_BASE_URL=https://qcgenie-api.onrender.com UPLOADCHECK_API_KEY=<private_bearer> npm run media-ingress:verify
```

The hosted media-ingress probe sends tiny inline video/audio payloads and a signed-upload audio payload, then verifies `mediaIngress`, source redaction, hashes, byte counts, and no temporary path leaks. Keep `<private_bearer>` out of commits and logs; it is the client token printed to stderr by `render:bootstrap-env`, not the SHA-256 hash stored on Render.

## Verification Commands

After DNS propagation:

```bash
npm run launch:doctor
npm run launch:handoff -- --text
npm run launch:dns
npm run launch:checkout
UPLOADCHECK_CHECKOUT_PROBE=1 npm run launch:checkout
npm run launch:storage
UPLOADCHECK_STORAGE_PROBE=1 npm run launch:storage
npm run media-ingress:verify
UPLOADCHECK_MEDIA_INGRESS_BASE_URL=https://qcgenie-api.onrender.com UPLOADCHECK_API_KEY=<private_bearer> npm run media-ingress:verify
npm run live-launch-doctor:verify
npm run live-launch-evidence:verify
npm run live-cost-basis:verify
npm run live-agent-manifest:verify
npm run live-pipeline-recipes:verify
npm run live-pipeline-handoff:verify
npm run live-openapi:verify
npm run live-public-artifacts:verify
npm run live-web-artifacts:verify
curl -i https://uploadcheck.app/
curl -i https://www.uploadcheck.app/
curl -i https://api.uploadcheck.app/healthz
curl -i https://qcgenie-api.onrender.com/v1/launch-status
curl -i https://uploadcheck.app/sitemap.xml
curl -i https://uploadcheck.app/llms.txt
```

Or run the combined verifier:

```bash
npm run launch:check
```

Expected API health response identifies the service as `uploadcheck`, even while the immutable Render host remains `https://qcgenie-api.onrender.com/healthz`.
