#!/usr/bin/env python3
"""
CHECK - PRONUNCIATION / TERM WATCHLIST.
Blocks customer-supplied banned words, wrong-name substitutions, and likely misrendered terms in
transcript text. This is deterministic and cheap; it assumes a transcript/script sidecar is supplied.

Watchlist JSON shape:
{
  "terms": [
    {"expected": "Marcion", "banned": ["Martian", "Marshun"]},
    {"term": "Sinope", "misrenderings": ["sin nope"]}
  ],
  "banned": ["ElevenLabs"]
}

Exit 0 = clean, 1 = watchlist hit, 0/skip when transcript or watchlist is missing.
Usage: check_pronunciation_watchlist.py MEDIA --transcript transcript.txt --watchlist watchlist.json [--json out.json]
"""
import argparse
import json
import os
import re
import sys


def load_transcript(path):
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


def load_watchlist(path):
    data = json.load(open(path, "r", encoding="utf8"))
    entries = []
    for item in data.get("terms", []) if isinstance(data, dict) else []:
        expected = item.get("expected") or item.get("term") or item.get("name")
        banned = item.get("banned") or item.get("misrenderings") or item.get("wrong") or []
        if isinstance(banned, str):
            banned = [banned]
        for bad in banned:
            entries.append({"expected": expected or "", "banned": str(bad)})
    for bad in data.get("banned", []) if isinstance(data, dict) else []:
        entries.append({"expected": "", "banned": str(bad)})
    return [entry for entry in entries if entry["banned"].strip()]


def context(text, start, end, width=80):
    lo = max(0, start - width // 2)
    hi = min(len(text), end + width // 2)
    return re.sub(r"\s+", " ", text[lo:hi]).strip()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("media")
    parser.add_argument("--transcript", default=None)
    parser.add_argument("--watchlist", default=None)
    parser.add_argument("--json", default=None)
    args = parser.parse_args()

    if not args.transcript or not args.watchlist:
        result = {
            "check": "pronunciation_watchlist",
            "pass": None,
            "skipped": True,
            "reason": "transcript and watchlist are required",
        }
    else:
        if not os.path.exists(args.transcript):
            raise FileNotFoundError(args.transcript)
        if not os.path.exists(args.watchlist):
            raise FileNotFoundError(args.watchlist)
        text = load_transcript(args.transcript)
        entries = load_watchlist(args.watchlist)
        findings = []
        for entry in entries:
            pattern = re.compile(rf"\b{re.escape(entry['banned'])}\b", re.I)
            match = pattern.search(text)
            if match:
                findings.append({
                    "label": "WATCHLIST_TERM_HIT",
                    "expected": entry["expected"],
                    "banned": entry["banned"],
                    "reason": f"Transcript contains watchlist term '{entry['banned']}'.",
                    "evidence": context(text, match.start(), match.end()),
                    "action": f"Re-render or edit the audio so '{entry['expected'] or entry['banned']}' is not misrendered as '{entry['banned']}'.",
                })
        result = {
            "check": "pronunciation_watchlist",
            "media": args.media,
            "transcript": args.transcript,
            "watchlist": args.watchlist,
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
