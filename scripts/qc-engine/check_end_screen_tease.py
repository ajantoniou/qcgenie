#!/usr/bin/env python3
"""
CHECK - END SCREEN TEASE.
Blocks manifest timelines where the final window is missing a next-video tease, CTA, footer card, or
episode handoff. This is deterministic, sidecar-only, and model-free. It skips when no manifest is
supplied.

Exit 0 = clean, 1 = missing end-screen tease, 0/skip when no manifest is supplied.
Usage: check_end_screen_tease.py MEDIA [--manifest storybook.json] [--json out.json]
"""
import argparse
import json
import os
import re
import subprocess
import sys


FINAL_WINDOW_SECONDS = 15.0
START_KEYS = ("t_start", "start", "start_s", "time")
END_KEYS = ("t_end", "end", "end_s")
DURATION_KEYS = ("duration", "dur", "duration_s", "seconds", "length_s")
CLASS_KEYS = ("visual_class", "visual_type", "type", "shot_type", "asset_type", "clip_type", "lane")
TEXT_KEYS = (
    "end_screen_text",
    "footer_text",
    "cta_text",
    "outro_text",
    "handoff_text",
    "next_episode_tease",
    "next_video_tease",
    "text",
    "caption",
    "onscreen_text",
    "vo_text_excerpt",
    "vo_text",
)
CTA_KEYS = (
    "has_end_screen",
    "end_screen_present",
    "has_cta",
    "cta_present",
    "footer_card",
    "footer_card_present",
    "next_episode_tease_present",
    "next_video_tease_present",
    "episode_handoff_present",
    "end_screen_ok",
)
MISSING_KEYS = ("missing_end_screen", "missing_cta", "missing_footer_card", "missing_next_episode_tease")
FILE_KEYS = ("visual_file", "file", "path", "clip", "src", "asset", "asset_path")

CTA_TERMS = (
    "next episode",
    "next video",
    "watch next",
    "watch the next",
    "full episode",
    "full video",
    "continue",
    "part 2",
    "part two",
    "coming next",
    "subscribe",
    "follow",
    "newtestamentonly",
    "@newtestamentonly",
    "episode handoff",
    "end screen",
    "footer card",
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
    return str(value).strip().lower() in {"1", "true", "yes", "y", "ok", "pass", "present", "matched"}


def falsey(value):
    if isinstance(value, bool):
        return not value
    if value is None:
        return False
    return str(value).strip().lower() in {"0", "false", "no", "n", "fail", "missing", "absent", "none"}


def normalize(value):
    text = str(value or "").strip().lower()
    text = re.sub(r"[_/.-]+", " ", text)
    text = re.sub(r"[^a-z0-9 @]+", " ", text)
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


def media_duration(path):
    try:
        out = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path],
            capture_output=True,
            text=True,
            timeout=10,
        ).stdout.strip()
        return float(out) if out else None
    except Exception:
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
            "has_cta": any(truthy(item.get(key)) for key in CTA_KEYS),
            "missing_cta": any(falsey(item.get(key)) for key in CTA_KEYS) or any(truthy(item.get(key)) for key in MISSING_KEYS),
        })
    return rows


def row_has_cta(row):
    text = " ".join([row["text"], row["visual_class"], str(row["visual_file"] or "")])
    return row["has_cta"] or contains_any(text, CTA_TERMS)


def final_rows(rows, media_seconds):
    if not rows:
        return []
    total = media_seconds or max(row["end"] for row in rows)
    window_start = max(0, total - FINAL_WINDOW_SECONDS)
    return [row for row in rows if row["end"] > window_start and row["start"] < total + 0.25]


def finding(reason, action, row=None):
    out = {
        "label": "END_SCREEN_TEASE",
        "reason": reason,
        "action": action,
    }
    if row:
        out["manifest_path"] = row["path"]
        out["t_start"] = round(row["start"], 2)
        out["t_end"] = round(row["end"], 2)
        if row["visual_file"]:
            out["visual_file"] = str(row["visual_file"])
        if row["visual_class"]:
            out["visual_class"] = row["visual_class"]
        if row["text"]:
            out["end_text"] = row["text"][:180]
    return out


def manifest_findings(rows, media_seconds):
    end_rows = final_rows(rows, media_seconds)
    if not end_rows:
        return [finding(
            "No manifest row covers the final window, so the end-screen tease/CTA cannot be verified.",
            "Add a final-window end screen, footer card, CTA, or next-episode handoff before upload.",
        )]
    explicit_missing = next((row for row in end_rows if row["missing_cta"]), None)
    if explicit_missing:
        return [finding(
            "Final window is explicitly marked as missing an end-screen tease or CTA.",
            "Add a next-video tease, footer card, CTA, or episode handoff before upload.",
            explicit_missing,
        )]
    if any(row_has_cta(row) for row in end_rows):
        return []
    return [finding(
        "Final window does not declare a next-video tease, CTA, footer card, or episode handoff.",
        "Add a clear end-screen tease/CTA or mark the final manifest row with the verified handoff.",
        end_rows[-1],
    )]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("media")
    parser.add_argument("--manifest", default=None)
    parser.add_argument("--json", default=None)
    args = parser.parse_args()

    if not args.manifest:
        result = {
            "check": "end_screen_tease",
            "pass": None,
            "skipped": True,
            "reason": "no manifest supplied",
        }
    else:
        if not os.path.exists(args.manifest):
            raise FileNotFoundError(args.manifest)
        rows = load_manifest(args.manifest)
        media_seconds = media_duration(args.media)
        findings = manifest_findings(rows, media_seconds)
        result = {
            "check": "end_screen_tease",
            "media": args.media,
            "manifest": args.manifest,
            "manifest_entries": len(rows),
            "media_seconds": media_seconds,
            "final_window_seconds": FINAL_WINDOW_SECONDS,
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
