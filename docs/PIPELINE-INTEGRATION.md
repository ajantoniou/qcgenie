# UploadCheck Pipeline Integration

Tagline: Quality check videos, podcasts, and clips before you upload.

Canonical surfaces:

- MCP server: `uploadcheck`
- CLI/package: `@uploadcheck/cli`
- MCP package: `@uploadcheck/mcp`
- API base: `https://qcgenie-api.onrender.com` while the UploadCheck custom-domain cutover is pending.

## Codex MCP Install

The local Codex config should point at the repository MCP server:

```toml
[mcp_servers.uploadcheck]
command = "node"
args = ["/Applications/DrAntoniou Projects/QCGenie/mcp-server/index.mjs"]

[mcp_servers.uploadcheck.env]
UPLOADCHECK_API_BASE_URL = "https://qcgenie-api.onrender.com"
UPLOADCHECK_API_KEY = "<workspace_api_key>"
```

The server exposes `qc_get_launch_status`, `qc_estimate_cost`, `qc_run_video`, `qc_run_local_file`, `qc_get_job`, `qc_get_report`, `qc_get_events`, `qc_get_artifacts`, `qc_get_marker_csv`, `qc_submit_gate_verdict`, `qc_list_recent_jobs`, `qc_get_margin_telemetry`, and `qc_create_upload_url`.

The local Codex skill is installed at `/Users/drantoniou/.codex/skills/uploadcheck`. Use `$uploadcheck` when a project needs the standard preflight -> hosted QC -> report -> repair-loop workflow.

Machine-readable pipeline profiles are published at `https://qcgenie-api.onrender.com/pipeline-recipes.json` for agents that need defaults without scraping prose. The current profiles are `nto_long_form`, `nto_shorts`, `npo_podcast_or_audio`, and `generic_creator_video`. The recipe file includes `launch_preflight`, `cost_preflight`, profile-specific `qc_run_local_file` arguments, and repair-loop instructions.

Before launch-sensitive production workflows, agents can call MCP `qc_get_launch_status` or CLI `uploadcheck launch-status --json` to verify the live go/no-go state and remaining external blockers.

To verify that Codex can still call UploadCheck globally from any project, run:

```bash
npm run codex:verify-install
```

That command checks `[mcp_servers.uploadcheck]`, the hosted API base URL, the executable MCP wrapper, and the installed UploadCheck skill markers.

Before publishing package updates or installing from a packed artifact, run:

```bash
npm run packages:verify
```

That command checks the public package names, CLI/MCP bins, MCP lock metadata, and `npm pack --dry-run` file lists for `@uploadcheck/cli` and `@uploadcheck/mcp`.

## CLI Usage

Estimate a run before uploading or sending media:

```bash
UPLOADCHECK_API_KEY="<workspace_api_key>" \
node "/Applications/DrAntoniou Projects/QCGenie/cli/index.mjs" estimate \
  --minutes 42 \
  --checks canvas_fill,loop_freeze,twins \
  --plan creator \
  --cost-guardrail downgrade \
  --json
```

Run a local video through the hosted API as an ephemeral inline payload:

```bash
UPLOADCHECK_API_KEY="<workspace_api_key>" \
node "/Applications/DrAntoniou Projects/QCGenie/cli/index.mjs" check "/path/to/final-cut.mp4" --json
```

Run a podcast/audio file:

```bash
UPLOADCHECK_API_KEY="<workspace_api_key>" \
node "/Applications/DrAntoniou Projects/QCGenie/cli/index.mjs" check "/path/to/episode.wav" --checks garble --json
```

Run a rendered video with a storybook/edit manifest so UploadCheck can catch exact visual reuse and source-family dominance:

```bash
UPLOADCHECK_API_KEY="<workspace_api_key>" \
node "/Applications/DrAntoniou Projects/QCGenie/cli/index.mjs" check "/path/to/master.mp4" \
  --checks repeat_fatigue \
  --manifest "/path/to/storybook.json" \
  --json
```

Run a transcript-side production-leak check without paying for ASR/model review:

```bash
UPLOADCHECK_API_KEY="<workspace_api_key>" \
node "/Applications/DrAntoniou Projects/QCGenie/cli/index.mjs" check "/path/to/master.mp4" \
  --checks spoken_leaks \
  --transcript "/path/to/transcript.txt" \
  --json
```

Run a customer-specific pronunciation/watchlist check:

```bash
UPLOADCHECK_API_KEY="<workspace_api_key>" \
node "/Applications/DrAntoniou Projects/QCGenie/cli/index.mjs" check "/path/to/master.mp4" \
  --checks pronunciation_watchlist \
  --transcript "/path/to/transcript.txt" \
  --watchlist "/path/to/watchlist.json" \
  --json
```

Run a locked-script faithfulness check without full video/audio model review:

```bash
UPLOADCHECK_API_KEY="<workspace_api_key>" \
node "/Applications/DrAntoniou Projects/QCGenie/cli/index.mjs" check "/path/to/master.mp4" \
  --checks script_faithfulness \
  --transcript "/path/to/final-transcript.txt" \
  --expected-script "/path/to/locked-script.txt" \
  --json
```

Run a YouTube URL or signed asset URL:

```bash
UPLOADCHECK_API_KEY="<workspace_api_key>" \
node "/Applications/DrAntoniou Projects/QCGenie/cli/index.mjs" check "https://youtu.be/example" --idempotency-key "nto-ep1-final"
```

The CLI inlines files up to `UPLOADCHECK_INLINE_MEDIA_MAX_MB` or `--max-inline-mb` and sends them to `POST /v1/qc/jobs`. Larger assets automatically use the signed upload API unless `--upload-mode inline` is specified.

Force the signed-upload path:

```bash
UPLOADCHECK_API_KEY="<workspace_api_key>" \
node "/Applications/DrAntoniou Projects/QCGenie/cli/index.mjs" check "/path/to/master.mp4" \
  --upload-mode signed \
  --checks canvas_fill,text_safe_area,loop_freeze \
  --json
```

Signed-upload flow:

1. `POST /v1/uploads` creates a tokenized `signedPutUrl`.
2. The CLI `PUT`s the file bytes to `/v1/uploads/{upload_id}/content?token=...`.
3. Render writes the upload to local staging for the immediate ffmpeg/QC run. If complete S3/R2-compatible env is configured, Render also mirrors the file to object storage and records `storageMode=object_storage`, `objectKey`, and `objectUrl`.
4. The CLI creates a job with `upload_id`.
5. Render reads the staged file locally, runs the deterministic gate, and records the report.

## NTO/NPO Pipeline Pattern

For NTO long-form episodes, shorts, or NPO media exports:

1. Render the final candidate to a local file.
2. Call `qc_estimate_cost` or `uploadcheck estimate --minutes N` with the intended checks and plan so the agent knows whether model-backed checks will run, be downgraded, or need a paid deep-review path.
3. Call `uploadcheck check <file>` or MCP `qc_run_local_file` with `file_path`. Small files inline through Render; larger files use signed upload automatically. Lower-level MCP callers can still use `media_base64` for small files or `qc_create_upload_url` + `qc_run_video` with `upload_id` for large files. When a storybook/edit manifest exists, pass `manifest_path`, `manifest_json`, or CLI `--manifest` so `repeat_fatigue` can catch reuse before and after render, `speaker_visual_binding` can catch the wrong character face under a named speaker, `static_head_dominance` can catch long held portrait/talking-head shots without relief, `literal_subject_match` can catch named VO subjects paired with generic mood footage, `first_three_seconds` can catch generic or missing opening hooks, `opening_footer_text_presence` can catch missing Shorts hook/footer cards before OCR spend, `text_crop_jitter` can catch cropped/overlapping/jittering text-card metadata before export, `end_screen_tease` can catch missing final CTAs/handoffs, `rehook_cadence` can catch long-form stretches without pattern interrupts, and `contact_sheet_evidence` can verify repaired complaint windows have before/after proof. When a transcript or script-sidecar exists, pass `transcript_path`, `transcript_text`, `transcript_json`, or CLI `--transcript` so `spoken_leaks` can catch prompt/stage/vendor leakage, `sentence_boundary` can catch mid-sentence clip endings without ASR spend, and `dialogue_in_music_short` can block music-only Shorts that accidentally contain spoken dialogue when the pipeline already has transcript text. Add `watchlist_path`, `watchlist_json`, or CLI `--watchlist` to catch customer-specific pronunciation and wrong-name substitutions. Add `expected_script_path`, `expected_script_text`, `expected_script_json`, or CLI `--expected-script` when a locked script exists so `script_faithfulness` can catch narration drift using WER.
4. Poll `qc_get_job` until `status=completed`.
5. Fetch `qc_get_report` and `qc_get_marker_csv`.
6. Treat `BLOCK` as stop-ship, `WATCH` as source review, and `PASS` as ready only after the project-specific editorial checklist is also complete.

Agent projects can load `public/pipeline-recipes.json` and map the selected profile's `mcp_call.arguments` directly into `qc_run_local_file`. The file is intentionally explicit about sidecar fields so NTO/NPO pipelines can pass manifests, transcripts, watchlists, and locked scripts without each project re-learning the UploadCheck payload shape.
The same recipe file also exposes `repair_loop_contract` for callers that need structured instructions instead of prose: required report/marker fetches, severity grouping, the "Fix now?" prompt, fixable scopes, source/render-only scopes, and the rerun-before-upload-ready rule.

The hosted API writes inline media to temporary server storage, runs the deterministic gate, parses the gate verdict, stores the report, and deletes the temporary media file after the request finishes. Job responses include sanitized `mediaIngress` metadata such as `mode=inline_ephemeral`, content type, byte count, and `sha256` source hash so agents can verify the low-storage path and checked bytes without seeing temporary server paths. Signed-upload media uses local staging for the immediate run; durable filesystem or object storage retention is only used when configured.

Plain CLI summaries show a shortened `sha256` prefix for scan logs; use `--json` when a pipeline needs the full 64-character source hash.

For NTO specifically, UploadCheck is the replacement target for the current production QC personas and scripts. The product should eventually cover the NTO gates for audio garble, script faithfulness, pronunciation watchlists, visual-to-narration match, literal named-subject match, canvas/aspect errors, Shorts safe area, low-contrast overlay text, repeat fatigue, source-family dominance, cheap filler, dead air, first-three-second hook quality, re-hook cadence, and repair-loop instructions. The current engine already includes `canvas_fill`, `contact_sheet_evidence`, `dead_air`, `dialogue_in_music_short`, `end_screen_tease`, `first_three_seconds`, `literal_subject_match`, `opening_footer_text_presence`, `rehook_cadence`, `repeat_fatigue`, `script_faithfulness`, `sentence_boundary`, `speaker_visual_binding`, `static_head_dominance`, `spoken_leaks`, `text_contrast`, `text_crop_jitter`, `text_safe_area`, and opt-in `shorts_format`.

Agent repair loop:

1. Call `qc_run_local_file`, `qc_run_video`, or `uploadcheck check`.
2. Fetch `qc_get_report`.
3. Show all flags grouped by `BLOCK`, `WATCH`, and fixability.
4. Ask the user whether to fix now.
5. Apply fixes only where the agent has reachable source files or captions. For render/source defects, return timestamped patch instructions and rerun UploadCheck after the user or renderer updates the asset.

## Cost Guard

Job responses include `costEstimate`. The current roadmap verdict is that `$99 / 5000 minutes` is not margin-safe for every creator account if every minute receives full multimodal AI review. It is viable only when deterministic scan minutes are the billable baseline and expensive model calls are sampled or reserved for flagged regions.

Cost guardrail controls:

- Default behavior is `cost_guardrail: "downgrade"`: if a caller declares `ai_review_seconds` that would break the >95% gross-margin budget for the selected plan, UploadCheck records the requested amount but downgrades the job to deterministic checks.
- Model-backed checks such as `twins`, `cheap_broll`, `garble`, `narration_match`, and `omni_watch` are also counted in the guardrail. If the caller omits `checks`, UploadCheck treats the engine default as requested, then removes model-backed checks in `downgrade` mode when the plan budget cannot support them.
- Use `cost_guardrail: "block"` to reject margin-breaking AI-review requests with `402 cost_guardrail_blocked`.
- Use `cost_guardrail: "off"` only for internal experiments or paid deep-review add-ons.
- Pass `plan_id: "creator" | "studio" | "network" | "stress_99_5000"` or custom `plan_price_cents` and `included_minutes` so the cost estimate matches the customer contract.
- Call `qc_get_margin_telemetry`, `uploadcheck usage --billing-period YYYY-MM`, or `GET /v1/usage/margins` after live jobs to compare actual metered minutes, estimated COGS, allocated revenue, cost per minute, and gross margin against the Product Hunt launch threshold.
- Run `npm run cost-basis:verify` before pricing or Product Hunt copy changes; it recomputes `/cost-basis.json` from `cost-model.mjs` and preserves the `$99 / 5,000` stress-plan verdict.

CLI example:

```bash
UPLOADCHECK_API_KEY="<workspace_api_key>" \
node "/Applications/DrAntoniou Projects/QCGenie/cli/index.mjs" check "/path/to/master.mp4" \
  --checks canvas_fill,loop_freeze,text_contrast \
  --plan creator \
  --ai-review-seconds 120 \
  --cost-guardrail downgrade \
  --json
```
