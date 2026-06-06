#!/usr/bin/env python3
"""
CHECK - DIALOGUE IN MUSIC SHORT.
Blocks music-only Shorts when a supplied transcript sidecar contains spoken dialogue. This is the
margin-safe companion to shorts_format's optional ASR check: if the pipeline already has transcript
text, fail the Short without spending on hosted transcription.

Exit 0 = clean, 1 = dialogue found, 0/skip when no transcript is supplied.
Usage: check_dialogue_in_music_short.py MEDIA [--transcript transcript.txt|words.json] [--json out.json]
"""
import argparse
import json
import os
import re
import sys


NON_SPEECH_RE = re.compile(
    r"""
    \[(?:music|song|sfx|sound|instrumental|silence|beat|applause|laughter)[^\]]*\]
    |\(?(?:music|instrumental|background\s+music|no\s+speech|non[- ]speech|silence)\)?
    |[♪♫♬]+
    """,
    re.I | re.X,
)
WORD_RE = re.compile(r"\b[a-zA-Z][a-zA-Z']+\b")


def item_text(item):
    if isinstance(item, dict):
        return str(item.get("text") or item.get("word") or item.get("token") or "")
    return str(item)


def load_transcript(path):
    if not path:
        return None
    if not os.path.exists(path):
        raise FileNotFoundError(path)
    raw = open(path, "r", encoding="utf8").read()
    if path.lower().endswith(".json"):
        data = json.loads(raw)
        if isinstance(data, list):
            return " ".join(item_text(item) for item in data)
        if isinstance(data, dict):
            for key in ("text", "transcript"):
                if data.get(key):
                    return str(data[key])
            if isinstance(data.get("words"), list):
                return " ".join(item_text(item) for item in data["words"])
    return raw


def speech_words(text):
    stripped = NON_SPEECH_RE.sub(" ", text or "")
    stripped = re.sub(r"\s+", " ", stripped).strip()
    return WORD_RE.findall(stripped)


def evidence(text, limit=140):
    stripped = NON_SPEECH_RE.sub(" ", text or "")
    stripped = re.sub(r"\s+", " ", stripped).strip()
    return stripped[:limit]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("media")
    parser.add_argument("--transcript", default=None)
    parser.add_argument("--min-words", type=int, default=2)
    parser.add_argument("--json", default=None)
    args = parser.parse_args()

    if not args.transcript:
        result = {
            "check": "dialogue_in_music_short",
            "pass": None,
            "skipped": True,
            "reason": "no transcript supplied",
        }
    else:
        text = load_transcript(args.transcript)
        words = speech_words(text)
        findings = []
        if len(words) >= args.min_words:
            findings.append({
                "label": "DIALOGUE_IN_MUSIC_SHORT",
                "reason": f"Music-only Short has {len(words)} transcribed speech words.",
                "evidence": evidence(text),
                "action": "Remove the spoken dialogue, switch to a narration Short format, or mark the Short as dialogue-intended before upload.",
            })
        result = {
            "check": "dialogue_in_music_short",
            "media": args.media,
            "transcript": args.transcript,
            "speech_word_count": len(words),
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
