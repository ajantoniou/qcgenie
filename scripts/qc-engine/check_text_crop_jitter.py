#!/usr/bin/env python3
"""
CHECK - TEXT CROP / JITTER.
Blocks text-card manifest rows that are explicitly marked cropped, overlapping, jittering,
edge-to-edge, or whose supplied text bounding boxes touch unsafe edges. This is deterministic,
sidecar-only, and model-free. It skips when no manifest is supplied.

Exit 0 = clean, 1 = text crop/jitter issue found, 0/skip when no manifest is supplied.
Usage: check_text_crop_jitter.py MEDIA [--manifest storybook.json] [--json out.json]
"""
import argparse
import json
import os
import re
import sys


START_KEYS = ("t_start", "start", "start_s", "time")
END_KEYS = ("t_end", "end", "end_s")
DURATION_KEYS = ("duration", "dur", "duration_s", "seconds", "length_s")
CLASS_KEYS = ("visual_class", "visual_type", "type", "shot_type", "asset_type", "clip_type", "lane", "card_type")
TEXT_KEYS = ("text", "caption", "onscreen_text", "title_card", "hook_text", "footer_text", "card_text")
FILE_KEYS = ("visual_file", "file", "path", "clip", "src", "asset", "asset_path")
FLAG_KEYS = (
    "text_cropped",
    "cropped_text",
    "text_overlap",
    "text_overlaps",
    "overlapping_text",
    "text_jitter",
    "jittering_text",
    "edge_to_edge_text",
    "text_edge_to_edge",
    "text_crop_jitter",
)
BOX_KEYS = ("text_box", "text_bbox", "text_bounds", "bbox", "word_box", "text_rect")
WIDTH_KEYS = ("width", "frame_width", "canvas_width", "w")
HEIGHT_KEYS = ("height", "frame_height", "canvas_height", "h")
NOTES_KEYS = ("reason", "notes", "qc_note", "label", "issue", "status")

TEXT_CARD_TERMS = ("text card", "title card", "footer card", "hook card", "remotion", "caption card", "verse card", "source card")
BAD_TERMS = (
    "text overlaps",
    "overlapping text",
    "text cropped",
    "cropped text",
    "cut off text",
    "jittering text",
    "text jitter",
    "edge to edge",
    "edge-to-edge",
    "outside safe area",
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
    return str(value).strip().lower() in {"1", "true", "yes", "y", "fail", "failed", "present", "cropped", "overlap", "jitter", "edge"}


def normalize(value):
    text = str(value or "").strip().lower()
    text = re.sub(r"[_/.-]+", " ", text)
    text = re.sub(r"[^a-z0-9 @!?]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def contains_any(text, terms):
    normalized = normalize(text)
    return any(term in normalized for term in terms)


def scalar_values(value):
    if value in (None, ""):
        return []
    if isinstance(value, list):
        out = []
        for item in value:
            out.extend(scalar_values(item))
        return out
    if isinstance(value, dict):
        out = []
        for key in ("text", "label", "reason", "issue", "status"):
            if value.get(key):
                out.extend(scalar_values(value.get(key)))
        return out
    return [str(value)]


def joined_fields(item, keys):
    values = []
    for key in keys:
        values.extend(scalar_values(item.get(key)))
    return " ".join(values)


def duration_for(item, start):
    duration = parse_float(first_value(item, DURATION_KEYS))
    if duration is not None:
        return duration
    end = parse_float(first_value(item, END_KEYS))
    if start is not None and end is not None and end >= start:
        return end - start
    return None


def parse_box(value):
    if isinstance(value, dict):
        if all(key in value for key in ("left", "top", "right", "bottom")):
            nums = [value.get("left"), value.get("top"), value.get("right"), value.get("bottom")]
        elif all(key in value for key in ("x", "y", "width", "height")):
            x = parse_float(value.get("x"))
            y = parse_float(value.get("y"))
            w = parse_float(value.get("width"))
            h = parse_float(value.get("height"))
            if None in (x, y, w, h):
                return None
            return [x, y, x + w, y + h]
        else:
            return None
    elif isinstance(value, list) and len(value) >= 4:
        nums = value[:4]
    else:
        return None
    parsed = [parse_float(num) for num in nums]
    if any(num is None for num in parsed):
        return None
    return parsed


def supplied_boxes(item):
    boxes = []
    for key in BOX_KEYS:
        value = item.get(key)
        if value in (None, ""):
            continue
        if isinstance(value, list) and value and all(isinstance(entry, (dict, list)) for entry in value):
            for entry in value:
                box = parse_box(entry)
                if box:
                    boxes.append(box)
        else:
            box = parse_box(value)
            if box:
                boxes.append(box)
    return boxes


def box_edge_issue(item):
    width = parse_float(first_value(item, WIDTH_KEYS)) or 1080.0
    height = parse_float(first_value(item, HEIGHT_KEYS)) or 1920.0
    margin_x = max(24.0, width * 0.035)
    margin_y = max(24.0, height * 0.035)
    for box in supplied_boxes(item):
        left, top, right, bottom = box
        if left <= margin_x or top <= margin_y or right >= width - margin_x or bottom >= height - margin_y:
            return {
                "box": [round(left, 2), round(top, 2), round(right, 2), round(bottom, 2)],
                "frame": [round(width, 2), round(height, 2)],
            }
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
        visual_class = str(first_value(item, CLASS_KEYS) or "")
        text = joined_fields(item, TEXT_KEYS)
        notes = joined_fields(item, NOTES_KEYS)
        is_text_card = bool(text) or contains_any(" ".join([visual_class, str(first_value(item, FILE_KEYS) or "")]), TEXT_CARD_TERMS)
        if not is_text_card:
            continue
        rows.append({
            "path": row_path,
            "start": start,
            "end": end,
            "visual_file": first_value(item, FILE_KEYS),
            "visual_class": visual_class,
            "text": text,
            "notes": notes,
            "explicit_issue": any(truthy(item.get(key)) for key in FLAG_KEYS) or contains_any(" ".join([notes, visual_class, text]), BAD_TERMS),
            "edge_issue": box_edge_issue(item),
        })
    return rows


def manifest_findings(rows):
    findings = []
    for row in rows:
        issue = row["edge_issue"]
        if not row["explicit_issue"] and not issue:
            continue
        reason = "Text card is marked cropped, overlapping, jittering, or edge-to-edge."
        if issue:
            reason = "Text bounding box touches the card/frame edge and may crop or collide with platform UI."
        finding = {
            "label": "TEXT_CROP_JITTER",
            "reason": reason,
            "action": "Reflow the text card inside the safe area, reduce font/box padding, and rerun UploadCheck before upload.",
            "manifest_path": row["path"],
            "t_start": round(row["start"], 2),
        }
        if row["end"] is not None:
            finding["t_end"] = round(row["end"], 2)
        if row["visual_file"]:
            finding["visual_file"] = str(row["visual_file"])
        if row["visual_class"]:
            finding["visual_class"] = row["visual_class"]
        if row["text"]:
            finding["text"] = row["text"][:180]
        if row["notes"]:
            finding["notes"] = row["notes"][:180]
        if issue:
            finding["text_box"] = issue["box"]
            finding["frame"] = issue["frame"]
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
            "check": "text_crop_jitter",
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
            "check": "text_crop_jitter",
            "media": args.media,
            "manifest": args.manifest,
            "text_card_entries": len(rows),
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
