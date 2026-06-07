# UploadCheck — npm publish + redeploy checklist (prepared 2026-06-06)

Prepared by the agent. **Every step marked [YOU] is a founder/ops action — the agent does NOT run
`npm publish`, `npm login`, or the public redeploy.** Agent can do the [AGENT-OK] prep on request.

## State verified now
- `@drantoniou/uploadcheck-mcp` v0.1.0 — published on npm. pack OK: 7 files. bin `uploadcheck-mcp`.
- `@drantoniou/uploadcheck` v0.1.0 — published on npm. pack OK: 4 files. bin `uploadcheck`.
- `npm whoami` → `drantoniou`.
- Both `npm pack --dry-run` succeed — tarball contents are correct (no .env, no secrets in `files`).
- `npm run npm-publish:preflight` is the registry/auth proof check. It reports both current versions published with tarball integrity, so registry install proof is captured.

## Scoped-package publish mode
Both packages now set `"publishConfig": { "access": "public" }`, so `npm publish` uses the intended public scoped-package mode.

## Pre-publish checklist
- [DONE] Add `publishConfig.access: public` to both package.json.
- [DONE] Confirm `files` whitelist excludes `.env`, test fixtures, fixtures with media. Current public package files intentionally exclude internal Gemini backtest files.
- [DONE] Add `repository`, `license`, `description`, `homepage` fields if missing (npm warns without them). `npm run packages:verify` now enforces the UploadCheck repository metadata.
- [DONE] Verify `bin` shebangs (`#!/usr/bin/env node`) at top of both index.mjs so `npx` works. `npm run packages:verify` now enforces shebangs and executable bin modes.
- [DONE] Add read-only npm registry/auth preflight. `npm run npm-publish:preflight` checks `npm view` for both exact versions and `npm whoami` without attempting to publish.
- [AGENT-OK] Bump version if 0.1.0 was ever locally consumed (npm forbids re-publishing same version).
- [DONE] `NPM_TOKEN` with bypass 2FA was set locally in ignored `.env` for the initial publish.
- [DONE] Npm rejected unscoped `uploadcheck` as too similar to `upload_check`; package identity moved to the account scope npm suggested.

## Publish (done)
```
cd "/Applications/DrAntoniou Projects/UploadCheck/cli"        && npm publish --access public
cd "/Applications/DrAntoniou Projects/UploadCheck/mcp-server" && npm publish --access public
```
- [DONE] Published `@drantoniou/uploadcheck@0.1.0` and `@drantoniou/uploadcheck-mcp@0.1.0`.
- [DONE] Verify registry install after publish:
  `npm run packages:install-smoke` for local tarballs, then `npm view @drantoniou/uploadcheck@latest version dist.tarball dist.integrity --json`, `npm view @drantoniou/uploadcheck-mcp@latest version dist.tarball dist.integrity --json`, and a clean `npx uploadcheck cost-basis --json`.

## Public artifact redeploy (YOU — separate from npm)
The hosted manifests must reflect the new "call UploadCheck first -> fix flags -> rerun" workflow and the current public npm MCP gates.
- [YOU] Redeploy whatever serves `api.uploadcheck.app` (the `dist/` artifacts: agent-manifest.json,
  launch-status.json, product-hunt-launch-kit.json, mcp-install.json, pipeline-recipes.json,
  npo-pipeline-handoff.json, llms.txt, install docs, and launch doctor/evidence endpoints).
- [YOU] Verify live: the repo already ships verifier scripts — run them AFTER deploy:
  `npm run live-launch-doctor:verify`, `npm run live-launch-evidence:verify`,
  `npm run live-mcp-install:verify`, `npm run live-public-artifacts:verify`, `npm run live-agent-manifest:verify`,
  `npm run live-pipeline-recipes:verify`, `npm run live-npo-pipeline-handoff:verify`.
  These now fail if hosted launch doctor/evidence omit `saas-basics:verify`,
  `mcp-install:verify`, `private-mcp-beta:verify`, `private-mcp-beta:evidence`, or `anthropic-directory:verify`, or if
  hosted `/mcp-install.json` is missing.
  (These are [AGENT-OK] to RUN as read-only checks against the live URL once you've deployed.)

## Internal-only guard
- [DONE] `qc_run_gemini_backtest` / `gemini-backtest.mjs` is stripped from public `@drantoniou/uploadcheck` and `@drantoniou/uploadcheck-mcp` package files and public MCP tools. Internal capture-rate measurement stays repo-only through `scripts/qc-engine/gemini_watch.py`.

## 🐞 BUG FOUND (twins false-positive) — log for product
- The `twins` check (`local_crowd_archetype_cluster` method) returns BLOCK with `duplicate_count:7`
  on a PURE TEXT CARD (zero human faces). It clusters text glyphs / flat-background patches as
  "facial archetype chips."
- Repro: run twins on any Remotion/text-card clip → false BLOCK.
- Fix: gate should detect "no detectable faces in frame" and SKIP/PASS the twins check for that
  frame, OR require an actual face-detector hit before archetype-clustering. The MANDATORY_NO_SKIP
  firewall shouldn't fire on faceless frames.
- Impact: any NTO beat we replace with a text card will false-fail twins until this is fixed.
  Workaround for now: human-eye confirms text cards are twin-free (no faces == no twins).
