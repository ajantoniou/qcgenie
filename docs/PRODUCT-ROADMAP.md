# UploadCheck.app Product Roadmap

Canonical naming:

- MCP server: `uploadcheck`
- CLI/package: `@uploadcheck/cli` or `@uploadcheck/mcp`
- Tagline: Quality check videos, podcasts, and clips before you upload.

## Cost Model And Pricing Verdict

Current offer under review: `$99 / month` for `5,000` metered minutes.

To hold `>95%` gross margin, fully loaded COGS must stay below `$4.95` per account per month, or `$0.00099` per metered minute.

Research inputs verified on 2026-06-05:

- Google Gemini counts video at about `263 tokens / second`, so one video minute is about `15,780` input tokens.
- Google Gemini counts audio at about `32 tokens / second`, so one audio minute is about `1,920` input tokens.
- Gemini 2.5 Flash-Lite standard pricing is `$0.10 / 1M` text/image/video input tokens, `$0.30 / 1M` audio input tokens, and `$0.40 / 1M` output tokens.
- Gemini 2.5 Flash standard pricing is `$0.30 / 1M` text/image/video input tokens, `$1.00 / 1M` audio input tokens, and `$2.50 / 1M` output tokens.
- OpenAI GPT-Realtime-Whisper is listed at `$0.017 / minute`; OpenAI GPT-Realtime-Translate is listed at `$0.034 / minute`.
- Render task compute starts at `$0.05 / hour` for starter tasks; persistent disks are listed at `$0.25 / GB-month`.

Derived unit economics:

| Mode | AI cost / media minute | 5,000 minute COGS | Gross margin at $99 |
| --- | ---: | ---: | ---: |
| Deterministic ffmpeg/Python only, task compute at 1x realtime | about `$0.00083` before platform overhead | about `$4.17` | about `95.8%` before bandwidth/storage |
| Gemini 2.5 Flash-Lite full video+audio input only | about `$0.00215` before output | about `$10.77` | about `89.1%` |
| Gemini 2.5 Flash full video+audio input only | about `$0.00665` before output | about `$33.27` | about `66.4%` |
| OpenAI GPT-Realtime-Whisper every minute | `$0.017` | `$85.00` | about `14.1%` |

Pricing verdict: `$99 / 5,000 minutes` is too generous if every minute receives full Omni/video or hosted transcription. It can work only if most minutes are deterministic-only and AI review is limited to flagged/sampled windows. Launch pricing should either cut included minutes to `1,000-2,000`, meter Omni separately, or define `5,000 deterministic scan minutes` plus a smaller AI-review allowance.

## Expert Panel Synthesis

- AI agent workflow experts: make `/check` a tiny, composable action that returns structured JSON an agent can cite, fix, or route.
- Claude Code / Codex experts: local projects need a global MCP server entry, stable JSON output, idempotency keys, and source-file-aware findings.
- Cursor / IDE experts: package a CLI that works from any repo and can pass local media to the hosted API without the IDE handling storage.
- MCP experts: keep the MCP server a thin authenticated wrapper; do not hide expensive or long-running side effects behind ambiguous tools.
- API experts: every job must expose lifecycle, artifacts, costs, and exact checks run.
- Plugin/skill experts: pair MCP with a short `UploadCheck` skill so agents know when to run deterministic checks and when to avoid expensive Omni.
- Omni/base-layer experts: use Omni/vision as escalation, not default metering; sample scene windows and deterministic defects first.
- Video QC experts: deterministic gates remain the verdict source; multimodal review explains and prioritizes defects.
- SaaS pricing experts: sell outcomes and reserve gross margin with hard cost caps, not unlimited “AI minutes.”
- Product Hunt launch experts: ship a crisp demo, public sample report, cost-safe beta limits, and proof that agents can catch real upload mistakes.
- NTO production-pipeline review: treat the internal NTO pipeline as a product spec for sticky creator QC. The product should replace the current persona-specific gates through UploadCheck calls while keeping implementation details private.

## 50-Point Plan Update

### P0 - Margin-Safe Engine

1. Keep deterministic ffmpeg/Python checks as the default path for every minute.
2. Cap full Omni/video review to sampled windows, flagged windows, and paid escalations.
3. Add a per-job `cost_estimate` object with deterministic compute, AI input, AI output, storage, and bandwidth fields.
4. Add an account-level cost guardrail that blocks or downgrades Omni when COGS exceeds the plan budget.
5. Add an `ai_review_budget_seconds` field per plan.
6. Add a `deterministic_minutes` vs `ai_review_seconds` usage split.
7. Add a “margin mode” default: deterministic scan all, Omni only suspicious windows.
8. Add a “deep review” paid add-on for full multimodal review.
9. Prefer Gemini 2.5 Flash-Lite or cheaper equivalent for advisory windows.
10. Avoid hosted transcription on all minutes; run transcription only when garble/caption checks require it.

### P0 - Programmatic Render Ingest

11. Accept inline base64 media payloads for short/medium agent uploads.
12. Support `data:` URLs for CLI/MCP convenience.
13. Write inline payloads to temp files only for the engine run.
14. Delete temp media immediately after job processing.
15. Add `UPLOADCHECK_INLINE_MEDIA_MAX_MB` to control memory risk.
16. Keep durable object storage out of the default agent path until needed.
17. Preserve signed URL and YouTube URL paths for larger assets.
18. Add future multipart upload support for large local files.
19. Add future direct-to-object-storage upload for production-scale files.
20. Add source hashes without storing raw media by default.

### P0 - Agent / MCP / CLI Surface

21. Install a global Codex MCP server entry named `uploadcheck`.
22. Keep MCP package identity as `@uploadcheck/mcp`.
23. Keep CLI package identity as `@uploadcheck/cli`.
24. Add MCP docs for local media, base64 media, signed URL, and YouTube URL flows.
25. Add a `/check` skill prompt for Claude Code, Codex, and Cursor.
26. Require idempotency keys for agent retries.
27. Return structured JSON with verdict, flags, artifacts, cost estimate, and next actions.
28. Add a local CLI command that encodes small files and sends them to Render.
29. Add a CLI path that requests signed upload for larger files.
30. Add examples for NPO/NTO production pipelines calling UploadCheck before upload.

### P0 - Product Proof

31. Create one public sample report for a clean upload.
32. Create one public sample report for a blocked upload.
33. Create one public sample report for a warning-only upload.
34. Show exact timecodes, evidence, and editor handoff in every sample.
35. Show the agent transcript: `/check`, results, fixable items, human-only items.
36. Add transparent “deterministic checks decide verdict” copy.
37. Add privacy copy: ephemeral processing by default, durable storage only when configured.
38. Add pricing copy that distinguishes scan minutes from deep AI review.
39. Add an ROI proof section: fewer re-uploads, fewer client revision loops, safer publishing.
40. Add Product Hunt-ready demo assets.

### P1 - Production Platform

41. Move synchronous job execution to a queue/worker.
42. Use Render task/workflow compute for bursty QC jobs.
43. Add Supabase-backed job and usage persistence.
44. Add object storage only for artifacts, preview clips, and opted-in retained source media.
45. Add per-workspace API keys with hashed storage and scopes.
46. Add webhook retries and signed delivery headers under UploadCheck naming while retaining legacy compatibility.
47. Add observability for job duration, model usage, compute time, and failure reasons.
48. Add billing enforcement for included minutes and AI-review add-ons.
49. Add abuse limits for file size, duration, concurrent jobs, and repeated retries.
50. Run a Product Hunt launch checklist only after cost telemetry proves the plan can hold margin.

## NTO Pipeline Replacement Addendum

Source evidence reviewed:

- `/Applications/DrAntoniou Projects/AgentCompanies/companies/NTO/PRODUCTION-PIPELINE-v3.md`
- `/Applications/DrAntoniou Projects/AgentCompanies/companies/NTO/personas/qc-engineer.md`
- `/Applications/DrAntoniou Projects/AgentCompanies/companies/NTO/personas/council/20-video-qc-watcher.md`
- `/Applications/DrAntoniou Projects/AgentCompanies/companies/NTO/personas/qc-snippets/visual-qc-learning-locks.md`

Product interpretation: UploadCheck should become the callable QC surface that replaces NTO's current production QC personas and scripts. We should not publicly disclose every private gate or implementation detail; public copy can say "readability, visual match, audio integrity, layout, repetition, and publish-readiness checks" while the private engine keeps the exact gate list and thresholds.

NTO-derived private QC tasks to add to the product:

1. `text_contrast`: detect low-contrast overlay text against moving footage/backgrounds. Implemented first as deterministic OCR + luminance contrast.
2. `text_safe_area`: reject words crossing Shorts action chrome, lower UI overlays, or long-form title-safe margins. Implemented in the default gate and reused by `shorts_format`.
3. `text_crop_jitter`: reject cropped, overlapping, jittering, or edge-to-edge text cards.
4. `shorts_format`: verify exact 1080x1920, full-bleed 9:16, no gutters, no unintended dialogue, correct duration. Implemented as an opt-in specialized gate.
5. `canvas_fill`: verify long-form 16:9 fills the canvas and blocks pillarbox/letterbox misuse. Implemented in the default gate.
6. `audio_script_faithfulness`: compare transcript against locked script/expected narration with WER thresholds.
7. `pronunciation_watchlist`: flag customer-provided banned words, names, and terms that commonly misrender.
8. `spoken_leaks`: detect stage directions, URLs, vendor names, prompt text, or production notes spoken aloud.
9. `dead_air`: block unintended silence longer than customer threshold.
10. `visual_narration_match`: verify every 30-second window visually supports the narration, not just the mood.
11. `named_entity_visual_match`: if narration names a person/place/event/product, visual should show that thing or a deliberate neutral substitute.
12. `repeat_fatigue`: block exact clip reuse and source-family dominance windows.
13. `static_head_dominance`: block long held talking-head/portrait shots without b-roll, graphic, or motion.
14. `slow_hanging_motion`: block clips slowed so much they read as frozen, buffering, or still-image drift.
15. `cheap_filler`: block old/degraded/B&W/silent-film/low-res filler unless explicitly requested.
16. `first_three_seconds`: flag generic openers, missing hook frame, or title/thumb mismatch.
17. `rehook_cadence`: flag long-form stretches without pattern interruption.
18. `end_screen_tease`: flag missing next-video, CTA, or episode handoff.
19. `thumbnail_text_readability`: apply text contrast/safe-area rules to thumbnail candidates.
20. `repair_loop`: after report generation, agent/MCP should show all QC flags and ask the user whether to fix now. Fixable items should be routed to the LLM or local project files; render-source defects should be described with timestamped patch instructions.

Private moat note: competitors can copy the public idea of upload QC, but our sticky layer is the accumulated private failure catalog, thresholds, fixtures, and agent repair loops learned from real NTO production. Publish the outcomes and broad categories, not the full validator internals.

## Execution Status

- Done: real QC engine exists under `scripts/qc-engine/`.
- Done: hosted store can run `run_gate.py` for resolvable sources.
- Done: MCP server identity is `uploadcheck`.
- Done: canonical package names are documented.
- Done: inline media payload support added for low-storage Render execution.
- Done: cost estimate output added to API job responses and reports.
- Done: local CLI implementation added under `cli/` for `@uploadcheck/cli`.
- Done: signed-upload CLI flow added for local files larger than the inline payload limit.
- Done: pipeline integration docs added for Codex, NTO, and NPO style workflows.
- Done: NTO pipeline reviewed for QC productization tasks.
- Done: first NTO-derived text contrast gate added to `scripts/qc-engine/check_text_contrast.py` and included in `run_gate.py`.
- Done: NTO-derived `canvas_fill`, `text_safe_area`, and `shorts_format` deterministic gates added to `scripts/qc-engine/`.
- Done: global Codex MCP entry is installed locally through the `uploadcheck` server and was smoke-tested with a live hosted report.
- Done: authenticated hosted inline-media execution is verified on Render with a blocking `twins` report.
- Partial: launch pricing is updated to `Creator $99 / 1,200 minutes`, `Studio $299 / 5,000 minutes`, and `Network $799 / 18,000 minutes`; final pricing still needs live cost telemetry.
- Next: add durable object storage or direct-to-bucket upload for production-scale retention beyond Render temp storage.
- Next: cut over `uploadcheck.app` DNS/custom domains and decide whether to keep legacy Render slugs or recreate services for `uploadcheck-*` subdomains.
- Partial: Product Hunt launch page and public report examples exist; final launch still needs custom-domain cutover, checkout/billing proof, and a polished public demo clip.
