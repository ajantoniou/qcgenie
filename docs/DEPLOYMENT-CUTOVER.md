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
- Checkout URL prompts: `UPLOADCHECK_CREATOR_CHECKOUT_URL`, `UPLOADCHECK_STUDIO_CHECKOUT_URL`, `UPLOADCHECK_NETWORK_CHECKOUT_URL`
- Webhook encryption prompt: `UPLOADCHECK_SECRET_ENCRYPTION_KEY`

Before Product Hunt launch, sync the Blueprint or manually apply the same values in Render, then run:

```bash
npm run render:verify
npm run readiness:check
```

The Blueprint can request Render domains and disk settings, but DNS still has to point to the `qcgenie-*` Render hostnames before `/v1/readiness` can mark `customDomain` ready.

## Verification Commands

After DNS propagation:

```bash
curl -i https://uploadcheck.app/
curl -i https://www.uploadcheck.app/
curl -i https://api.uploadcheck.app/healthz
curl -i https://uploadcheck.app/sitemap.xml
curl -i https://uploadcheck.app/llms.txt
```

Expected API health response after the next backend deploy should identify the service as `uploadcheck`. The currently deployed legacy API still responds with `service: "qcgenie"` on `https://qcgenie-api.onrender.com/healthz`.
