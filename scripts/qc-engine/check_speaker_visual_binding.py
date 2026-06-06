#!/usr/bin/env python3
"""
CHECK - SPEAKER / VISUAL BINDING.
Blocks edit-manifest rows where a named speaker's voice is paired with another named character's face.
This is deterministic, sidecar-only, and model-free. It skips when no manifest is supplied.

Exit 0 = clean, 1 = mismatch found, 0/skip when no manifest is supplied.
Usage: check_speaker_visual_binding.py MEDIA [--manifest storybook.json] [--json out.json]
"""
import argparse
import json
import os
import re
import sys


SPEAKER_KEYS = ("speaker", "voice", "voice_speaker", "narrator", "vo_speaker", "spoken_by")
VISUAL_KEYS = ("visual_character", "character", "on_screen_character", "face_character", "visible_character", "person_on_screen", "shot_character")
NEUTRAL_VALUES = {
    "neutral",
    "speaker-neutral",
    "speaker_neutral",
    "broll",
    "b-roll",
    "archive",
    "archival",
    "remotion",
    "text",
    "text-card",
    "text_card",
    "source-card",
    "source_card",
    "none",
    "no-face",
    "noface",
    "background",
    "crowd",
    "establishing",
}


def flatten_json(value, path="root"):
    if isinstance(value, dict):
        yield path, value
        for key, child in value.items():
            yield from flatten_json(child, f"{path}.{key}")
    elif isinstance(value, list):
        for idx, child in enumerate(value):
            yield from flatten_json(child, f"{path}[{idx}]")


def load_manifest(path):
    if not path:
        return []
    try:
        data = json.load(open(path, "r", encoding="utf8"))
    except Exception:
        return []
    rows = []
    for row_path, item in flatten_json(data):
        speaker = first_value(item, SPEAKER_KEYS)
        visual = first_value(item, VISUAL_KEYS)
        if not speaker or not visual:
            continue
        start = item.get("t_start") or item.get("start") or item.get("start_s") or item.get("time")
        end = item.get("t_end") or item.get("end") or item.get("end_s")
        visual_file = item.get("visual_file") or item.get("file") or item.get("path") or item.get("clip") or item.get("src")
        rows.append({
            "path": row_path,
            "speaker": str(speaker),
            "visual_character": str(visual),
            "start": parse_float(start),
            "end": parse_float(end),
            "visual_file": str(visual_file) if visual_file else None,
        })
    return rows


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


def normalize_name(value):
    text = str(value or "").strip().lower()
    text = re.sub(r"[_-]+", " ", text)
    text = re.sub(r"\b(?:voice|speaker|face|visual|character|shot|on screen)\b", " ", text)
    text = re.sub(r"[^a-z0-9 ]+", " ", text)
    words = [w for w in text.split() if w]
    return " ".join(words)


def is_neutral(value):
    normalized = normalize_name(value)
    if not normalized:
        return True
    compact = normalized.replace(" ", "_")
    return normalized in NEUTRAL_VALUES or compact in NEUTRAL_VALUES


def names_match(speaker, visual):
    speaker_name = normalize_name(speaker)
    visual_name = normalize_name(visual)
    if not speaker_name or not visual_name:
        return True
    if speaker_name == visual_name:
        return True
    speaker_parts = set(speaker_name.split())
    visual_parts = set(visual_name.split())
    return bool(speaker_parts & visual_parts)


def manifest_findings(rows):
    findings = []
    for row in rows:
        if is_neutral(row["visual_character"]):
            continue
        if names_match(row["speaker"], row["visual_character"]):
            continue
        finding = {
            "label": "SPEAKER_VISUAL_MISMATCH",
            "reason": f"Speaker '{row['speaker']}' is paired with visual character '{row['visual_character']}'.",
            "action": "Replace the visual with the speaker, use speaker-neutral b-roll, or correct the manifest binding before upload.",
            "manifest_path": row["path"],
            "speaker": row["speaker"],
            "visual_character": row["visual_character"],
        }
        if row["start"] is not None:
            finding["t_start"] = round(row["start"], 2)
        if row["end"] is not None:
            finding["t_end"] = round(row["end"], 2)
        if row["visual_file"]:
            finding["visual_file"] = row["visual_file"]
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
            "check": "speaker_visual_binding",
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
            "check": "speaker_visual_binding",
            "media": args.media,
            "manifest": args.manifest,
            "manifest_entries": len(rows),
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
