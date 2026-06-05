---
name: nto-video-qc-gate
description: Run or rebuild the NTO full-video QC gate when a master/short may have garble, loop-freeze, twins, or narration/visual drift. Use for Episode 1/2 masters, language versions, and Shorts before upload.
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
- the user reports looping, freezes, repeated footage, twins, garble, or narration mismatch
- a language master or derived short was built from an older source master

Do not use this as a substitute for normal quick iteration while a clip is still obviously rough. Use it before upload/publish or when diagnosing a QC miss.

## Inputs / context to gather

1. Identify the exact target asset path and nearby render folder.
2. Search for existing gate files first:
   - `check_garble.py`
   - `check_loop_freeze.py`
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
2. The scripts live in `scripts/` next to this file. Run `python3 scripts/run_gate.py VIDEO --checks loop_freeze,cheap_broll,garble,twins,narration_match,omni_watch [--lang eng] [--fast]` for one verdict. The checks (build them in this order if missing):
   1. `loop_freeze`: ffmpeg freeze detection (`-50dB` + sensitive `-60dB`) for held frames. `--detect-repeats` adds opt-in perceptual reused-shot detection (noisy; off by default — the build-time clip ledger is the real anti-reuse control).
   2. `cheap_broll`: VISION check (Anthropic) for B&W / grainy / scratched / low-res ARCHIVAL footage. Founder rule: "no B&W cheap broll." Saturation/grain math does NOT work — the silent-film stock was color-GRADED blue (sat 80-160), so this MUST be a vision call that judges old/degraded image QUALITY, not color grade. Cold-graded modern cinematic shots are FINE.
   3. `garble`: ElevenLabs Scribe per window. BLOCK only on PARTIAL/garbled speech. MUSIC-ONLY audio (no VO — e.g. Shorts) yields no text and must NOT be flagged: if Scribe returns ~0 words it is tagged `MUSIC_OR_NONSPEECH` advisory, not garble.
   4. `twins`: sample frames; strict schema-locked vision call for duplicate-looking faces/people.
   5. `narration_match`: cadence-accurate Scribe word-timestamps -> per-frame vision illustrate-or-not -> contiguous mismatch > ~3 s is flagged.
   6. `omni_watch`: multimodal pass (Qwen3-Omni via DashScope; Anthropic frame-only fallback). Grounded on the real transcript + post-filters so it never invents narration. Supplements, never sole gate.
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
- Shorts report includes aspect, audio, and caption-safe confirmation.
- No asset is called ship-ready without a clean final gate verdict plus a manual glance at the flagged spans.
