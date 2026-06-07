#!/usr/bin/env python3
"""
CHECK - VISUAL NARRATION MATCH.
Blocks manifest rows where the visual is marked as not supporting the narration, or where the
manifest supplies required visual keywords/subjects that are missing from the visual description.
This is deterministic, sidecar-only, and model-free. It skips when no manifest is supplied.

Exit 0 = clean, 1 = mismatch found, 0/skip when no manifest is supplied.
Usage: check_visual_narration_match.py MEDIA [--manifest storybook.json] [--json out.json]
"""
import argparse
import json
import os
import re
import sys


NARRATION_KEYS = ("vo_text_excerpt", "vo_text", "narration", "transcript", "script", "caption")
VISUAL_KEYS = ("visual_description", "description", "visual_subject", "shown_subject", "subject", "literal_subject")
REQUIRED_VISUAL_KEYS = (
    "required_visual_keywords",
    "visual_must_show",
    "visual_required_subjects",
    "narration_visual_requirements",
    "must_show",
)
MATCH_KEYS = (
    "visual_supports_narration",
    "narration_visual_match",
    "visual_narration_match",
    "supports_narration",
    "illustrates_narration",
)
MISMATCH_KEYS = (
    "visual_narration_mismatch",
    "narration_visual_mismatch",
    "literal_mismatch",
    "wrong_visual",
)
START_KEYS = ("t_start", "start", "start_s", "time")
END_KEYS = ("t_end", "end", "end_s")
FILE_KEYS = ("visual_file", "file", "path", "clip", "src", "asset", "asset_path")


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
    return str(value).strip().lower() in {"1", "true", "yes", "y", "ok", "pass", "matched", "present", "visible", "supports"}


def falsey(value):
    if isinstance(value, bool):
        return not value
    if value is None:
        return False
    return str(value).strip().lower() in {"0", "false", "no", "n", "fail", "missing", "absent", "none", "unsupported"}


def normalize(value):
    text = str(value or "").strip().lower()
    text = re.sub(r"[_/.-]+", " ", text)
    text = re.sub(r"[^a-z0-9 ]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def scalar_list(value):
    if value in (None, ""):
        return []
    if isinstance(value, list):
        out = []
        for item in value:
            out.extend(scalar_list(item))
        return out
    if isinstance(value, dict):
        for key in ("name", "text", "entity", "subject", "label", "value", "keyword"):
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


def required_terms(item):
    out = []
    for key in REQUIRED_VISUAL_KEYS:
        out.extend(scalar_list(item.get(key)))
    seen = set()
    deduped = []
    for term in out:
        normalized = normalize(term)
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        deduped.append(term)
    return deduped


def explicit_support(item):
    values = [item.get(key) for key in MATCH_KEYS if key in item]
    if any(truthy(value) for value in values):
        return True
    if any(falsey(value) for value in values):
        return False
    if any(truthy(item.get(key)) for key in MISMATCH_KEYS):
        return False
    return None


def missing_required_terms(terms, visual_text):
    normalized_visual = normalize(visual_text)
    missing = []
    for term in terms:
        normalized_term = normalize(term)
        if normalized_term and normalized_term not in normalized_visual:
            missing.append(term)
    return missing


def load_rows(path):
    try:
        data = json.load(open(path, "r", encoding="utf8"))
    except Exception:
        return []
    rows = []
    for row_path, item in flatten_json(data):
        narration = joined_fields(item, NARRATION_KEYS)
        visual = joined_fields(item, VISUAL_KEYS)
        required = required_terms(item)
        support = explicit_support(item)
        if not narration and not required and support is None:
            continue
        rows.append({
            "path": row_path,
            "start": parse_float(first_value(item, START_KEYS)),
            "end": parse_float(first_value(item, END_KEYS)),
            "visual_file": first_value(item, FILE_KEYS),
            "narration": narration,
            "visual": visual,
            "required_terms": required,
            "explicit_support": support,
        })
    return rows


def findings_for(rows):
    findings = []
    for row in rows:
        missing = missing_required_terms(row["required_terms"], row["visual"])
        if row["explicit_support"] is True and not missing:
            continue
        if row["explicit_support"] is not False and not missing:
            continue
        reason = "Manifest says the visual does not support the narration."
        if missing:
            reason = "Manifest-required visual subjects or keywords are missing from the visual description."
        finding = {
            "label": "VISUAL_NARRATION_MISMATCH",
            "reason": reason,
            "action": "Replace the visual, update the visual timeline, or mark the manifest as supporting the narration before upload.",
            "manifest_path": row["path"],
        }
        if row["start"] is not None:
            finding["t_start"] = round(row["start"], 2)
        if row["end"] is not None:
            finding["t_end"] = round(row["end"], 2)
        if row["visual_file"]:
            finding["visual_file"] = str(row["visual_file"])
        if row["narration"]:
            finding["vo_text_excerpt"] = row["narration"][:180]
        if row["visual"]:
            finding["visual_description"] = row["visual"][:180]
        if missing:
            finding["missing_visual_terms"] = missing[:8]
        findings.append(finding)
    return findings[:30]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("media")
    parser.add_argument("--manifest", default=None)
    parser.add_argument("--json", default=None)
    args = parser.parse_args()

    if not args.manifest:
        result = {
            "check": "visual_narration_match",
            "pass": None,
            "skipped": True,
            "reason": "no manifest supplied",
        }
    else:
        if not os.path.exists(args.manifest):
            raise FileNotFoundError(args.manifest)
        rows = load_rows(args.manifest)
        findings = findings_for(rows)
        result = {
            "check": "visual_narration_match",
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
