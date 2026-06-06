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
- Checkout prompts: direct `UPLOADCHECK_CREATOR_CHECKOUT_URL`, `UPLOADCHECK_STUDIO_CHECKOUT_URL`, `UPLOADCHECK_NETWORK_CHECKOUT_URL`, or Lemon Squeezy `UPLOADCHECK_LEMONSQUEEZY_STORE_SLUG` plus `UPLOADCHECK_<PLAN>_VARIANT_ID`
- Webhook encryption prompt: `UPLOADCHECK_SECRET_ENCRYPTION_KEY`

Before Product Hunt launch, sync the Blueprint or manually apply the same values in Render, then run:

```bash
npm run launch:doctor
npm run launch:dns
npm run launch:checkout
npm run launch:storage
UPLOADCHECK_STORAGE_PROBE=1 npm run launch:storage
npm run render:verify
npm run launch:check
npm run readiness:check
```

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
npm run launch:dns
npm run launch:checkout
npm run launch:storage
UPLOADCHECK_STORAGE_PROBE=1 npm run launch:storage
npm run launch:check
npm run readiness:check
```

`render:bootstrap-env` is the recommended launch handoff because it pre-fills a hashed API key and webhook encryption key while leaving Render, checkout, and optional object-storage values for the operator. `render:env-template` is still available when you need a placeholders-only file. The generated env template is safe to commit only while placeholders are intact. A filled copy contains Render, checkout, API, webhook, and optional storage secrets and must stay local.
`render:plan` reports `placeholderInputs` when a generated placeholder such as `<render_api_key>` or `https://...` is still present. Replace those values before running `render:apply`; the helper ignores placeholders instead of sending them to Render.
`render:validate-env-file -- /tmp/uploadcheck-render-launch.env` checks the filled local file before it is sourced. `render:validate-env` checks the currently loaded shell environment before apply: real Render API key, valid API-key hash or bootstrap key, HTTPS checkout URLs or Lemon Squeezy store/variant inputs, strong webhook encryption key, durable `/mnt/...` paths, and complete optional object-storage settings. `render:apply` refuses to run when validation fails.

`render:apply` adds the custom domains, sets the fixed durable env values, sets only the secret env values that are present in the local environment, and triggers web/API redeploys. It does not configure DNS; Cloudflare or the domain registrar still needs the CNAME records above.

After Render redeploys with `UPLOADCHECK_STORE_PATH` and `UPLOADCHECK_DURABLE_STORAGE_DIR`, run `UPLOADCHECK_STORAGE_PROBE=1 npm run launch:storage` in the same environment. The regular storage helper validates durable path shape and object-storage completeness without writing; probe mode writes and deletes tiny test files in the mounted store/upload directories so the launch decision does not rely on path names alone.

## Verification Commands

After DNS propagation:

```bash
npm run launch:doctor
npm run launch:dns
npm run launch:checkout
npm run launch:storage
UPLOADCHECK_STORAGE_PROBE=1 npm run launch:storage
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

Expected API health response after the next backend deploy should identify the service as `uploadcheck`. The currently deployed legacy API still responds with `service: "qcgenie"` on `https://qcgenie-api.onrender.com/healthz`.
