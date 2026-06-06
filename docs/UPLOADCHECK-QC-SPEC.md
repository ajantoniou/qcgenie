# UploadCheck QC Spec

Source: NTO production QC handoff, captured from the current NTO scripts and intended as the private product contract for porting high-value production gates into UploadCheck. Public copy should describe outcomes and broad categories, not expose every threshold or implementation detail.

## Product Contract

```http
POST /v1/check
Content-Type: application/json
Authorization: Bearer <workspace_api_key>
```

Request shape:

```json
{
  "media": "<file, upload_id, signed_url, youtube_url, or inline media payload>",
  "kind": "video"
}
```

Response shape:

```json
{
  "verdict": "PASS|BLOCK|NEEDS_REVIEW",
  "flags": [
    {
      "gate": "G_LOOP",
      "t_start": 12.0,
      "t_end": 15.5,
      "severity": "HARD",
      "detail": "reused or looped shot",
      "evidence_url": "https://..."
    }
  ],
  "duration_s": 905.53
}
```

Agent contract: the repair agent fixes only returned flagged spans, then reruns UploadCheck before any publish-ready or upload-ready claim.

## Video Gates

| Gate | What It Catches | Severity | Tunable Thresholds |
| --- | --- | --- | --- |
| `G_LOOP` | Reused or looped shot by aHash + dHash frame comparison; flag pairs at least `1.5s` apart and within the Hamming threshold. | HARD | `loop-step=1.0`, `thresh=8` |
| `G_HOLD` | Frozen run longer than `3s` using ffmpeg `freezedetect`; this is the real intra-clip-loop catcher. | HARD | `freeze-min=3.0` |
| `G_TWIN` | Clone-crowd / repeated-character crowd failure. Union of LLM-vision at `1920px` with 5-vote consensus plus face-embedding detection. | HARD | cosine `0.55`, `min_repeat=3` |
| `G_HANDS` | Bad hands or malformed limbs in generated footage. | advisory -> strict | Gate-specific confidence routing |
| `G_TEXT` | Garbled text, watermarks, intertitles, or unintended readable text in generated/library plates. | advisory -> strict | Gate-specific confidence routing |
| `G_ETHNICITY` | Cast/style-lock drift from customer-defined visual authenticity rules. | advisory -> strict | Customer-specific watchlist |
| `G_IDENTIFIER` | Speaker does not match visible face or identity binding. | advisory -> strict | Manifest plus vision confidence |

## Audio Gates

| Gate | What It Catches | Severity | Tunable Thresholds |
| --- | --- | --- | --- |
| `WER_FAITHFULNESS` | Narration/transcript drift from locked script. | HARD | `max-wer=0.03` |
| `CROSS_ASR_GARBLE` | Suspected garble from disagreement between Whisper and ElevenLabs Scribe-style transcription. | HARD/NEEDS_REVIEW | Cross-ASR divergence and confidence |
| `MID_SENTENCE_CUT` | Clip ends mid-word or mid-sentence. | HARD for Shorts/extracted clips | Needs deterministic sentence-boundary rule |
| `SILENT_GAP` | Unwanted silent gaps or dead air. | HARD/WATCH by profile | Customer/profile threshold |

## Critical Product Lessons

1. Verify pixels and audio, never only a map. A map-level QC pass can miss a rendered loop; the final media file is the source of truth.
2. Fail loud, never silent-skip. Missing model keys, zero decoded frames, unreadable media, or empty sidecar extraction should return `NEEDS_REVIEW` or `BLOCK`, not `PASS`.
3. Use full resolution for clone/crowd checks. Downscaling can hide the exact artifact the product needs to catch.
4. Return timestamps and evidence frames. The fix-the-flags loop depends on precise spans and inspectable proof.
5. Route uncertainty by confidence. The 5-vote clone gate produced false positives on a man reading a book, a synagogue, and a seated circle; low-confidence cases should become `NEEDS_REVIEW`, not automatic `BLOCK`.

## Suggested Port Order

1. Ship `G_LOOP`, `G_HOLD`, audio WER/faithfulness, and cross-ASR garble first. These are cheap, deterministic, and high-value.
2. Add `MID_SENTENCE_CUT` and `SILENT_GAP` as profile-aware deterministic gates.
3. Add clone-crowd as v2 once precision is tuned with negative fixtures: man-reading-book, synagogue, and seated-circle; keep the real b08 food-crowd clone case as the positive fixture.

## Reference Implementations

Use these NTO scripts as source implementations to lift into UploadCheck handlers and tests:

- `/Applications/DrAntoniou Projects/AgentCompanies/companies/NTO/scripts/qc-gates-cinema.py`
- `/Applications/DrAntoniou Projects/AgentCompanies/companies/NTO/scripts/clone_crowd_detect.py`
- `/Applications/DrAntoniou Projects/AgentCompanies/companies/NTO/scripts/vo-audio-qc.py`

