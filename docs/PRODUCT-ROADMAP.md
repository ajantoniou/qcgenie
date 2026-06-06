# UploadCheck.app Product Roadmap

Canonical naming:

- MCP server: `uploadcheck`
- CLI/package: `@uploadcheck/cli` or `@uploadcheck/mcp`
- Tagline: Quality check videos, podcasts, and clips before you upload.

## Cost Model And Pricing Verdict

Current offer under review: `$99 / month` for `5,000` metered minutes.

To hold `>95%` gross margin, fully loaded COGS must stay below `$4.95` per account per month, or `$0.00099` per metered minute.

Research inputs verified on 2026-06-06:

- Google Gemini counts video at about `263 tokens / second`, so one video minute is about `15,780` input tokens. Source: `https://ai.google.dev/gemini-api/docs/tokens`.
- Google Gemini counts audio at about `32 tokens / second`, so one audio minute is about `1,920` input tokens. Source: `https://ai.google.dev/gemini-api/docs/tokens`.
- Gemini 2.5 Flash-Lite standard pricing is `$0.10 / 1M` text/image/video input tokens, `$0.30 / 1M` audio input tokens, and `$0.40 / 1M` output tokens. Source: `https://ai.google.dev/gemini-api/docs/pricing`.
- Gemini 2.5 Flash standard pricing is `$0.15 / 1M` text/image/video input tokens, `$0.50 / 1M` audio input tokens, and `$2.50 / 1M` output tokens; Batch/Flex input rows are half the standard input price. Source: `https://ai.google.dev/gemini-api/docs/pricing`.
- Gemini 3.1 Flash-Lite Batch/Flex is a useful queued-review candidate, but current 2.5 Flash-Lite remains the cheaper default full video+audio input baseline for this use case.
- OpenAI lists `gpt-4o-mini-transcribe` at `$0.003 / minute`, `gpt-4o-transcribe` at `$0.006 / minute`, GPT-Realtime-Whisper at `$0.017 / minute`, and GPT-Realtime-Translate at `$0.034 / minute`. Source: `https://platform.openai.com/docs/pricing`.
- Anthropic Claude Sonnet 4.5 / 4.6 is `$3 / 1M` input tokens and `$15 / 1M` output tokens; prompt cache reads are `$0.30 / 1M`. Source: `https://platform.claude.com/docs/en/about-claude/pricing`.
- ElevenLabs Scribe is `$0.22 / hour` for speech-to-text. Source: `https://elevenlabs.io/pricing/api?price.section=speech_to_text`.
- Qwen Cloud lists `qwen3.5-omni-flash` at `$0.4 / 1M` text/image/video input tokens, `$2.2 / 1M` text output tokens, `$3 / 1M` audio input tokens, and `$11.9 / 1M` text+audio output tokens. Source: `https://www.qwencloud.com/models/qwen3.5-omni-flash`.
- Render task compute starts at `$0.05 / hour` for starter tasks. Source: `https://render.com/docs/workflows-limits`.

Derived unit economics:

| Mode | AI cost / media minute | 5,000 minute COGS | Gross margin at $99 |
| --- | ---: | ---: | ---: |
| Deterministic ffmpeg/Python only, task compute at 1x realtime | about `$0.00083` before platform overhead | about `$4.17` | about `95.8%` before bandwidth/storage |
| Gemini 2.5 Flash-Lite full video+audio input only | about `$0.00215` before output | about `$10.77` | about `89.1%` |
| Gemini 2.5 Flash full video+audio input only | about `$0.00333` before output | about `$16.64` | about `83.2%` |
| Gemini 2.5 Flash Batch/Flex full video+audio input only | about `$0.00166` before output | about `$8.32` | about `91.6%` |
| Qwen3.5-Omni-Flash full video+audio input only | about `$0.01207` before output | about `$60.36` | about `39.0%` |
| OpenAI gpt-4o-mini-transcribe every minute | `$0.003` | `$15.00` | about `84.8%` |
| OpenAI gpt-4o-transcribe every minute | `$0.006` | `$30.00` | about `69.7%` |
| OpenAI GPT-Realtime-Whisper every minute | `$0.017` | `$85.00` | about `14.1%` |

Pricing verdict: `$99 / 5,000 minutes` is too generous if it implies unlimited full-video AI review. Customer pricing should sell deterministic publish-readiness QC minutes, not AI review minutes. At `0.0833` COGS cents/minute for deterministic scanning, launch pricing can safely double the included minutes to `Creator $99 / 2,400`, `Studio $299 / 10,000`, and `Network $799 / 36,000` while staying above the 95% gross-margin target. Full-model review stays internal for backtesting, roadmap generation, and deterministic capture-rate measurement.

Cost-per-minute target: at `$99 / 2,400`, the deterministic-only full-allowance COGS is about `$1.9992`, or about `97.98%` gross margin. At `$299 / 10,000`, deterministic full-allowance COGS is about `$8.33`, or about `97.21%` gross margin. At `$799 / 36,000`, deterministic full-allowance COGS is about `$29.988`, or about `96.25%` gross margin. Full Gemini/Qwen/hosted transcription still stays out of the customer meter and is used internally for backtesting, roadmap generation, and deterministic capture-rate measurement.

Speech-cost update: current OpenAI `gpt-4o-mini-transcribe` is a lower-cost fallback than realtime Whisper and slightly below ElevenLabs Scribe, but it still costs about `0.3` cents/minute. Running it across all `5,000` included stress-plan minutes would cost about `$15` before deterministic compute, so it remains a paid/sampled-window path, not a default included-minute path.

Observed-cost telemetry now prices real provider usage separately from preflight estimates. Example: the June 6 clone-crowd smoke test used `1,637` Anthropic input tokens and `108` output tokens, which prices at about `$0.0065` for that single vision call before Render compute. That is useful for flagged-window review, but it is not compatible with running many Sonnet frame calls on every included minute at `$99 / 5,000`.

Preflight model-backed check pricing is now calibrated from that observed cost: each model-backed call reserves `0.75` cents of COGS, slightly above the observed `twins` Sonnet frame-call cost. This intentionally downgrades `twins`, `cheap_broll`, `garble`, `narration_match`, and `omni_watch` unless the selected plan/add-on can still hold the 95% margin budget.

## Expert Panel Synthesis

- AI agent workflow experts: make `/check` a tiny, composable action that returns structured JSON an agent can cite, fix, or route.
- Claude Code / Codex experts: local projects need a global MCP server entry, stable JSON output, idempotency keys, and source-file-aware findings.
- Cursor / IDE experts: package a CLI that works from any repo and can pass local media to the hosted API without the IDE handling storage.
- MCP experts: keep the MCP server a thin authenticated wrapper; do not hide expensive or long-running side effects behind ambiguous tools.
- API experts: every job must expose lifecycle, artifacts, costs, and exact checks run.
- Plugin/skill experts: pair MCP with a short `UploadCheck` skill so agents know when to run deterministic checks and when to avoid expensive Omni.
- Omni/base-layer experts: use Qwen/Omni as a private escalation layer on selected windows, not default metering; at about `1.2072` COGS cents per full input minute before output, full Omni review is incompatible with `$99 / 5,000`.
- Video QC experts: deterministic gates remain the verdict source; multimodal review explains and prioritizes defects.
- SaaS pricing experts: sell outcomes and reserve gross margin with hard cost caps, not unlimited “AI minutes.”
- Product Hunt launch experts: ship a crisp demo, public sample report, cost-safe beta limits, and proof that agents can catch real upload mistakes.
- NTO production-pipeline review: treat the internal NTO pipeline as a product spec for sticky creator QC. The product should replace the current persona-specific gates through UploadCheck calls while keeping implementation details private.

## 50-Point Plan Update

### P0 - Margin-Safe Engine

1. Keep deterministic ffmpeg/Python checks as the default path for every minute.
2. Cap full Omni/video review to sampled windows, flagged windows, and paid escalations.
3. Add a per-job `cost_estimate` object with deterministic compute, AI input, AI output, storage, and bandwidth fields.
4. Add an account-level cost guardrail that blocks or downgrades Omni when COGS exceeds the plan budget. Implemented first for caller-declared `ai_review_seconds` with `downgrade`, `block`, and `off` modes.
5. Keep customer billing on deterministic checked minutes.
6. Track internal model-review spend separately from customer minutes.
7. Add a “margin mode” default: deterministic scan all, Omni only suspicious windows.
8. Use model review internally for deterministic capture-rate backtesting and roadmap generation.
9. Prefer Gemini 2.5 Flash-Lite or queued Gemini 2.5 Flash Batch/Flex for advisory windows; keep Qwen/Omni for selected private escalations.
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
38. Add pricing copy that sells deterministic publish-readiness QC minutes.
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
48. Add billing enforcement for included deterministic QC minutes, and make external Claude Code, Codex, Cursor, and MCP installs usable only for workspaces with paid credits or an active subscription.
49. Add abuse limits for file size, duration, concurrent jobs, and repeated retries.
50. Run a Product Hunt launch checklist only after cost telemetry proves the plan can hold margin.

## NTO Pipeline Replacement Addendum

Source evidence reviewed:

- `/Applications/DrAntoniou Projects/AgentCompanies/companies/NTO/PRODUCTION-PIPELINE-v3.md`
- `/Applications/DrAntoniou Projects/AgentCompanies/companies/NTO/personas/qc-engineer.md`
- `/Applications/DrAntoniou Projects/AgentCompanies/companies/NTO/personas/council/20-video-qc-watcher.md`
- `/Applications/DrAntoniou Projects/AgentCompanies/companies/NTO/personas/qc-snippets/visual-qc-learning-locks.md`
- `/Applications/DrAntoniou Projects/AgentCompanies/companies/NTO/UPLOADCHECK-QC-SPEC.md`
- `/Applications/DrAntoniou Projects/AgentCompanies/companies/NTO/scripts/qc-gates-cinema.py`
- `/Applications/DrAntoniou Projects/AgentCompanies/companies/NTO/scripts/clone_crowd_detect.py`
- `/Applications/DrAntoniou Projects/AgentCompanies/companies/NTO/scripts/qc-shorts-format.py`
- `/Applications/DrAntoniou Projects/AgentCompanies/companies/NTO/scripts/vo-audio-qc.py`
- `/Applications/DrAntoniou Projects/AgentCompanies/companies/NTO/content/videos/tampered-with-the-gospels-2026-05-27/STAGE-17-5-AI-PROMPT-PACK-v12.md`
- `/Applications/DrAntoniou Projects/AgentCompanies/companies/NTO/content/videos/_shared/cast/_LEVANTINE-AUDIT-2026-06-02.md`

Product interpretation: UploadCheck should become the callable QC surface that replaces NTO's current production QC personas and scripts. We should not publicly disclose every private gate or implementation detail; public copy can say "readability, visual match, audio integrity, layout, repetition, and publish-readiness checks" while the private engine keeps the exact gate list and thresholds.

NTO-derived private QC tasks to add to the product:

1. `text_contrast`: detect low-contrast overlay text against moving footage/backgrounds. Implemented first as deterministic OCR + luminance contrast.
2. `text_safe_area`: reject words crossing Shorts action chrome, lower UI overlays, or long-form title-safe margins. Implemented in the default gate and reused by `shorts_format`.
3. `text_crop_jitter`: reject cropped, overlapping, jittering, or edge-to-edge text cards. Implemented first as a deterministic manifest-side gate for renderer/export metadata.
4. `shorts_format`: verify exact 1080x1920, full-bleed 9:16, no gutters, no unintended dialogue, correct duration. Implemented as an opt-in specialized gate.
5. `canvas_fill`: verify long-form 16:9 fills the canvas and blocks pillarbox/letterbox misuse. Implemented in the default gate.
6. `script_faithfulness`: compare transcript against locked script/expected narration with WER thresholds. Implemented first as a deterministic transcript-side WER gate when callers pass a transcript and expected-script sidecar.
7. `pronunciation_watchlist`: flag customer-provided banned words, names, and terms that commonly misrender. Implemented first as a deterministic transcript-side watchlist gate.
8. `spoken_leaks`: detect stage directions, URLs, vendor names, prompt text, or production notes spoken aloud. Implemented first as a deterministic transcript-side gate when callers pass transcript/script text.
9. `dead_air`: block unintended silence longer than customer threshold. Implemented in the default gate with ffmpeg `silencedetect`.
10. `visual_narration_match`: verify every 30-second window visually supports the narration, not just the mood.
11. `named_entity_visual_match`: if narration names a person/place/event/product, visual should show that thing or a deliberate neutral substitute.
12. `repeat_fatigue`: block exact clip reuse and source-family dominance windows. Implemented first as a conservative rendered-frame reuse gate plus optional JSON manifest reuse/source-family analysis.
13. `static_head_dominance`: block long held talking-head/portrait shots without b-roll, graphic, or motion. Implemented first as a deterministic manifest-side gate.
14. `slow_hanging_motion`: block clips slowed so much they read as frozen, buffering, or still-image drift.
15. `cheap_filler`: block old/degraded/B&W/silent-film/low-res filler unless explicitly requested.
16. `first_three_seconds`: flag generic openers, missing hook frame, or title/thumb mismatch. Implemented first as a deterministic manifest-side opening gate.
17. `rehook_cadence`: flag long-form stretches without pattern interruption. Implemented first as a deterministic manifest-side cadence gate.
18. `end_screen_tease`: flag missing next-video, CTA, or episode handoff. Implemented first as a deterministic manifest-side final-window gate.
19. `thumbnail_text_readability`: apply text contrast/safe-area rules to thumbnail candidates. Implemented first as a deterministic OCR image/first-frame gate and exposed as a `creator_thumbnail` recipe profile.
20. `repair_loop`: after report generation, agent/MCP should show all QC flags and ask the user whether to fix now. Fixable items should be routed to the LLM or local project files; render-source defects should be described with timestamped patch instructions.
21. `literal_subject_match`: when narration names a person, place, source, date, or event, require an actual matching visual or an explicit neutral/source-card fallback. This is stricter than mood matching. Implemented first as a deterministic manifest-side gate.
22. `source_family_dominance`: flag one source family, motif, or visual bucket dominating a 120-second window even when the exact file is different. Implemented when callers provide a JSON storybook/edit manifest to `repeat_fatigue`; hosted API manifest ingest still needs product surfacing.
23. `clip_reuse_ledger`: accept storybook/edit-decision manifests so UploadCheck can catch repeated visuals before export as well as after render. Implemented through `repeat_fatigue` manifest payloads across engine, API, CLI, and MCP.
24. `spoken_production_leaks`: use transcript patterns for vendor names, URLs, markdown, prompt text, stage directions, and wrong-name substitutions. Implemented through `spoken_leaks`; ASR-generated transcript ingestion remains optional/future.
25. `chunk_sidecar_failures`: ingest local render sidecars such as `*.garble-report.json` and failed chunk reports as first-class blockers. Implemented first as a deterministic sidecar-directory gate across engine, API, CLI, and MCP.
26. `sentence_boundary`: for voice-clip shorts or extracted clips, block mid-word and mid-sentence endings. Implemented first as a deterministic transcript-side gate when callers pass transcript sidecars.
27. `speaker_visual_binding`: block storybook/edit-manifest rows where a named speaker's voice is paired with another named character's face. Implemented first as a deterministic manifest-side gate.
28. `opening_footer_text_presence`: for text-card Shorts, verify the 0-3s hook card and 50-60s CTA/footer card exist. Implemented first as a deterministic manifest-side gate before rendered OCR spend.
29. `dialogue_in_music_short`: for music-only Shorts, flag any detected spoken dialogue as a format violation. Implemented first as a deterministic transcript-side gate so pipelines with captions/transcripts can block speech without ASR spend.
30. `contact_sheet_evidence`: require before/after contact-sheet artifacts for repeated founder complaint windows and repair verification; fail a repair when fixing one repeated/mismatched visual introduces another repeat or mismatch. Implemented first as a deterministic manifest-side evidence gate.
31. `visual_authenticity`: flag character renders that violate a customer-defined casting/style lock, such as Jewish first-century figures drifting into pale/light-eyed/European references while Roman figures remain allowed to read Roman/European by design. Planned as a private model-backed or face-attribute gate with customer-specific watchlists.
32. `ai_plate_artifacts`: flag generated-video artifacts that NTO currently rejects manually: melted hands, extra fingers, plastic skin, fantasy gloss, Sunday-school illustration look, stock-filler look, or static AI stills posing as motion-native video. Planned as sampled-window multimodal review after deterministic defect triage.
33. `unwanted_lip_movement`: flag visible mouth movement or lip-sync in clips that are meant to be speaker-neutral, hands-only, no-face, or non-speaking b-roll. Planned as a vision/video motion gate for AI plates and character-motion clips.
34. `historical_period_fit`: flag modern objects, wrong-region footage, wrong-era footage, visible readable text inside AI plates, battle spectacle, wedding/dancing/banquet footage during teaching/conflict/writing VO, and other banlist mismatches that current NTO personas catch by hand. Planned as a manifest-plus-vision gate.
35. `sensitive_framing`: flag anti-Jewish visual coding, caricature, accusation tableaux, triumphalist empire imagery, frontal Jesus-face violations, or other customer-defined sensitive-framing bans before upload. Planned as private policy-aware review over flagged windows.
36. `hand_anatomy`: flag AI hand defects before clip approval, including extra fingers, fused fingers, melted hands, broken wrists, or human-limb frames that need focused review. Planned as sampled-frame vision review, seeded from NTO `G_HANDS`.
37. `hallucinated_plate_text`: flag unintended readable text, title-card remnants, watermarks, OCR glyphs, or garbled signs inside AI/generated or library plates when the scene is not an approved Remotion/source card. Implemented first as deterministic OCR with a manifest allowlist for approved text/source cards.
38. `clean_segment_source_scrub`: replace NTO's local public-domain scrubber by rejecting source clips with silent-film intertitles, wrong-region inserts, pyramids/Babylon/Egypt footage under incompatible VO, or adjacent wedding/dancing/banquet footage before a storybook can reference them. Implemented first as a deterministic manifest metadata gate plus OCR-only source-clip scan when no manifest is supplied.
39. `posted_platform_visual_check`: after private YouTube/short upload, verify the watch URL/player state still matches the rendered artifact: full-bleed layout, readable text after platform chrome, music/VO state, captions uploaded, and no transcode-introduced issue before privacy flips public.
40. `asset_triage_reuse_manifest`: after ship, identify reusable assets, clean-segments, character composites, music beds, Remotion templates, and generative beats for retention while marking one-off candidates/intermediates for cleanup. Implemented first as a deterministic post-run manifest gate when asset triage is explicitly required. Product value is lower rerender cost and faster future QC.

Private moat note: competitors can copy the public idea of upload QC, but our sticky layer is the accumulated private failure catalog, thresholds, fixtures, and agent repair loops learned from real NTO production. Publish the outcomes and broad categories, not the full validator internals.

Porting spec: the current NTO handoff contract is captured in `docs/UPLOADCHECK-QC-SPEC.md`. It defines `POST /v1/check -> verdict + timestamped flags`, the agent rule to repair only flagged spans, source-backed thresholds for `G_LOOP`, `G_HOLD`, clone-crowd, and audio WER/garble gates, and the fail-loud/no-silent-skip rule. Use it as the private implementation checklist while keeping public surfaces focused on broad QC outcomes.

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
- Done: NTO-derived `text_crop_jitter` deterministic manifest-side text-card gate added to `scripts/qc-engine/check_text_crop_jitter.py`, included in `run_gate.py`, and added to NTO long-form and Shorts recipe defaults.
- Done: NTO-derived `dead_air` deterministic gate added to `scripts/qc-engine/check_dead_air.py` and included in `run_gate.py`.
- Done: NTO-derived `repeat_fatigue` deterministic gate added to `scripts/qc-engine/check_repeat_fatigue.py` and included in `run_gate.py`.
- Done: NTO-derived `spoken_leaks` deterministic transcript-side gate added to `scripts/qc-engine/check_spoken_leaks.py` and included in `run_gate.py`.
- Done: NTO-derived `script_faithfulness` deterministic transcript-side WER gate added to `scripts/qc-engine/check_script_faithfulness.py`, plus REST/CLI/MCP expected-script sidecar support.
- Done: NTO-derived `sentence_boundary` deterministic transcript-side gate added to `scripts/qc-engine/check_sentence_boundary.py`, included in `run_gate.py`, and added to the Shorts recipe default.
- Done: NTO-derived `speaker_visual_binding` deterministic manifest-side gate added to `scripts/qc-engine/check_speaker_visual_binding.py`, included in `run_gate.py`, and added to the NTO long-form recipe default.
- Done: NTO-derived `static_head_dominance` deterministic manifest-side gate added to `scripts/qc-engine/check_static_head_dominance.py`, included in `run_gate.py`, and added to the NTO long-form recipe default.
- Done: NTO-derived `literal_subject_match` deterministic manifest-side gate added to `scripts/qc-engine/check_literal_subject_match.py`, included in `run_gate.py`, and added to the NTO long-form recipe default.
- Done: NTO-derived `first_three_seconds` deterministic manifest-side opening-hook gate added to `scripts/qc-engine/check_first_three_seconds.py`, included in `run_gate.py`, and added to the NTO long-form and Shorts recipe defaults.
- Done: NTO-derived `end_screen_tease` deterministic manifest-side final-window gate added to `scripts/qc-engine/check_end_screen_tease.py`, included in `run_gate.py`, and added to the NTO long-form and Shorts recipe defaults.
- Done: NTO-derived `rehook_cadence` deterministic manifest-side cadence gate added to `scripts/qc-engine/check_rehook_cadence.py`, included in `run_gate.py`, and added to the NTO long-form recipe default.
- Done: NTO-derived `contact_sheet_evidence` deterministic manifest-side evidence gate added to `scripts/qc-engine/check_contact_sheet_evidence.py`, included in `run_gate.py`, and added to the NTO long-form recipe default.
- Done: NTO-derived `dialogue_in_music_short` deterministic transcript-side Shorts gate added to `scripts/qc-engine/check_dialogue_in_music_short.py`, included in `run_gate.py`, and added to the NTO Shorts recipe default.
- Done: NTO-derived `opening_footer_text_presence` deterministic manifest-side Shorts gate added to `scripts/qc-engine/check_opening_footer_text_presence.py`, included in `run_gate.py`, and added to the NTO Shorts recipe default.
- Done: NTO-derived `chunk_sidecar_failures` deterministic sidecar-directory gate added to `scripts/qc-engine/check_chunk_sidecar_failures.py`, included in `run_gate.py`, and exposed through API inline sidecars, CLI `--sidecar-dir`, MCP `sidecar_dir`, and NTO/NPO recipe defaults.
- Done: NTO-derived `thumbnail_text_readability` deterministic OCR image gate added to `scripts/qc-engine/check_thumbnail_text_readability.py`, included in `run_gate.py`, and exposed through the `creator_thumbnail` pipeline recipe.
- Done: NTO-derived `hallucinated_plate_text` deterministic OCR gate added to `scripts/qc-engine/check_hallucinated_plate_text.py`, included in `run_gate.py`, and added to the NTO long-form recipe default with manifest allowlisting for approved text/source cards.
- Done: NTO-derived `clean_segment_source_scrub` deterministic source-preflight gate added to `scripts/qc-engine/check_clean_segment_source_scrub.py`, included in `run_gate.py`, and exposed in pipeline recipes for source clips/storybook rows before b-roll references.
- Done: NTO-derived `asset_triage_reuse_manifest` deterministic post-run manifest gate added to `scripts/qc-engine/check_asset_triage_reuse_manifest.py`, included in `run_gate.py`, and exposed in pipeline recipes for post-ship reusable-asset retention and cleanup discipline.
- Done: manifest upload/inline payloads are exposed through API, CLI, and MCP for NTO storybook timelines and final-master reuse checks.
- Done: plan-aware cost guardrail added for internal model-review seconds. API/CLI/MCP callers can pass `plan_id`, `ai_review_seconds`, and `cost_guardrail`; unsafe requests can be downgraded to deterministic checks or blocked, but public plans sell deterministic checked minutes.
- Done: first per-check model-call accounting added for `twins`, `cheap_broll`, `garble`, `narration_match`, and `omni_watch`; in downgrade mode, margin-breaking model-backed checks are removed before the engine runs.
- Done: `gemini_watch` added as the primary internal capture-rate oracle: Gemini Files API uploads full video+audio, uses optional transcript sidecars, returns structured issue-family flags, records modality token usage for observed COGS, and is wired through `run_gate.py`. First funded Gemini backtest on `Y657dAzHR9g` found cheap/generic B-roll and repeat fatigue; deterministic gates captured 3/3 Gemini issue-family flags, for a first-pass capture rate of `100%` against the `90%` benchmark.
- Done: `omni_watch` hardened as an optional Qwen/Anthropic comparison path: Qwen/OpenRouter audio+visual runs now use streaming Omni request shape, local/process env key loading, `--provider qwen --require-audio-video` fail-closed mode, transcript forwarding from `run_gate.py`, extraction-error reporting, and explicit Anthropic frame+narration fallback metadata. Sonnet remains the default Anthropic oracle fallback; Haiku is available for lower-cost smoke tests only.
- Done: preflight cost estimation added through `POST /v1/qc/estimate`, CLI `uploadcheck estimate`, and MCP `qc_estimate_cost`, so agents can check effective/removed gates before sending media to Render.
- Done: public cost-basis access added through MCP `qc_get_cost_basis` and CLI `uploadcheck cost-basis --json`, so agents can fetch cost/minute and the `$99 / 5,000` stress-plan warning before pricing or model-backed review decisions.
- Done: global Codex MCP entry is installed locally through the `uploadcheck` server and was smoke-tested with a live hosted report.
- Done: global Codex skill `uploadcheck` installed locally so projects can invoke the standard cost-preflight, hosted QC, report, marker CSV, and repair-loop workflow.
- Done: global Codex install verifier added through `npm run codex:verify-install`, checking `[mcp_servers.uploadcheck]`, hosted API base URL, executable MCP wrapper, and installed UploadCheck skill markers.
- Done: authenticated hosted inline-media execution is verified on Render with a blocking `twins` report.
- Done: checkout route plumbing exists at `/checkout/creator`, `/checkout/studio`, and `/checkout/network`, with env-driven Lemon Squeezy redirects.
- Done: no-secret launch readiness proof added at `GET /v1/readiness` for checkout, custom domain, API auth, encryption, persistence, storage, demo clip, and Product Hunt go/no-go state; `apiAuth` is launch-blocking.
- Done: public Product Hunt demo clip is bundled at `/demo/uploadcheck-product-hunt-demo.mp4` and embedded on `/product-hunt/`.
- Done: public sample report artifacts added at `/sample-reports/index.json` with PASS, WATCH, and BLOCK JSON examples linked from `/sample-report/`, `agent-manifest.json`, and `llms.txt`.
- Done: public Product Hunt launch kit added at `/product-hunt-launch-kit.json` with launch copy, demo flow, proof links, pricing posture, and go/no-go source of truth.
- Done: Product Hunt launch kit now includes a current-state snapshot tied to `/launch-status.json`, so static launch copy shows remaining blockers instead of only the desired ready state.
- Done: Product Hunt launch kit now has a builder and `npm run product-hunt-kit:generate`, so launch copy and current-state snapshots regenerate from `/launch-status.json` instead of hand-maintained JSON.
- Done: static launch status now has `npm run launch-status:generate`, which rebuilds `/launch-status.json` and `/product-hunt-launch-kit.json` together from the shared launch-status and launch-kit builders.
- Done: public operator commands and Product Hunt required commands now include `npm run launch-status:generate`, so static launch artifacts are regenerated before verification/deploy.
- Done: signed-upload media can use mounted durable filesystem storage via `UPLOADCHECK_DURABLE_STORAGE_DIR`; upload reports retain `storageMode`.
- Done: signed-upload media can mirror to S3/R2-compatible object storage when the full `UPLOADCHECK_STORAGE_*` env set is configured; readiness now rejects incomplete object-storage env instead of treating a bucket name as enough.
- Done: mounted-disk JSON persistence is recognized as production persistence when `UPLOADCHECK_STORE_PATH` points outside temp storage; Supabase remains the future multi-workspace store.
- Done: strong webhook encryption key generation and readiness validation added through `npm run --silent secret:generate` and `GET /v1/readiness`.
- Done: Product Hunt readiness CLI added through `npm run readiness:check`; it fetches live readiness and prints exact remaining Render/DNS/checkout actions.
- Done: Product Hunt readiness actions now include explicit checkout and storage probe commands, so operators can prove configured payment/storage paths live before launch.
- Done: launch doctor added through `npm run launch:doctor`; it runs local launch helpers, explicit checkout/storage probes, public metadata verifiers, and live readiness/DNS checks in one ordered report.
- Done: machine-readable launch doctor JSON added through `npm run launch:doctor -- --json`, so agents can read blocked steps, normalized command strings, and proof outputs without scraping text logs.
- Done: redacted launch evidence bundle added through `npm run launch:evidence -- --json`; it preserves statuses, blockers, commands, and output hashes while stripping raw stdout/stderr, bearer tokens, checkout paths, Lemon Squeezy variant IDs, and temp paths for safe operator handoff.
- Done: hosted media ingress launch doctor step added; `npm run launch:doctor` now covers `UPLOADCHECK_MEDIA_INGRESS_BASE_URL=https://api.uploadcheck.app UPLOADCHECK_API_KEY=<private_bearer> npm run media-ingress:verify` and blocks cleanly until the private bearer token is supplied.
- Done: hosted launch doctor endpoint verifier added through `npm run live-launch-doctor:verify`; Product Hunt launch now blocks if Render serves stale HTML or a launch-doctor JSON payload missing the hosted media-ingress command.
- Done: packaged CLI launch doctor added through `uploadcheck launch-doctor --json`, so agents outside this repo can fetch the live blocker fix plan without local npm scripts.
- Done: packaged CLI launch evidence added through `uploadcheck launch-evidence --json`, so agents outside this repo can fetch a redacted Product Hunt evidence bundle derived from the live launch doctor without local repo scripts.
- Done: hosted redacted launch evidence added through `GET /v1/launch-evidence` and MCP `qc_get_launch_evidence`, so agents can inspect launch evidence without shelling into this repo.
- Done: hosted redacted launch evidence verifier added through `npm run live-launch-evidence:verify`; launch doctor now blocks if Render does not serve the public redacted launch-evidence endpoint after deploy.
- Done: launch blocker fix plan added to `npm run launch:handoff`, giving operators and agents structured phases for Render env, checkout, persistence, upload storage, domains, secret encryption, proof commands, and final launch proof.
- Done: Product Hunt launch-kit required commands are now tested against launch-doctor coverage plus the standalone env-file validation handoff, so public go/no-go instructions cannot drift from the executable verifier.
- Done: launch readiness no longer treats Supabase env alone as persistence proof; until a server-side Supabase store adapter exists, Product Hunt readiness requires the mounted JsonStore path that the runtime actually uses.
- Done: MCP `qc_run_local_file` added for Codex/Claude/Cursor/NTO/NPO local media workflows; small files are encoded inline for Render evaluation and large files fall back to signed upload.
- Done: Render Blueprint now declares UploadCheck custom domains, a `/mnt/uploadcheck` persistent disk, durable JSON/media paths, checkout URL prompts, and webhook encryption prompts; `npm run render:verify` guards the launch config.
- Done: Render API launch helper added through `npm run render:plan`, `npm run render:audit`, and `npm run render:apply`; it can add domains, set durable env values, set provided secrets, and trigger deploys when `RENDER_API_KEY` is available.
- Done: Render env validation added through `npm run render:validate-env`; `render:apply` refuses placeholders, invalid checkout/storage URLs, weak encryption keys, invalid API hashes, incomplete object storage, or non-durable paths.
- Done: Render env-file validation added through `npm run render:validate-env-file -- /tmp/uploadcheck-render-launch.env`, so operators can validate the filled local handoff file before sourcing it or applying Render changes.
- Done: Render launch ops now support either direct checkout URLs or Lemon Squeezy store slug + plan variant IDs, so the accepted readiness checkout alternatives are actually applied to Render.
- Done: Render launch bootstrap env added through `npm run render:bootstrap-env`; it generates the API hash and webhook encryption key into the local Render env file while printing the client bearer token separately.
- Done: Product Hunt launch checker added through `npm run launch:check`; it combines live readiness, DNS resolution, and HTTP checks for `uploadcheck.app`, `www.uploadcheck.app`, and `api.uploadcheck.app`.
- Done: Product Hunt launch checker now verifies DNS against expected Render targets, not just generic address resolution; subdomains require the expected CNAME and the apex accepts the expected Render CNAME or Render fallback IP.
- Done: DNS cutover helper added through `npm run launch:dns`; it prints copy-paste DNS records and verification commands from `public/launch-targets.json`.
- Done: Checkout config helper added through `npm run launch:checkout`; it verifies Creator, Studio, and Network checkout resolution while redacting direct checkout paths and Lemon Squeezy variant IDs.
- Done: Checkout readiness now requires HTTPS direct checkout URLs or Lemon Squeezy HTTPS variant URLs, so Product Hunt launch cannot pass with insecure payment links.
- Done: Optional launch checkout probe added through `UPLOADCHECK_CHECKOUT_PROBE=1 npm run launch:checkout`; it performs redacted live checkout reachability checks so Product Hunt proof does not rely on HTTPS URL shape alone.
- Done: Persistence/storage config helper added through `npm run launch:storage`; it verifies mounted store paths, durable upload storage, and object-storage completeness without exposing access keys or secret keys.
- Done: Optional launch storage probe added through `UPLOADCHECK_STORAGE_PROBE=1 npm run launch:storage`; it writes and deletes tiny probe files in configured durable filesystem paths so mounted-disk readiness can be validated before Product Hunt launch.
- Done: public machine-readable launch status added at `/launch-status.json` and live status added at `GET /v1/launch-status` with completed controls, current blockers, operator commands, and the Product Hunt go/no-go rule; `npm run launch-status:verify` keeps it aligned with readiness, OpenAPI, llms.txt, and the agent manifest.
- Done: `npm run launch-status:verify` now fails if built `dist/launch-status.json` or `dist/product-hunt-launch-kit.json` drift from the generated public artifacts, so static deploy output cannot silently lag Product Hunt launch metadata.
- Done: `npm run media-ingress:verify` now smoke-tests inline ephemeral `video_base64` and `audio_base64` jobs plus signed-upload fallback locally, and can target hosted Render with `UPLOADCHECK_MEDIA_INGRESS_BASE_URL` plus the private API key before Product Hunt launch.
- Done: public go/no-go wording now requires `npm run launch:doctor` as well as live readiness and `launch:check`, so checkout/storage probes are part of the launch claim.
- Done: agent access to live launch status added through MCP `qc_get_launch_status` and CLI `uploadcheck launch-status`, so Codex/Claude/Cursor projects can inspect go/no-go state without custom HTTP.
- Done: agent access to live launch handoff added through MCP `qc_get_launch_handoff` and `GET /v1/launch-handoff`, so projects can fetch blocker-specific required actions, proof commands, and the no-launch rule without custom HTTP.
- Done: agent access to the launch blocker fix plan added through MCP `qc_get_launch_doctor`, so MCP clients can fetch Product Hunt readiness blockers and fix phases directly.
- Done: agent access to redacted launch evidence added through MCP `qc_get_launch_evidence`, so MCP clients can fetch Product Hunt evidence bundles directly.
- Done: agent access to machine-readable pipeline defaults added through MCP `qc_get_pipeline_recipes` and CLI `uploadcheck recipes --json`, so NTO/NPO production pipelines can discover profiles without scraping public JSON URLs.
- Done: agent access to the production runbook added through MCP `qc_get_pipeline_handoff` and CLI `uploadcheck pipeline-handoff --json`, so NTO/NPO and creator agents can start from one callable sequence instead of manually combining public artifacts.
- Done: pipeline handoff artifact added at `/pipeline-handoff.json`, giving NTO/NPO and creator agents a machine-readable launch preflight, recipe, cost-basis, estimate, media-ingress, report, marker CSV, repair-loop, and rerun sequence.
- Done: machine-readable pipeline recipes now include `launch_preflight` with MCP `qc_get_launch_handoff` plus `uploadcheck launch-handoff --json`, so NTO/NPO and creator agents can check live blockers and fetch proof commands before launch-sensitive runs.
- Done: machine-readable pipeline recipes now include an NTO replacement QC task list with implemented UploadCheck gates, planned product gates, and a private-moat rule that exposes categories without publishing thresholds or validator internals.
- Done: NTO visual-generation failure evidence is now mapped into planned private gates for visual authenticity, AI plate artifacts, unwanted lip movement, historical period fit, and sensitive framing without claiming those gates are implemented.
- Done: machine-readable repair-loop contract added to `agent-manifest.json` and `pipeline-recipes.json`, requiring all flags to be shown, the user to be asked "Fix now?", reachable fixes only, timestamped source/render instructions for unreachable defects, and rerun before upload-ready claims.
- Done: safe API auth material generation added through `npm run --silent api-key:generate`; operators can keep the bearer token private and set only `UPLOADCHECK_API_KEY_SHA256` on Render.
- Done: webhook delivery headers now use UploadCheck naming (`X-UploadCheck-Signature`, `x-uploadcheck-delivery-id`, `x-uploadcheck-event`) while still sending legacy QCGenie aliases during migration.
- Done: launch checkout readiness no longer lets Studio checkout URLs or variants satisfy missing Creator checkout config; each public plan must resolve from its own launch env family before Product Hunt readiness can pass.
- Done: margin telemetry added through `GET /v1/usage/margins` and MCP `qc_get_margin_telemetry`; usage entries now retain cost snapshots with COGS, allocated revenue, cost/minute, and estimated gross margin.
- Done: CLI margin telemetry added through `uploadcheck usage --billing-period YYYY-MM`, so non-MCP agent workflows can inspect cost/minute and gross margin directly.
- Done: public cost-basis verifier added through `npm run cost-basis:verify`, checking `/cost-basis.json` plan economics and the `$99 / 5,000` stress-plan verdict against `cost-model.mjs`.
- Done: hosted cost-basis verifier added through `npm run live-cost-basis:verify`; launch doctor now blocks if Render serves stale cost/minute economics or omits the OpenAI transcription cost-reduction audit.
- Done: hosted agent-manifest verifier added through `npm run live-agent-manifest:verify`; launch doctor now blocks if Render serves stale MCP/tool discovery, NPO profile, repair-loop, or pricing guardrail metadata.
- Done: hosted pipeline-recipes verifier added through `npm run live-pipeline-recipes:verify`; launch doctor now blocks if Render serves stale NTO/NPO recipes, low-contrast text QC, clone-crowd QC, or repair-loop contracts.
- Done: hosted pipeline-handoff verifier added through `npm run live-pipeline-handoff:verify`; launch doctor now blocks if Render serves stale NTO/NPO call sequence, media-ingress, marker CSV, repair-loop, or margin-guardrail instructions.
- Done: focused NPO pipeline handoff added at `/npo-pipeline-handoff.json` with `npm run live-npo-pipeline-handoff:verify`; NPO audio pipelines now have a single callable contract for cost preflight, sidecars, Render media ingress, marker CSV, repair loop, and rerun-before-publish-ready.
- Done: hosted OpenAPI verifier added through `npm run live-openapi:verify`; launch doctor now blocks if Render serves stale API docs for launch evidence, queued drains, inline media, remote sidecars, cost guardrails, usage margins, or signed uploads.
- Done: hosted public-artifacts verifier added through `npm run live-public-artifacts:verify`; launch doctor now blocks if Render serves stale `/launch-status.json`, `/product-hunt-launch-kit.json`, `/sample-reports/index.json`, individual PASS/WATCH/BLOCK sample report JSON, or `/llms.txt` that omit launch-evidence, cost, sample-report, clone-crowd BLOCK, repair-loop, or public go/no-go proof.
- Done: hosted web-artifacts verifier added through `npm run live-web-artifacts:verify`; launch doctor now blocks if Product Hunt, pricing, sample-report, agentic API, sitemap, `llms.txt`, or demo MP4 web artifacts are missing or stale on `uploadcheck.app`.
- Done: `/cost-basis.json` now publishes remaining COGS budget after deterministic scanning for every plan; the `$99 / 5,000` stress plan exposes only `0.0157` COGS cents/minute of post-deterministic overhead before the 95% margin target breaks.
- Done: Pricing pages, `agent-manifest.json`, and `llms.txt` now state that checked minutes are deterministic publish-readiness QC minutes and that deep model review stays internal for engine backtesting, roadmap generation, and deterministic capture-rate measurement.
- Done: roadmap verifier added through `npm run roadmap:verify`, checking the 50-point plan sequence, expert-panel coverage, NTO replacement addendum, and execution-status markers.
- Done: observed provider usage is now captured from real QC engine calls. Anthropic frame checks preserve token usage, DashScope/OpenRouter Omni calls preserve OpenAI-compatible usage when present, Scribe checks preserve request/audio seconds, and `VERDICT.json`, job reports, and margin telemetry expose rollups for cost reconciliation.
- Done: observed provider usage is now priced into post-run COGS. Reports and `/v1/usage/margins` distinguish estimated preflight COGS from observed provider COGS, observed total COGS, observed cost/minute, and observed gross margin.
- Done: model-backed preflight pricing now uses an observed-cost floor of `0.75` cents per model call, based on the clone-crowd `twins` smoke test, so guardrails do not underprice Sonnet frame review.
- Done: `twins` now has a Pillow-only local appearance-cluster fallback before the vision call, so repeated-character crowd scenes can block with `needs_more_character_variation` and zero provider usage when the local evidence is strong.
- Done: public cost basis now includes a primary-source pricing audit and OpenAI transcription alternatives. `gpt-4o-mini-transcribe` is tracked at `0.3` cents/minute for observed COGS, but still marked unsafe for default every-minute transcription on the `$99 / 5,000` stress plan.
- Done: billing enforcement for included minutes added. Usage metering is idempotent per job and billing period, and declared jobs with `plan_id` plus `minutes` or `duration_seconds` are rejected with `usage_limit_exceeded` before QC if they exceed included plan minutes.
- Done: completed jobs now record usage and cost snapshots at completion time, so margin telemetry does not depend on a later report fetch; unknown-duration no-run fallbacks no longer invent a 19-minute charge.
- Done: public plan AI-review budgets are set to `0`; the sold unit is deterministic QC minutes, while model-backed review is treated as an internal engine-improvement path.
- Done: abuse limits added for file size, declared duration, and active job concurrency. Job/upload requests now fail fast with `duration_limit_exceeded`, `upload_size_limit_exceeded`, or `active_job_limit_exceeded` before QC compute or storage spend.
- Done: public CLI/MCP packages now strip the internal Gemini backtest tool from customer package files and public MCP manifests. Internal capture-rate testing remains repo-only through `scripts/qc-engine/gemini_watch.py`.
- Done: customer API-key records can be created through authenticated `POST /v1/api-keys`; the dashboard supplies a provisioning bearer, bearer tokens are returned once, stored hashed, scoped, and honored for workspace plan metadata on agent jobs.
- Done: owner overage-spend alerts are recorded and sent through Resend when extra-minute spend crosses the subscription-value threshold, using the workspace owner email from the API-key record or alert env. This now covers both synchronous/worker QC completion and externally submitted gate verdicts.
- Done: local pre-publish package install smoke added through `npm run packages:install-smoke`; it packs both packages, installs them in a clean temp project, runs `npx uploadcheck cost-basis --json`, and starts the installed MCP binary.
- Partial: the customer boundary is defined and locally enforced: local NTO can call the repo directly, while hosted external Claude Code, Codex, Cursor, and MCP usage must be tied to created workspace API keys, plan minutes, top-up credits, and checkout before public launch.
- Done: job observability added for duration, stage timing, provider-usage count, engine mode, and fallback failure reasons. Job responses and reports now preserve `startedAt`, `completedAt`, `processingDurationMs`, `observability.stages`, and `failureReason`.
- Done: queued worker execution added. `POST /v1/qc/jobs` can accept `process_async=true`, leaving the job queued, and `POST /v1/qc/jobs/drain` processes queued jobs for Render cron/workflow execution.
- Done: queued worker sidecar URLs added. Async jobs can now persist HTTPS `manifest_url`, `transcript_url`, `watchlist_url`, `expected_script_url`, and `chunk_sidecars_url`; `POST /v1/qc/jobs/drain` fetches them into temporary storage for the gate run while public job/report responses expose only sanitized `sidecarIngress`.
- Done: launch pricing is updated to `Creator $99 / 2,400 minutes`, `Studio $299 / 10,000 minutes`, and `Network $799 / 36,000 minutes`; public cost-basis and hosted cost-basis verifiers now pass against live Render.
- Partial: billing checkout still needs real `UPLOADCHECK_*_CHECKOUT_URL` values or an UploadCheck Lemon Squeezy product with Creator/Studio/Network monthly variant IDs configured on Render before launch. `npm run launch:checkout-discover` verifies whether those variants exist and currently reports all three UploadCheck plan variants missing from the configured Lemon Squeezy store.
- Next: create the UploadCheck Lemon Squeezy subscription product with monthly Creator `$99`, Studio `$299`, and Network `$799` variants, then apply the resulting checkout env to Render and run `UPLOADCHECK_CHECKOUT_PROBE=1 npm run launch:checkout`.
- Next: publish `@uploadcheck/mcp` and `@uploadcheck/cli`, redeploy the agent-install/docs artifacts, and verify external Claude Code, Codex, Cursor, and MCP clients can call deterministic QC only with a created UploadCheck API key tied to subscription minutes or top-up credits.
- Next: after checkout, package publish, and private MCP beta evidence are clean, prepare an Anthropic Directory submission around a narrow remote MCP tool surface. Defer OpenAI ChatGPT app/connector work until a hosted HTTPS MCP endpoint, account binding, and ChatGPT-native report UX are worth the review effort.
- Next: decide whether to keep legacy immutable Render slugs (`qcgenie-web`, `qcgenie-api`) behind the verified UploadCheck custom domains or recreate services for `uploadcheck-*` Render subdomains.
- Partial: Product Hunt launch page, public report examples, bundled demo clip, custom domains, mounted persistence/storage envs, and hosted secret encryption are live enough for readiness; final launch still needs live checkout proof.
