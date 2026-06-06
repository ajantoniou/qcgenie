---
name: nto-video-qc-gate
description: Run or rebuild the NTO full-video QC gate when a master/short may have garble, dead air, loop-freeze, repeat fatigue, twins, low-contrast overlay text, script drift, or narration/visual drift. Use for Episode 1/2 masters, language versions, and Shorts before upload.
user-invocable: false
allowed-tools:
  - Read
  - Grep
  - Bash
---

# NTO Video QC Gate

## When to use

Use this when working in `companies/NTO/content/videos/*/render-*` or a nearby NTO output folder and any of these are true:

- a master or short is being called ship-ready
- the user reports looping, freezes, repeated footage, repeat fatigue, twins, garble, dead air, low-contrast overlay text, script drift, or narration mismatch
- a language master or derived short was built from an older source master

Do not use this as a substitute for normal quick iteration while a clip is still obviously rough. Use it before upload/publish or when diagnosing a QC miss.

## Inputs / context to gather

1. Identify the exact target asset path and nearby render folder.
2. Search for existing gate files first:
   - `check_garble.py`
   - `check_dead_air.py`
   - `check_static_head_dominance.py`
   - `check_literal_subject_match.py`
   - `check_first_three_seconds.py`
   - `check_loop_freeze.py`
   - `check_repeat_fatigue.py`
   - `check_twins.py`
   - `check_narration_match.py`
   - `run_gate.py`
3. Collect the supporting artifacts if present:
   - transcript/scribe JSON
   - anchor JSON
   - QC markdown
   - ship record
4. If the asset is derived from an older English master, locate that source master too.

## Procedure

1. Run the existing runner if it exists. Prefer one command that emits structured pass/fail output.
2. The scripts live in `scripts/` next to this file. Run `python3 scripts/run_gate.py VIDEO --checks canvas_fill,loop_freeze,repeat_fatigue,speaker_visual_binding,static_head_dominance,literal_subject_match,first_three_seconds,script_faithfulness,sentence_boundary,dead_air,cheap_broll,text_contrast,text_safe_area,garble,twins,narration_match,omni_watch [--lang eng] [--manifest storybook.json] [--transcript transcript.txt] [--expected-script locked-script.txt] [--fast]` for one verdict. For Shorts, add `shorts_format` explicitly: `--checks canvas_fill,shorts_format,first_three_seconds,text_contrast,text_safe_area,repeat_fatigue,sentence_boundary,dead_air,garble`.
   1. `canvas_fill`: deterministic ffprobe + sampled-frame black-edge check. Blocks pillarbox, letterbox, and black-gutter "tower" failures even when the encoded frame size looks correct.
   2. `loop_freeze`: ffmpeg freeze detection (`-50dB` + sensitive `-60dB`) for held frames. Each held frame is then CLASSIFIED: an intended static TEXT/GRAPHIC card (Remotion scripture/explainer — mostly-dark bg, sliver of bright text, low photographic mid-tone mass) is NOT a defect and is reported under `held_cards_ok` (type `STATIC_CARD_HELD_OK`); a frozen PHOTOGRAPHIC clip (broad mid-tone histogram — stuck skin/cloth/scene) stays in `freezes` and BLOCKS. Validated both ways: Ep.2-EN's 15s Matthew-10:5-6 scripture card → held_cards_ok (PASS); Ep.1-FIL's 27 stuck motion clips in the 666–885s region → freezes (BLOCK), while its real held cards (incl. a 75.6s explainer hold) → held_cards_ok. `--detect-repeats` adds opt-in perceptual reused-shot detection (noisy; off by default — the build-time clip ledger is the real anti-reuse control).
   3. `repeat_fatigue`: deterministic repeated-sequence gate for rendered masters, plus optional JSON manifest analysis for exact visual reuse and source-family dominance.
   4. `speaker_visual_binding`: deterministic manifest-side gate. Blocks rows where a named speaker's voice is paired with another named character's face. Speaker-neutral b-roll, Remotion/source cards, archive, and no-face rows are allowed.
   5. `static_head_dominance`: deterministic manifest-side gate. Blocks long held portrait/talking-head/single-character shots without b-roll, graphic/source-card, visible action, or explicit approval.
   6. `literal_subject_match`: deterministic manifest-side gate. Blocks rows where named VO subjects are paired with generic/mood footage instead of the named thing or an explicit source-card/Remotion fallback.
   7. `first_three_seconds`: deterministic manifest-side gate. Blocks missing/generic first-three-second hook frames/cards and explicit title/thumbnail/opening mismatch.
   8. `dead_air`: deterministic ffmpeg `silencedetect` gate. Blocks unintended silence longer than the configured threshold (default 1.5s) and skips cleanly when no audio stream exists.
   9. `script_faithfulness`: deterministic transcript-vs-locked-script WER check. Skips unless both `--transcript` and `--expected-script` are supplied. Blocks narration drift without spending on full multimodal review.
   10. `sentence_boundary`: deterministic transcript-side check for clips/Shorts that end mid-sentence, start mid-phrase, or leave an unintended long trailing gap. Skips unless `--transcript` is supplied.
   11. `cheap_broll`: VISION check (Anthropic) for B&W / grainy / scratched / low-res ARCHIVAL footage. Founder rule: "no B&W cheap broll." Saturation/grain math does NOT work — the silent-film stock was color-GRADED blue (sat 80-160), so this MUST be a vision call that judges old/degraded image QUALITY, not color grade. Cold-graded modern cinematic shots are FINE.
   12. `text_contrast`: deterministic OCR + luminance contrast pass for overlay text that blends into footage/background. Blocks sustained low-contrast readable text. This is the first UploadCheck productization of NTO's text-card safe-area/readability failures.
   13. `text_safe_area`: deterministic OCR word-box check against Shorts action chrome, bottom UI, and long-form title-safe margins. Blocks text that may be hidden by platform UI or cropped near edges.
   14. `garble`: ElevenLabs Scribe per window. BLOCK only on PARTIAL/garbled speech. MUSIC-ONLY audio (no VO — e.g. Shorts) yields no text and must NOT be flagged: if Scribe returns ~0 words it is tagged `MUSIC_OR_NONSPEECH` advisory, not garble.
   15. `twins`: sample frames; strict schema-locked vision call for duplicate-looking faces/people.
   16. `narration_match`: cadence-accurate Scribe word-timestamps -> per-frame vision illustrate-or-not -> contiguous mismatch > ~3 s is flagged.
   17. `omni_watch`: multimodal pass (Qwen3-Omni via DashScope; Anthropic frame-only fallback). Grounded on the real transcript + post-filters so it never invents narration. Supplements, never sole gate.
   18. `shorts_format`: specialized Shorts check for exact 1080x1920, 50-60s duration, no gutters, opening/footer text cards, safe-area text, and optional no-dialogue verification.
   ALWAYS re-validate any threshold against a KNOWN-GOOD and a KNOWN-BAD fixture before trusting it.
3. Scan the entire timeline, not only a few sampled regions.
4. For Shorts, also check aspect (`9:16`), audio presence, and caption-safe area.
5. If a derived asset fails, scan the upstream source master before rebuilding. Do not assume the source was already clean.
6. Report exact timestamps and defect classes, then identify the smallest clean replacement window if a rebuild is needed.

## Efficiency plan

- Search for existing checker scripts before inventing new ones.
- Reuse transcript/scribe and anchor artifacts instead of regenerating them.
- Start with deterministic local checks before any vision-model pass.
- If one upstream source master is clearly corrupted, stop scanning downstream variants until that source is cleared.
- Cache the freeze/timestamp findings so follow-up runs inspect only changed outputs.

## Pitfalls and fixes

- Symptom: a master is “QC pass” but the user finds a loop immediately.
  - Likely cause: spot-checking instead of full-timeline scan.
  - Fix: rerun the gate across the whole asset and inspect the flagged spans manually.

- Symptom: a translated master or short inherits hidden freezes.
  - Likely cause: the English source master was reused without a fresh scan.
  - Fix: gate the source master first, then rebuild derivatives from a clean window/source.

- Symptom: twins/repeated footage survive freeze detection.
  - Likely cause: repeated scenes are visually similar but not literal held frames.
  - Fix: use frame hashing plus structured twin/repetition checks, then purge or replace the offending pool assets.

- Symptom: the agent wants to explain away a user-heard defect because transcript checks look clean.
  - Likely cause: audible corruption or writing-doctrine mismatch is not caught by text-only checks.
  - Fix: treat the user’s listening note as authoritative and add/adjust the garble or narration-match check.

## Verification checklist

- The runner or equivalent per-check scripts produce a clear pass/fail result.
- The whole timeline was scanned.
- Report includes exact timestamps for every flagged defect.
- Source masters were checked if any derivative failed.
- Shorts report includes aspect, audio, text contrast, and caption-safe confirmation.
- No asset is called ship-ready without a clean final gate verdict plus a manual glance at the flagged spans.
