#!/usr/bin/env python3
"""
CHECK - REHOOK CADENCE.
Blocks manifest timelines with gaps over 90 seconds without a pattern interrupt, retention re-hook,
chapter turn, source/graphic card, or meaningful visual-class change. This is deterministic,
sidecar-only, and model-free. It skips when no manifest is supplied.

Exit 0 = clean, 1 = re-hook gap found, 0/skip when no manifest is supplied.
Usage: check_rehook_cadence.py MEDIA [--manifest storybook.json] [--json out.json]
"""
import argparse
import json
import os
import re
import sys


MAX_GAP_SECONDS = 90.0
START_KEYS = ("t_start", "start", "start_s", "time")
END_KEYS = ("t_end", "end", "end_s")
DURATION_KEYS = ("duration", "dur", "duration_s", "seconds", "length_s")
CLASS_KEYS = ("visual_class", "visual_type", "type", "shot_type", "asset_type", "clip_type", "lane")
TEXT_KEYS = ("rehook_text", "hook_text", "chapter_title", "text", "caption", "onscreen_text", "vo_text_excerpt", "vo_text")
REHOOK_KEYS = (
    "rehook",
    "re_hook",
    "rehook_present",
    "pattern_interrupt",
    "pattern_interrupt_present",
    "retention_hook",
    "retention_rehook",
    "chapter_turn",
    "chapter_break",
    "beat_turn",
    "visual_reset",
)
FILE_KEYS = ("visual_file", "file", "path", "clip", "src", "asset", "asset_path")

RESET_CLASSES = {
    "remotion",
    "source card",
    "source-card",
    "text card",
    "text-card",
    "graphic",
    "map",
    "diagram",
    "quote card",
    "quote-card",
    "chapter card",
    "chapter-card",
}

REHOOK_TERMS = (
    "rehook",
    "re hook",
    "pattern interrupt",
    "retention hook",
    "chapter turn",
    "chapter break",
    "beat turn",
    "but then",
    "here's the twist",
    "the twist",
    "new question",
    "source card",
    "quote card",
    "chapter card",
)


def flatten_json(value, path="root"):
    if isinstance(value, dict):
        yield path, value
        for key, child in value.items():
            yield from flatten_json(child, f"{path}.{key}")
    elif isinstance(value, list):
        for idx, child in enumerate(value):
            yield from flatten_json(child, f"{path}[{idx}]")


def first_value(item, keys):
    for key in keys:
        value = item.get(key)
        if value not in (None, ""):
            return value
    return None


def parse_float(value):
    try:
        return float(value)
    except Exception:
        return None


def truthy(value):
    if isinstance(value, bool):
        return value
    if value is None:
        return False
    return str(value).strip().lower() in {"1", "true", "yes", "y", "ok", "pass", "present", "reset"}


def normalize(value):
    text = str(value or "").strip().lower()
    text = re.sub(r"[_/.-]+", " ", text)
    text = re.sub(r"[^a-z0-9 ?!]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def contains_any(text, terms):
    normalized = normalize(text)
    return any(term in normalized for term in terms)


def joined_fields(item, keys):
    values = []
    for key in keys:
        value = item.get(key)
        if value not in (None, ""):
            if isinstance(value, (list, dict)):
                values.append(json.dumps(value, sort_keys=True))
            else:
                values.append(str(value))
    return " ".join(values)


def duration_for(item, start):
    duration = parse_float(first_value(item, DURATION_KEYS))
    if duration is not None:
        return duration
    end = parse_float(first_value(item, END_KEYS))
    if start is not None and end is not None and end >= start:
        return end - start
    return None


def is_reset(row, prev_class=None):
    text = " ".join([row["text"], row["visual_class"], str(row["visual_file"] or "")])
    if row["explicit_rehook"]:
        return True
    if contains_any(text, REHOOK_TERMS):
        return True
    if normalize(row["visual_class"]) in RESET_CLASSES:
        return True
    if prev_class and normalize(row["visual_class"]) and normalize(row["visual_class"]) != normalize(prev_class):
        return True
    return False


def load_manifest(path):
    if not path:
        return []
    try:
        data = json.load(open(path, "r", encoding="utf8"))
    except Exception:
        return []
    rows = []
    for row_path, item in flatten_json(data):
        start = parse_float(first_value(item, START_KEYS))
        if start is None:
            continue
        duration = duration_for(item, start)
        end = parse_float(first_value(item, END_KEYS))
        if end is None and duration is not None:
            end = start + duration
        if end is None:
            continue
        rows.append({
            "path": row_path,
            "start": start,
            "end": end,
            "duration": duration,
            "visual_file": first_value(item, FILE_KEYS),
            "visual_class": str(first_value(item, CLASS_KEYS) or ""),
            "text": joined_fields(item, TEXT_KEYS),
            "explicit_rehook": any(truthy(item.get(key)) for key in REHOOK_KEYS),
        })
    rows.sort(key=lambda row: (row["start"], row["end"]))
    return rows


def finding(gap_start, gap_end, row):
    return {
        "label": "REHOOK_CADENCE",
        "reason": f"Timeline goes {round(gap_end - gap_start, 2)} seconds without a pattern interrupt or retention re-hook.",
        "action": "Add a pattern interrupt, source/graphic card, chapter turn, visual reset, or explicit re-hook before upload.",
        "manifest_path": row["path"],
        "t_start": round(gap_start, 2),
        "t_end": round(gap_end, 2),
        "duration": round(gap_end - gap_start, 2),
        "visual_class": row["visual_class"],
    }


def manifest_findings(rows):
    if not rows:
        return [{
            "label": "REHOOK_CADENCE",
            "reason": "Manifest has no timed rows, so re-hook cadence cannot be verified.",
            "action": "Pass a timed storybook/edit manifest with pattern-interrupt or visual-class markers before upload.",
        }]

    findings = []
    last_reset = rows[0]["start"]
    prev_class = None
    for row in rows:
        if is_reset(row, prev_class):
            if row["start"] - last_reset > MAX_GAP_SECONDS:
                findings.append(finding(last_reset, row["start"], row))
            last_reset = row["start"]
        elif row["end"] - last_reset > MAX_GAP_SECONDS:
            findings.append(finding(last_reset, row["end"], row))
            last_reset = row["end"]
        if row["visual_class"]:
            prev_class = row["visual_class"]
    return findings[:20]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("media")
    parser.add_argument("--manifest", default=None)
    parser.add_argument("--json", default=None)
    args = parser.parse_args()

    if not args.manifest:
        result = {
            "check": "rehook_cadence",
            "pass": None,
            "skipped": True,
            "reason": "no manifest supplied",
        }
    else:
        if not os.path.exists(args.manifest):
            raise FileNotFoundError(args.manifest)
        rows = load_manifest(args.manifest)
        findings = manifest_findings(rows)
        result = {
            "check": "rehook_cadence",
            "media": args.media,
            "manifest": args.manifest,
            "manifest_entries": len(rows),
            "max_gap_seconds": MAX_GAP_SECONDS,
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
