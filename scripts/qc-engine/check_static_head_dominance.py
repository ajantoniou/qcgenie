#!/usr/bin/env python3
"""
CHECK - STATIC HEAD DOMINANCE.
Blocks manifest rows where a portrait/talking-head/single-character shot is held too long without
b-roll, graphic/source-card relief, visible action, or explicit approval. This is deterministic,
sidecar-only, and model-free. It skips when no manifest is supplied.

Exit 0 = clean, 1 = static dominance found, 0/skip when no manifest is supplied.
Usage: check_static_head_dominance.py MEDIA [--manifest storybook.json] [--json out.json]
"""
import argparse
import json
import os
import re
import sys


MAX_STATIC_SECONDS = 20.0

CLASS_KEYS = ("visual_class", "visual_type", "type", "shot_type", "asset_type", "clip_type", "lane")
FILE_KEYS = ("visual_file", "file", "path", "clip", "src", "asset", "asset_path")
MOTION_KEYS = ("motion", "movement", "camera_motion", "action", "activity", "animation", "visible_motion")
PURPOSE_KEYS = ("purpose", "intent", "notes", "description", "prompt", "caption")
APPROVAL_KEYS = ("founder_approved", "approved_static", "static_ok", "deliberate_static", "approved", "qc_approved")
DURATION_KEYS = ("duration", "dur", "duration_s", "seconds", "length_s")
START_KEYS = ("t_start", "start", "start_s", "time")
END_KEYS = ("t_end", "end", "end_s")

STATIC_TERMS = (
    "portrait",
    "talking head",
    "talking-head",
    "headshot",
    "head shot",
    "closeup",
    "close up",
    "single character",
    "single-character",
    "lip sync",
    "lip-sync",
    "hedra",
    "face",
    "character reference",
    "studio portrait",
    "still",
    "subtle drift",
    "slow push",
    "push in",
    "ken burns",
)

RELIEF_TERMS = (
    "broll",
    "b-roll",
    "archive",
    "archival",
    "remotion",
    "graphic",
    "source card",
    "source-card",
    "text card",
    "text-card",
    "info card",
    "info-card",
    "citation",
    "scripture",
    "quote card",
    "quote-card",
    "lower third",
    "diagram",
    "map",
    "establishing",
    "landscape",
    "crowd",
    "wide scene",
    "wide-shot",
    "wide shot",
    "no face",
    "no-face",
)

ACTION_TERMS = (
    "walking",
    "walk",
    "running",
    "run",
    "ritual",
    "working",
    "writing",
    "teaching crowd",
    "crowd motion",
    "continuous action",
    "visible action",
    "camera move",
    "dolly",
    "tracking",
    "pan",
    "orbit",
    "weather",
    "rain",
    "wind",
    "fire",
    "water",
    "market",
    "procession",
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
    return str(value).strip().lower() in {"1", "true", "yes", "y", "approved", "ok", "allow", "allowed"}


def normalize(value):
    text = str(value or "").strip().lower()
    text = re.sub(r"[_/.-]+", " ", text)
    text = re.sub(r"[^a-z0-9 ]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def contains_any(text, terms):
    normalized = normalize(text)
    return any(term in normalized for term in terms)


def joined_fields(row, keys):
    values = []
    for key in keys:
        value = row.get(key)
        if value not in (None, ""):
            values.append(str(value))
    return " ".join(values)


def duration_for(item):
    duration = parse_float(first_value(item, DURATION_KEYS))
    if duration is not None:
        return duration
    start = parse_float(first_value(item, START_KEYS))
    end = parse_float(first_value(item, END_KEYS))
    if start is not None and end is not None and end >= start:
        return end - start
    return None


def load_manifest(path):
    if not path:
        return []
    try:
        data = json.load(open(path, "r", encoding="utf8"))
    except Exception:
        return []
    rows = []
    for row_path, item in flatten_json(data):
        duration = duration_for(item)
        if duration is None:
            continue
        start = parse_float(first_value(item, START_KEYS))
        visual_file = first_value(item, FILE_KEYS)
        visual_class = first_value(item, CLASS_KEYS)
        motion = joined_fields(item, MOTION_KEYS)
        purpose = joined_fields(item, PURPOSE_KEYS)
        approved = any(truthy(item.get(key)) for key in APPROVAL_KEYS)
        rows.append({
            "path": row_path,
            "duration": duration,
            "start": start,
            "visual_file": str(visual_file) if visual_file else None,
            "visual_class": str(visual_class) if visual_class else "",
            "motion": motion,
            "purpose": purpose,
            "approved": approved,
            "raw_text": " ".join(str(value) for value in item.values() if value not in (None, "")),
        })
    return rows


def is_relief(row):
    text = " ".join([row["visual_class"], row["visual_file"] or "", row["purpose"]])
    return contains_any(text, RELIEF_TERMS)


def has_visible_action(row):
    text = " ".join([row["motion"], row["purpose"], row["visual_class"]])
    return contains_any(text, ACTION_TERMS)


def looks_static_head(row):
    text = " ".join([row["visual_class"], row["visual_file"] or "", row["motion"], row["purpose"], row["raw_text"]])
    return contains_any(text, STATIC_TERMS)


def manifest_findings(rows):
    findings = []
    for row in rows:
        if row["duration"] <= MAX_STATIC_SECONDS:
            continue
        if row["approved"] or is_relief(row) or has_visible_action(row):
            continue
        if not looks_static_head(row):
            continue
        finding = {
            "label": "STATIC_HEAD_DOMINANCE",
            "reason": "Static portrait/talking-head shot is held too long without b-roll, graphic, source-card, or visible action relief.",
            "action": "Insert b-roll/graphic/source-card relief, shorten the shot, or replace it with visible motion/action before upload.",
            "manifest_path": row["path"],
            "duration": round(row["duration"], 2),
        }
        if row["start"] is not None:
            finding["t_start"] = round(row["start"], 2)
        if row["visual_file"]:
            finding["visual_file"] = row["visual_file"]
        if row["visual_class"]:
            finding["visual_class"] = row["visual_class"]
        findings.append(finding)
    return findings[:20]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("media")
    parser.add_argument("--manifest", default=None)
    parser.add_argument("--json", default=None)
    args = parser.parse_args()

    if not args.manifest:
        result = {
            "check": "static_head_dominance",
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
            "check": "static_head_dominance",
            "media": args.media,
            "manifest": args.manifest,
            "manifest_entries": len(rows),
            "max_static_seconds": MAX_STATIC_SECONDS,
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
