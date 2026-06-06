#!/usr/bin/env python3
"""
CHECK - FIRST THREE SECONDS.
Blocks manifest rows where the opening 0-3s window is missing, generic, lacks a hook frame/card, or
is explicitly marked as a title/thumbnail/opening-frame mismatch. This is deterministic,
sidecar-only, and model-free. It skips when no manifest is supplied.

Exit 0 = clean, 1 = first-three-seconds issue found, 0/skip when no manifest is supplied.
Usage: check_first_three_seconds.py MEDIA [--manifest storybook.json] [--json out.json]
"""
import argparse
import json
import os
import re
import sys


START_KEYS = ("t_start", "start", "start_s", "time")
END_KEYS = ("t_end", "end", "end_s")
DURATION_KEYS = ("duration", "dur", "duration_s", "seconds", "length_s")
CLASS_KEYS = ("visual_class", "visual_type", "type", "shot_type", "asset_type", "clip_type", "lane")
TEXT_KEYS = ("hook_text", "opening_text", "title_card", "text", "caption", "onscreen_text", "vo_text_excerpt", "vo_text")
HOOK_KEYS = ("has_hook", "hook_present", "hook_frame", "hook_card", "opening_hook", "first_three_ok")
MISMATCH_KEYS = ("title_thumbnail_mismatch", "title_thumb_mismatch", "opening_frame_mismatch", "hook_mismatch")
TITLE_KEYS = ("title", "video_title", "episode_title", "youtube_title")
THUMB_KEYS = ("thumbnail_text", "thumbnail_prompt", "thumbnail_subject", "thumbnail_title")
VISUAL_KEYS = ("visual_subject", "visual_description", "description", "subject", "purpose", "intent")
FILE_KEYS = ("visual_file", "file", "path", "clip", "src", "asset", "asset_path")

GENERIC_TERMS = (
    "generic",
    "generic opener",
    "generic opening",
    "generic mood",
    "mood footage",
    "atmosphere",
    "atmospheric",
    "broll only",
    "b-roll only",
    "establishing only",
    "no hook",
    "placeholder",
    "intro slate",
)

HOOK_TERMS = (
    "?",
    "why",
    "what if",
    "did you know",
    "the question",
    "hook",
    "cold open",
    "open question",
    "big hook",
)

STOP_WORDS = {
    "the", "and", "for", "with", "from", "that", "this", "what", "when", "where", "into",
    "only", "episode", "full", "video", "part", "new", "testament", "you", "your", "was",
}


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
    text = re.sub(r"[^a-z0-9 ?!]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def tokens(value):
    return {word for word in re.findall(r"[a-z0-9]+", normalize(value)) if len(word) >= 3 and word not in STOP_WORDS}


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
        if start > 3.0 or (end is not None and end <= 0):
            continue
        rows.append({
            "path": row_path,
            "start": start,
            "end": end,
            "duration": duration,
            "visual_file": first_value(item, FILE_KEYS),
            "visual_class": str(first_value(item, CLASS_KEYS) or ""),
            "text": joined_fields(item, TEXT_KEYS),
            "visual_text": joined_fields(item, VISUAL_KEYS),
            "title_text": joined_fields(item, TITLE_KEYS),
            "thumbnail_text": joined_fields(item, THUMB_KEYS),
            "has_hook": any(truthy(item.get(key)) for key in HOOK_KEYS),
            "missing_hook": any(falsey(item.get(key)) for key in HOOK_KEYS),
            "mismatch": any(truthy(item.get(key)) for key in MISMATCH_KEYS),
        })
    return rows


def title_thumb_mismatch(row):
    title = row["title_text"]
    thumb = row["thumbnail_text"]
    opening = " ".join([row["text"], row["visual_text"]])
    if not title or not thumb or not opening:
        return False
    expected = tokens(title) | tokens(thumb)
    observed = tokens(opening)
    if not expected:
        return False
    return len(expected & observed) == 0


def opening_has_hook(row):
    text = " ".join([row["text"], row["visual_text"], row["visual_class"]])
    if row["has_hook"]:
        return True
    if contains_any(text, HOOK_TERMS):
        return True
    return False


def opening_is_generic(row):
    text = " ".join([row["text"], row["visual_text"], row["visual_class"], str(row["visual_file"] or "")])
    return row["missing_hook"] or contains_any(text, GENERIC_TERMS)


def finding(reason, action, row=None):
    out = {
        "label": "FIRST_THREE_SECONDS",
        "reason": reason,
        "action": action,
    }
    if row:
        out["manifest_path"] = row["path"]
        out["t_start"] = round(row["start"], 2)
        if row["end"] is not None:
            out["t_end"] = round(row["end"], 2)
        if row["visual_file"]:
            out["visual_file"] = str(row["visual_file"])
        if row["visual_class"]:
            out["visual_class"] = row["visual_class"]
        if row["text"]:
            out["opening_text"] = row["text"][:180]
    return out


def manifest_findings(rows):
    if not rows:
        return [finding(
            "No manifest row covers the first three seconds, so the opening hook frame/card cannot be verified.",
            "Add a 0-3s hook frame/card entry to the manifest or rerun with the correct opening-sidecar before upload.",
        )]

    findings = []
    for row in rows:
        if row["mismatch"] or title_thumb_mismatch(row):
            findings.append(finding(
                "Opening frame/card is marked as mismatched with the title or thumbnail.",
                "Align the first frame/card with the title and thumbnail promise before upload.",
                row,
            ))
            continue
        if opening_is_generic(row):
            findings.append(finding(
                "First three seconds are generic or explicitly marked as missing a hook.",
                "Replace the opening with a specific hook frame/card that states the question or payoff.",
                row,
            ))
            continue
        if not opening_has_hook(row):
            findings.append(finding(
                "First three seconds do not declare a hook frame/card.",
                "Mark the opening hook in the manifest or add a clear hook frame/card before upload.",
                row,
            ))
    return findings[:20]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("media")
    parser.add_argument("--manifest", default=None)
    parser.add_argument("--json", default=None)
    args = parser.parse_args()

    if not args.manifest:
        result = {
            "check": "first_three_seconds",
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
            "check": "first_three_seconds",
            "media": args.media,
            "manifest": args.manifest,
            "opening_entries": len(rows),
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
