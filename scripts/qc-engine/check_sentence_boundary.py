#!/usr/bin/env python3
"""
CHECK - SENTENCE BOUNDARY.
Blocks clips/shorts/excerpts that end mid-word or mid-sentence when a transcript sidecar is supplied.
This is the margin-safe UploadCheck version of the NTO Shorts sentence-boundary gate: deterministic,
model-free, and skipped when no transcript is available.

Exit 0 = clean, 1 = boundary issue found, 0/skip when no transcript is supplied.
Usage: check_sentence_boundary.py MEDIA [--transcript transcript.txt|words.json] [--min-preroll 0.3] [--max-end-gap 1.0] [--json out.json]
"""
import argparse
import json
import os
import re
import subprocess
import sys


SENTENCE_END_RE = re.compile(r"""[.!?]["')\]]*$""")
BAD_END_RE = re.compile(r"""(?:[-–—,:;]|\b(?:and|but|or|because|so|that|which|who|when|if|to|of|the|a|an))["')\]]*$""", re.I)


def media_duration(path):
    try:
        out = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path],
            capture_output=True,
            text=True,
            check=False,
        ).stdout.strip()
        return float(out) if out else None
    except Exception:
        return None


def item_text(item):
    if isinstance(item, dict):
        return str(item.get("text") or item.get("word") or item.get("token") or "")
    return str(item)


def word_times(item):
    if not isinstance(item, dict):
        return None
    start = item.get("start", item.get("start_time", item.get("startTime")))
    end = item.get("end", item.get("end_time", item.get("endTime")))
    try:
        return float(start), float(end)
    except (TypeError, ValueError):
        return None


def load_transcript(path):
    raw = open(path, "r", encoding="utf8").read()
    words = []
    text = raw
    if path.lower().endswith(".json"):
        data = json.loads(raw)
        if isinstance(data, list):
            words = [item for item in data if item_text(item).strip()]
            text = " ".join(item_text(item) for item in words)
        elif isinstance(data, dict):
            if isinstance(data.get("words"), list):
                words = [item for item in data["words"] if item_text(item).strip()]
            for key in ("text", "transcript"):
                if data.get(key):
                    text = str(data[key])
                    break
            else:
                text = " ".join(item_text(item) for item in words) if words else raw
    return {
        "text": re.sub(r"\s+", " ", text).strip(),
        "words": words,
    }


def final_words(text, limit=12):
    words = re.findall(r"\b[\w']+\b|[.!?,:;—-]", text)
    return " ".join(words[-limit:])


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("media")
    parser.add_argument("--transcript", default=None)
    parser.add_argument("--min-preroll", type=float, default=0.3)
    parser.add_argument("--max-end-gap", type=float, default=1.0)
    parser.add_argument("--json", default=None)
    args = parser.parse_args()

    if not args.transcript:
        result = {
            "check": "sentence_boundary",
            "pass": None,
            "skipped": True,
            "reason": "no transcript supplied",
        }
    else:
        if not os.path.exists(args.transcript):
            raise FileNotFoundError(args.transcript)
        loaded = load_transcript(args.transcript)
        text = loaded["text"]
        words = loaded["words"]
        findings = []

        if not text:
            findings.append({
                "label": "EMPTY_TRANSCRIPT",
                "reason": "Transcript sidecar contains no spoken text.",
                "action": "Verify the clip has intended speech or supply a real transcript before upload.",
            })
        else:
            if not SENTENCE_END_RE.search(text):
                findings.append({
                    "label": "MID_SENTENCE_END",
                    "reason": "Transcript does not end on a sentence boundary.",
                    "evidence": final_words(text),
                    "action": "Extend or trim the clip so the spoken idea ends on a complete sentence.",
                })
            elif BAD_END_RE.search(text):
                findings.append({
                    "label": "WEAK_SENTENCE_END",
                    "reason": "Transcript appears to end on an unfinished phrase.",
                    "evidence": final_words(text),
                    "action": "Review the last sentence and cut at the completed thought.",
                })

        timed_words = [w for w in words if word_times(w)]
        duration = media_duration(args.media)
        if timed_words:
            first = timed_words[0]
            last = timed_words[-1]
            first_start, _ = word_times(first)
            _, last_end = word_times(last)
            if first_start < args.min_preroll:
                findings.append({
                    "label": "NO_PREROLL",
                    "reason": f"First transcript word starts at {first_start:.2f}s, below {args.min_preroll:.2f}s preroll.",
                    "evidence": item_text(first).strip(),
                    "action": "Add a short clean preroll or cut from a sentence boundary.",
                })
            if duration is not None:
                end_gap = duration - last_end
                if end_gap > args.max_end_gap:
                    findings.append({
                        "label": "LONG_END_GAP",
                        "reason": f"Last transcript word ends {end_gap:.2f}s before media ends.",
                        "evidence": item_text(last).strip(),
                        "action": "Trim trailing silence/fade or confirm the ending is intentional.",
                    })

        result = {
            "check": "sentence_boundary",
            "media": args.media,
            "transcript": args.transcript,
            "has_word_timestamps": bool(timed_words),
            "findings": findings,
            "pass": len(findings) == 0,
        }

    out = json.dumps(result, indent=2)
    if args.json:
        open(args.json, "w").write(out)
    print(out)
    sys.exit(0 if result.get("pass") is not False else 1)


if __name__ == "__main__":
    main()
