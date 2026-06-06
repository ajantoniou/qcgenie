#!/usr/bin/env python3
"""
CHECK - CONTACT SHEET EVIDENCE.
Blocks repair/complaint/regression-prone manifest rows unless they include before/after contact-sheet
evidence. This is deterministic, sidecar-only, and model-free. It skips when no manifest is supplied.

Exit 0 = clean, 1 = missing contact-sheet evidence, 0/skip when no manifest is supplied.
Usage: check_contact_sheet_evidence.py MEDIA [--manifest storybook.json] [--json out.json]
"""
import argparse
import json
import os
import re
import sys


START_KEYS = ("t_start", "start", "start_s", "time")
END_KEYS = ("t_end", "end", "end_s")
DURATION_KEYS = ("duration", "dur", "duration_s", "seconds", "length_s")
WINDOW_KEYS = ("repair_window", "founder_complaint_window", "complaint_window", "regression_window", "requires_contact_sheet", "contact_sheet_required")
BEFORE_KEYS = ("before_contact_sheet", "before_contact_sheet_path", "before_sheet", "before_contact", "contact_sheet_before")
AFTER_KEYS = ("after_contact_sheet", "after_contact_sheet_path", "after_sheet", "after_contact", "contact_sheet_after")
COMBINED_KEYS = ("contact_sheet", "contact_sheet_path", "contact_sheets", "contact_sheet_artifacts")
NOTES_KEYS = ("reason", "notes", "qc_note", "complaint", "repair_reason", "label")


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
    return str(value).strip().lower() in {"1", "true", "yes", "y", "required", "repair", "complaint", "regression", "present"}


def scalar_list(value):
    if value in (None, ""):
        return []
    if isinstance(value, list):
        out = []
        for item in value:
            out.extend(scalar_list(item))
        return out
    if isinstance(value, dict):
        out = []
        for key in ("before", "after", "path", "file", "url", "artifact"):
            if value.get(key):
                out.extend(scalar_list(value.get(key)))
        return out
    return [str(value).strip()]


def normalize(value):
    text = str(value or "").strip().lower()
    text = re.sub(r"[_/.-]+", " ", text)
    text = re.sub(r"[^a-z0-9 ]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def joined_fields(item, keys):
    values = []
    for key in keys:
        value = item.get(key)
        if value not in (None, ""):
            values.extend(scalar_list(value))
    return " ".join(values)


def duration_for(item, start):
    duration = parse_float(first_value(item, DURATION_KEYS))
    if duration is not None:
        return duration
    end = parse_float(first_value(item, END_KEYS))
    if start is not None and end is not None and end >= start:
        return end - start
    return None


def requires_evidence(item):
    if any(truthy(item.get(key)) for key in WINDOW_KEYS):
        return True
    text = normalize(joined_fields(item, NOTES_KEYS))
    markers = ("founder complaint", "repair window", "regression", "before after", "contact sheet")
    return any(marker in text for marker in markers)


def has_before_after(item):
    before = scalar_list(first_value(item, BEFORE_KEYS))
    after = scalar_list(first_value(item, AFTER_KEYS))
    if before and after:
        return True
    combined = scalar_list(first_value(item, COMBINED_KEYS))
    normalized = " ".join(normalize(value) for value in combined)
    return bool(combined) and "before" in normalized and "after" in normalized


def load_manifest(path):
    if not path:
        return []
    try:
        data = json.load(open(path, "r", encoding="utf8"))
    except Exception:
        return []
    rows = []
    for row_path, item in flatten_json(data):
        if not requires_evidence(item):
            continue
        start = parse_float(first_value(item, START_KEYS))
        duration = duration_for(item, start)
        end = parse_float(first_value(item, END_KEYS))
        if end is None and start is not None and duration is not None:
            end = start + duration
        rows.append({
            "path": row_path,
            "start": start,
            "end": end,
            "notes": joined_fields(item, NOTES_KEYS),
            "has_evidence": has_before_after(item),
        })
    return rows


def manifest_findings(rows):
    findings = []
    for row in rows:
        if row["has_evidence"]:
            continue
        finding = {
            "label": "CONTACT_SHEET_EVIDENCE",
            "reason": "Repair or founder complaint window requires before/after contact-sheet proof, but the manifest does not include both artifacts.",
            "action": "Attach before and after contact-sheet artifacts for the exact complaint window, then rerun UploadCheck before calling the repair verified.",
            "manifest_path": row["path"],
        }
        if row["start"] is not None:
            finding["t_start"] = round(row["start"], 2)
        if row["end"] is not None:
            finding["t_end"] = round(row["end"], 2)
        if row["notes"]:
            finding["notes"] = row["notes"][:180]
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
            "check": "contact_sheet_evidence",
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
            "check": "contact_sheet_evidence",
            "media": args.media,
            "manifest": args.manifest,
            "required_windows": len(rows),
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
