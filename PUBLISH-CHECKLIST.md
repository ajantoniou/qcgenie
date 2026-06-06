# UploadCheck — npm publish + redeploy checklist (prepared 2026-06-06)

Prepared by the agent. **Every step marked [YOU] is a founder/ops action — the agent does NOT run
`npm publish`, `npm login`, or the public redeploy.** Agent can do the [AGENT-OK] prep on request.

## State verified now
- `@uploadcheck/mcp` v0.1.0 — NOT on npm (E404). pack OK: 7 files, ~unpacked. bin `uploadcheck-mcp`.
- `@uploadcheck/cli` v0.1.0 — NOT on npm (E404). pack OK: 4 files, 29.5kB. bin `uploadcheck`.
- `npm whoami` → ENEEDAUTH (not logged in).
- Both `npm pack --dry-run` succeed — tarball contents are correct (no .env, no secrets in `files`).

## ⚠️ Blocker to fix BEFORE publish (scoped-package gotcha)
Both are scoped (`@uploadcheck/*`). By default scoped packages publish PRIVATE and `npm publish` will
FAIL (402) unless either (a) your npm org/account has a paid private plan, or (b) you publish public.
For a public CLI/MCP you almost certainly want PUBLIC. Add to BOTH package.json:
```json
"publishConfig": { "access": "public" }
```
[AGENT-OK] I can add that line to both package.json on your say-so (reversible, local).

## Pre-publish checklist
- [AGENT-OK] Add `publishConfig.access: public` to both package.json.
- [AGENT-OK] Confirm `files` whitelist excludes `.env`, test fixtures, fixtures with media. (Verified: current `files` arrays are clean.)
- [AGENT-OK] Add `repository`, `license`, `description`, `homepage` fields if missing (npm warns without them).
- [AGENT-OK] Verify `bin` shebangs (`#!/usr/bin/env node`) at top of both index.mjs so `npx` works.
- [AGENT-OK] Bump version if 0.1.0 was ever locally consumed (npm forbids re-publishing same version).
- [YOU] `npm login` (or set `NPM_TOKEN`) as the @uploadcheck org owner.
- [YOU] Confirm the `@uploadcheck` org/scope exists on npm and you can publish to it.

## Publish (YOU run these, in order)
```
cd "/Applications/DrAntoniou Projects/UploadCheck/cli"        && npm publish --access public
cd "/Applications/DrAntoniou Projects/UploadCheck/mcp-server" && npm publish --access public
```
- [YOU] Verify: `npx @uploadcheck/cli --help` and `npx @uploadcheck/mcp` resolve from a clean dir.

## Public artifact redeploy (YOU — separate from npm)
The hosted manifests must reflect the new "call UploadCheck first → fix flags → rerun" workflow.
- [YOU] Redeploy whatever serves `api.uploadcheck.app` (the `dist/` artifacts: agent-manifest.json,
  pipeline-recipes.json, npo-pipeline-handoff.json, llms.txt, install docs).
- [YOU] Verify live: the repo already ships verifier scripts — run them AFTER deploy:
  `node scripts/verify-live-public-artifacts.mjs`, `verify-live-agent-manifest.mjs`,
  `verify-live-pipeline-recipes.mjs`, `verify-live-npo-pipeline-handoff.mjs`.
  (These are [AGENT-OK] to RUN as read-only checks against the live URL once you've deployed.)

## Internal-only guard (confirm before publish)
- [AGENT-OK] Verify `qc_run_gemini_backtest` / `gemini-backtest.mjs` is NOT exposed as a public/sellable
  tool in the published manifest — it's internal capture-rate measurement only. It IS in the `files`
  list of both packages; decide whether it should ship at all to customers or be stripped from the
  public tarball. (Recommend: strip from public `@uploadcheck/cli` + `@uploadcheck/mcp` `files`, keep
  it server-side only.)
