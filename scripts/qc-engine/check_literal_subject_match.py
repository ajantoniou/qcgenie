#!/usr/bin/env python3
"""
CHECK - LITERAL SUBJECT MATCH.
Blocks manifest rows where narration names a person, place, source, date, or event but the selected
visual is marked generic/mood-only or does not declare a literal subject match. This is deterministic,
sidecar-only, and model-free. It skips when no manifest is supplied.

Exit 0 = clean, 1 = literal-subject mismatch found, 0/skip when no manifest is supplied.
Usage: check_literal_subject_match.py MEDIA [--manifest storybook.json] [--json out.json]
"""
import argparse
import json
import os
import re
import sys


ENTITY_KEYS = (
    "named_entities_in_vo",
    "named_entities",
    "vo_named_entities",
    "entities",
    "named_subjects",
    "literal_subjects_required",
)
VO_KEYS = ("vo_text_excerpt", "vo_text", "narration", "transcript", "script", "caption")
VISUAL_KEYS = ("visual_subject", "literal_subject", "shown_subject", "subject", "visual_description", "description")
CLASS_KEYS = ("visual_class", "visual_type", "type", "shot_type", "asset_type", "clip_type", "lane")
FILE_KEYS = ("visual_file", "file", "path", "clip", "src", "asset", "asset_path")
MATCH_KEYS = ("literal_match_found", "literal_subject_present", "literal_match", "named_entity_visible", "doctrine_literal")
GENERIC_KEYS = ("generic_mood", "mood_only", "atmospheric_only", "generic_broll", "literal_mismatch")
FALLBACK_KEYS = ("recommend_remotion", "source_card_fallback", "explicit_neutral_substitute", "literal_fallback_ok")
START_KEYS = ("t_start", "start", "start_s", "time")
END_KEYS = ("t_end", "end", "end_s")

GENERIC_TERMS = (
    "generic mood",
    "mood clip",
    "mood footage",
    "atmosphere",
    "atmospheric",
    "generic crowd",
    "generic broll",
    "generic b roll",
    "symbolic",
    "abstract",
    "connective",
    "texture",
)

SAFE_FALLBACK_TERMS = (
    "remotion",
    "source card",
    "source-card",
    "text card",
    "text-card",
    "citation",
    "quote card",
    "quote-card",
    "graphic",
    "map",
    "diagram",
    "slate",
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
    return str(value).strip().lower() in {"1", "true", "yes", "y", "ok", "pass", "matched", "present", "visible"}


def falsey(value):
    if isinstance(value, bool):
        return not value
    if value is None:
        return False
    return str(value).strip().lower() in {"0", "false", "no", "n", "fail", "missing", "absent", "none"}


def normalize(value):
    text = str(value or "").strip().lower()
    text = re.sub(r"[_/.-]+", " ", text)
    text = re.sub(r"[^a-z0-9 ]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def contains_any(text, terms):
    normalized = normalize(text)
    return any(term in normalized for term in terms)


def scalar_list(value):
    if value in (None, ""):
        return []
    if isinstance(value, list):
        out = []
        for item in value:
            out.extend(scalar_list(item))
        return out
    if isinstance(value, dict):
        for key in ("name", "text", "entity", "subject", "label", "value"):
            if value.get(key):
                return [str(value.get(key))]
        return []
    text = str(value).strip()
    if not text:
        return []
    return [part.strip() for part in re.split(r"[,;|]+", text) if part.strip()]


def joined_fields(item, keys):
    values = []
    for key in keys:
        value = item.get(key)
        if value not in (None, ""):
            if isinstance(value, (list, dict)):
                values.extend(scalar_list(value))
            else:
                values.append(str(value))
    return " ".join(values)


def entity_names(item):
    entities = []
    for key in ENTITY_KEYS:
        entities.extend(scalar_list(item.get(key)))
    seen = set()
    out = []
    for entity in entities:
        normalized = normalize(entity)
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        out.append(entity)
    return out


def explicit_match(item):
    values = [item.get(key) for key in MATCH_KEYS if key in item]
    if not values:
        return None
    if any(truthy(value) for value in values):
        return True
    if any(falsey(value) for value in values):
        return False
    return None


def generic_flagged(item, text):
    if any(truthy(item.get(key)) for key in GENERIC_KEYS):
        return True
    return contains_any(text, GENERIC_TERMS)


def safe_fallback(item, text):
    if any(truthy(item.get(key)) for key in FALLBACK_KEYS):
        return True
    return contains_any(text, SAFE_FALLBACK_TERMS)


def visual_mentions_entity(entities, visual_text):
    normalized_visual = normalize(visual_text)
    if not normalized_visual:
        return False
    for entity in entities:
        normalized_entity = normalize(entity)
        if normalized_entity and normalized_entity in normalized_visual:
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
        entities = entity_names(item)
        if not entities:
            continue
        start = parse_float(first_value(item, START_KEYS))
        end = parse_float(first_value(item, END_KEYS))
        visual_file = first_value(item, FILE_KEYS)
        visual_class = first_value(item, CLASS_KEYS)
        vo_text = joined_fields(item, VO_KEYS)
        visual_text = joined_fields(item, VISUAL_KEYS)
        class_text = str(visual_class or "")
        rows.append({
            "path": row_path,
            "entities": entities,
            "start": start,
            "end": end,
            "visual_file": str(visual_file) if visual_file else None,
            "visual_class": class_text,
            "vo_text": vo_text,
            "visual_text": visual_text,
            "combined_visual_text": " ".join([visual_text, class_text, str(visual_file or "")]),
            "explicit_match": explicit_match(item),
            "generic": generic_flagged(item, " ".join([visual_text, class_text, str(visual_file or "")])),
            "safe_fallback": safe_fallback(item, " ".join([visual_text, class_text, str(visual_file or "")])),
        })
    return rows


def manifest_findings(rows):
    findings = []
    for row in rows:
        if row["safe_fallback"]:
            continue
        if row["explicit_match"] is True:
            continue
        if visual_mentions_entity(row["entities"], row["combined_visual_text"]):
            continue
        if row["explicit_match"] is not False and not row["generic"]:
            continue
        finding = {
            "label": "LITERAL_SUBJECT_MISMATCH",
            "reason": "Narration names a specific subject, but the manifest does not show a literal visual match and appears to use generic/mood footage.",
            "action": "Replace the visual with the named subject, use a source-card/Remotion fallback, or mark the manifest with an explicit literal match before upload.",
            "manifest_path": row["path"],
            "named_entities": row["entities"][:8],
        }
        if row["start"] is not None:
            finding["t_start"] = round(row["start"], 2)
        if row["end"] is not None:
            finding["t_end"] = round(row["end"], 2)
        if row["visual_file"]:
            finding["visual_file"] = row["visual_file"]
        if row["visual_class"]:
            finding["visual_class"] = row["visual_class"]
        if row["vo_text"]:
            finding["vo_text_excerpt"] = row["vo_text"][:180]
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
            "check": "literal_subject_match",
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
            "check": "literal_subject_match",
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
