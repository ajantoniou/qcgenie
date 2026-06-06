#!/usr/bin/env python3
"""
CHECK - SPOKEN PRODUCTION LEAKS.
Blocks transcript text that contains production artifacts: stage directions, URLs, markdown,
vendor/tool names, prompt language, or known wrong-name substitutions. This is a deterministic
transcript-side gate, intentionally cheap and model-free.

Exit 0 = clean, 1 = leak found, 0/skip when no transcript is supplied.
Usage: check_spoken_leaks.py MEDIA [--transcript transcript.txt|words.json] [--json out.json]
"""
import argparse
import json
import os
import re
import sys


PATTERNS = [
    ("URL_SPOKEN", re.compile(r"\bhttps?://|www\.|\.com\b|\.org\b|\.net\b", re.I), "Remove spoken URLs or move them to captions/description."),
    ("MARKDOWN_SPOKEN", re.compile(r"```|#{1,6}\s|\*\*|<!--|-->", re.I), "Remove markdown or production markup from the spoken track."),
    ("STAGE_DIRECTION_SPOKEN", re.compile(r"\[(?:pause|music|sfx|sound effect|cut|beat|b-roll|broll|caption|title card)[^\]]*\]", re.I), "Remove stage directions from narration or render them visually instead."),
    ("PROMPT_TEXT_SPOKEN", re.compile(r"\b(?:prompt|negative prompt|seed|midjourney|runway|generate an image|camera dolly|cinematic shot)\b", re.I), "Remove prompt/editing instructions from the spoken track."),
    ("VENDOR_NAME_SPOKEN", re.compile(r"\b(?:higgsfield|fal\.ai|elevenlabs|sora|kling|seedance|hedra|remotion|veo|runway)\b", re.I), "Remove vendor/tool names unless the episode intentionally discusses production tools."),
    ("WRONG_NAME_SUBSTITUTION", re.compile(r"\bmartian\b", re.I), "Check for wrong-name substitution, e.g. Marcion rendered as Martian."),
]


def load_transcript(path):
    if not path:
        return None
    if not os.path.exists(path):
        raise FileNotFoundError(path)
    raw = open(path, "r", encoding="utf8").read()
    if path.lower().endswith(".json"):
        data = json.loads(raw)
        if isinstance(data, list):
            return " ".join(str(item.get("text", "")) if isinstance(item, dict) else str(item) for item in data)
        if isinstance(data, dict):
            if isinstance(data.get("words"), list):
                return " ".join(str(item.get("text", "")) for item in data["words"] if isinstance(item, dict))
            return str(data.get("text") or data.get("transcript") or raw)
    return raw


def context(text, start, end, width=80):
    lo = max(0, start - width // 2)
    hi = min(len(text), end + width // 2)
    return re.sub(r"\s+", " ", text[lo:hi]).strip()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("media")
    parser.add_argument("--transcript", default=None)
    parser.add_argument("--json", default=None)
    args = parser.parse_args()

    if not args.transcript:
        result = {
            "check": "spoken_leaks",
            "pass": None,
            "skipped": True,
            "reason": "no transcript supplied",
        }
    else:
        text = load_transcript(args.transcript)
        findings = []
        for label, pattern, action in PATTERNS:
            for match in pattern.finditer(text):
                findings.append({
                    "label": label,
                    "reason": f"Transcript contains {label.lower().replace('_', ' ')}.",
                    "evidence": context(text, match.start(), match.end()),
                    "action": action,
                })
                break
        result = {
            "check": "spoken_leaks",
            "media": args.media,
            "transcript": args.transcript,
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
