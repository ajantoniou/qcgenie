#!/usr/bin/env python3
"""
CHECK - OPENING / FOOTER TEXT PRESENCE.
Blocks text-card Shorts manifests when the 0-3s opening hook card or 50-60s footer card is missing.
This is deterministic, sidecar-only, and model-free. It complements shorts_format's rendered OCR gate
by catching the same Stage 35.c/35.d failure before export when the edit manifest is available.

Exit 0 = clean, 1 = missing opening/footer text card, 0/skip when no manifest is supplied.
Usage: check_opening_footer_text_presence.py MEDIA [--manifest short-manifest.json] [--json out.json]
"""
import argparse
import json
import os
import re
import subprocess
import sys


OPENING_END = 3.0
FOOTER_START = 50.0
FOOTER_END = 60.5
START_KEYS = ("t_start", "start", "start_s", "time")
END_KEYS = ("t_end", "end", "end_s")
DURATION_KEYS = ("duration", "dur", "duration_s", "seconds", "length_s")
CLASS_KEYS = ("visual_class", "visual_type", "type", "shot_type", "asset_type", "clip_type", "lane", "card_type")
TEXT_KEYS = (
    "hook_text",
    "opening_text",
    "footer_text",
    "cta_text",
    "end_screen_text",
    "title_card",
    "text",
    "caption",
    "onscreen_text",
)
OPENING_KEYS = ("opening_card", "opening_text_card", "hook_card", "hook_present", "opening_footer_ok")
FOOTER_KEYS = ("footer_card", "footer_card_present", "footer_text_card", "cta_present", "end_screen_present", "opening_footer_ok")
MISSING_OPENING_KEYS = ("missing_opening_card", "missing_hook_card", "missing_opening_text")
MISSING_FOOTER_KEYS = ("missing_footer_card", "missing_footer_text", "missing_cta")
FILE_KEYS = ("visual_file", "file", "path", "clip", "src", "asset", "asset_path")

OPENING_TERMS = ("hook", "question", "opening", "title card", "text card")
FOOTER_TERMS = ("footer", "full episode", "@newtestamentonly", "watch next", "subscribe", "cta", "end screen")
TEXT_CARD_TERMS = ("text card", "title card", "footer card", "hook card", "remotion", "caption card")


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
    text = re.sub(r"[^a-z0-9 @!?]+", " ", text)
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
            "visual_file": first_value(item, FILE_KEYS),
            "visual_class": str(first_value(item, CLASS_KEYS) or ""),
            "text": joined_fields(item, TEXT_KEYS),
            "opening_present": any(truthy(item.get(key)) for key in OPENING_KEYS),
            "footer_present": any(truthy(item.get(key)) for key in FOOTER_KEYS),
            "opening_missing": any(falsey(item.get(key)) for key in OPENING_KEYS) or any(truthy(item.get(key)) for key in MISSING_OPENING_KEYS),
            "footer_missing": any(falsey(item.get(key)) for key in FOOTER_KEYS) or any(truthy(item.get(key)) for key in MISSING_FOOTER_KEYS),
        })
    return rows


def overlaps(row, start, end):
    return row["end"] > start and row["start"] < end


def row_has_text_card(row):
    text = row["text"]
    class_text = " ".join([row["visual_class"], str(row["visual_file"] or "")])
    return bool(normalize(text)) and (contains_any(class_text, TEXT_CARD_TERMS) or contains_any(text, TEXT_CARD_TERMS) or row["opening_present"] or row["footer_present"])


def row_has_opening(row):
    if row["opening_missing"]:
        return False
    return row["opening_present"] or (row_has_text_card(row) and contains_any(" ".join([row["text"], row["visual_class"]]), OPENING_TERMS))


def row_has_footer(row):
    if row["footer_missing"]:
        return False
    return row["footer_present"] or (row_has_text_card(row) and contains_any(" ".join([row["text"], row["visual_class"]]), FOOTER_TERMS))


def finding(label, reason, action, row=None):
    out = {
        "label": label,
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
            out["text"] = row["text"][:180]
    return out


def manifest_findings(rows, media_seconds):
    findings = []
    opening_rows = [row for row in rows if overlaps(row, 0, OPENING_END)]
    footer_end = max(media_seconds or FOOTER_END, FOOTER_END)
    footer_start = max(0, min(FOOTER_START, footer_end - 10.5))
    footer_rows = [row for row in rows if overlaps(row, footer_start, footer_end)]

    explicit_opening_missing = next((row for row in opening_rows if row["opening_missing"]), None)
    if explicit_opening_missing:
        findings.append(finding(
            "OPENING_TEXT_CARD_MISSING",
            "Opening window is explicitly marked as missing the hook text card.",
            "Add a 0-3s big hook question card before export.",
            explicit_opening_missing,
        ))
    elif not opening_rows or not any(row_has_opening(row) for row in opening_rows):
        findings.append(finding(
            "OPENING_TEXT_CARD_MISSING",
            "No verified 0-3s opening hook text card is present in the Short manifest.",
            "Add a 0-3s big hook question card before export.",
            opening_rows[0] if opening_rows else None,
        ))

    explicit_footer_missing = next((row for row in footer_rows if row["footer_missing"]), None)
    if explicit_footer_missing:
        findings.append(finding(
            "FOOTER_TEXT_CARD_MISSING",
            "Footer window is explicitly marked as missing the end text card.",
            "Add a 50-60s footer card such as 'Full episode @NewTestamentOnly' before export.",
            explicit_footer_missing,
        ))
    elif not footer_rows or not any(row_has_footer(row) for row in footer_rows):
        findings.append(finding(
            "FOOTER_TEXT_CARD_MISSING",
            "No verified 50-60s footer text card is present in the Short manifest.",
            "Add a 50-60s footer card such as 'Full episode @NewTestamentOnly' before export.",
            footer_rows[-1] if footer_rows else None,
        ))
    return findings


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("media")
    parser.add_argument("--manifest", default=None)
    parser.add_argument("--json", default=None)
    args = parser.parse_args()

    if not args.manifest:
        result = {
            "check": "opening_footer_text_presence",
            "pass": None,
            "skipped": True,
            "reason": "no manifest supplied",
        }
    else:
        if not os.path.exists(args.manifest):
            raise FileNotFoundError(args.manifest)
        rows = load_manifest(args.manifest)
        findings = manifest_findings(rows, media_duration(args.media))
        result = {
            "check": "opening_footer_text_presence",
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
