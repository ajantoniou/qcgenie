#!/usr/bin/env python3
"""
CHECK - SCRIPT FAITHFULNESS.
Compares an expected locked script against the actual transcript using word error rate (WER).
This is deterministic and cheap; it assumes callers supply both sidecars.

Exit 0 = faithful, 1 = transcript drift found, 0/skip when inputs are missing.
Usage: check_script_faithfulness.py MEDIA --transcript transcript.txt|json --expected-script script.txt|json [--max-wer 0.12] [--json out.json]
"""
import argparse
import json
import os
import re
import sys


def load_text(path):
    raw = open(path, "r", encoding="utf8").read()
    if path.lower().endswith(".json"):
        data = json.loads(raw)
        if isinstance(data, list):
            return " ".join(item_text(item) for item in data)
        if isinstance(data, dict):
            if isinstance(data.get("words"), list):
                return " ".join(item_text(item) for item in data["words"])
            for key in ("text", "transcript", "script", "expected_script", "expectedScript"):
                if data.get(key):
                    return str(data[key])
    return raw


def item_text(item):
    if isinstance(item, dict):
        return str(item.get("text") or item.get("word") or item.get("token") or "")
    return str(item)


def normalize_words(text):
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\[(?:pause|music|sfx|sound effect|cut|beat|b-roll|broll|caption|title card)[^\]]*\]", " ", text, flags=re.I)
    text = text.lower()
    text = re.sub(r"[^a-z0-9']+", " ", text)
    return [word.strip("'") for word in text.split() if word.strip("'")]


def levenshtein(a, b):
    if not a:
        return len(b)
    if not b:
        return len(a)
    prev = list(range(len(b) + 1))
    for i, aw in enumerate(a, 1):
        cur = [i]
        for j, bw in enumerate(b, 1):
            cost = 0 if aw == bw else 1
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost))
        prev = cur
    return prev[-1]


def snippet(words, limit=24):
    return " ".join(words[:limit]) + ("..." if len(words) > limit else "")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("media")
    parser.add_argument("--transcript", default=None)
    parser.add_argument("--expected-script", default=None)
    parser.add_argument("--max-wer", type=float, default=0.12)
    parser.add_argument("--json", default=None)
    args = parser.parse_args()

    if not args.transcript or not args.expected_script:
        result = {
            "check": "script_faithfulness",
            "pass": None,
            "skipped": True,
            "reason": "transcript and expected script are required",
        }
    else:
        if not os.path.exists(args.transcript):
            raise FileNotFoundError(args.transcript)
        if not os.path.exists(args.expected_script):
            raise FileNotFoundError(args.expected_script)

        expected_words = normalize_words(load_text(args.expected_script))
        transcript_words = normalize_words(load_text(args.transcript))
        edits = levenshtein(expected_words, transcript_words)
        denominator = max(len(expected_words), 1)
        wer = edits / denominator
        failed = bool(expected_words) and wer > args.max_wer
        findings = []
        if failed:
            findings.append({
                "label": "SCRIPT_DRIFT",
                "reason": f"Transcript differs from expected script (WER {wer:.3f} > threshold {args.max_wer:.3f}).",
                "expected_words": len(expected_words),
                "transcript_words": len(transcript_words),
                "edits": edits,
                "wer": round(wer, 4),
                "max_wer": args.max_wer,
                "expected_sample": snippet(expected_words),
                "transcript_sample": snippet(transcript_words),
                "action": "Re-render or edit the narration so the spoken transcript matches the locked script.",
            })

        result = {
            "check": "script_faithfulness",
            "media": args.media,
            "transcript": args.transcript,
            "expected_script": args.expected_script,
            "expected_words": len(expected_words),
            "transcript_words": len(transcript_words),
            "edits": edits,
            "wer": round(wer, 4),
            "max_wer": args.max_wer,
            "findings": findings,
            "pass": not failed,
        }

    out = json.dumps(result, indent=2)
    if args.json:
        open(args.json, "w").write(out)
    print(out)
    sys.exit(0 if result.get("pass") is not False else 1)


if __name__ == "__main__":
    main()
