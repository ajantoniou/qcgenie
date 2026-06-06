#!/usr/bin/env python3
"""
CHECK - ASSET TRIAGE / REUSE MANIFEST.
Blocks post-ship/post-render manifests that mark asset triage as required but fail to record reusable
assets and cleanup candidates. This is deterministic, sidecar-only, and model-free. It skips when no
manifest is supplied or when the manifest does not request post-ship asset triage.

Exit 0 = clean, 1 = missing asset triage evidence, 0/skip when no manifest or no triage request.
Usage: check_asset_triage_reuse_manifest.py MEDIA [--manifest post-ship.json] [--json out.json]
"""
import argparse
import json
import os
import re
import sys

TRIAGE_KEYS = (
    "asset_triage_required",
    "post_ship_asset_triage",
    "postship_asset_triage",
    "requires_asset_triage",
    "asset_triage",
)
REUSABLE_KEYS = (
    "reusable_assets",
    "reusable_asset_manifest",
    "assets_to_keep",
    "saved_reusable_assets",
    "brand_reusable_assets",
)
CLEANUP_KEYS = (
    "cleanup_candidates",
    "assets_to_delete",
    "one_off_cleanup",
    "one_off_cruft",
    "delete_candidates",
    "archive_candidates",
)
NOTES_KEYS = ("notes", "reason", "qc_note", "label", "status")
ASSET_NAME_KEYS = ("path", "file", "url", "asset", "name", "id", "source")


def flatten_json(value, path="root"):
    if isinstance(value, dict):
        yield path, value
        for key, child in value.items():
            yield from flatten_json(child, f"{path}.{key}")
    elif isinstance(value, list):
        for idx, child in enumerate(value):
            yield from flatten_json(child, f"{path}[{idx}]")


def normalize(value):
    text = str(value or "").strip().lower()
    text = re.sub(r"[_/.-]+", " ", text)
    text = re.sub(r"[^a-z0-9 ]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def truthy(value):
    if isinstance(value, bool):
        return value
    return str(value or "").strip().lower() in {"1", "true", "yes", "y", "required", "present", "done", "complete"}


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
        for key in ASSET_NAME_KEYS:
            if value.get(key):
                out.extend(scalar_values(value.get(key)))
        return out
    return [str(value).strip()]


def first_value(item, keys):
    for key in keys:
        value = item.get(key)
        if value not in (None, ""):
            return value
    return None


def has_any_asset(item, keys):
    for key in keys:
        values = scalar_values(item.get(key))
        if any(value for value in values):
            return True
    return False


def joined_fields(item, keys):
    values = []
    for key in keys:
        values.extend(scalar_values(item.get(key)))
    return " ".join(values)


def triage_required(item):
    if any(truthy(item.get(key)) for key in TRIAGE_KEYS):
        return True
    text = normalize(joined_fields(item, NOTES_KEYS))
    return any(term in text for term in ("post ship asset triage", "asset triage required", "reusable assets required"))


def load_manifest(path):
    if not path:
        return []
    try:
        data = json.load(open(path, "r", encoding="utf8"))
    except Exception:
        return []
    rows = []
    for row_path, item in flatten_json(data):
        if not triage_required(item):
            continue
        rows.append({
            "path": row_path,
            "has_reusable_assets": has_any_asset(item, REUSABLE_KEYS),
            "has_cleanup_candidates": has_any_asset(item, CLEANUP_KEYS),
            "notes": joined_fields(item, NOTES_KEYS)[:180],
            "reusable_count": count_assets(item, REUSABLE_KEYS),
            "cleanup_count": count_assets(item, CLEANUP_KEYS),
        })
    return rows


def count_assets(item, keys):
    total = 0
    for key in keys:
        value = item.get(key)
        if isinstance(value, list):
            total += len([entry for entry in value if scalar_values(entry)])
        elif scalar_values(value):
            total += 1
    return total


def manifest_findings(rows):
    findings = []
    for row in rows:
        missing = []
        if not row["has_reusable_assets"]:
            missing.append("reusable_assets")
        if not row["has_cleanup_candidates"]:
            missing.append("cleanup_candidates")
        if not missing:
            continue
        finding = {
            "label": "ASSET_TRIAGE_INCOMPLETE",
            "reason": f"Post-ship asset triage is required but missing: {', '.join(missing)}.",
            "action": "Record reusable assets to retain and one-off cleanup/archive candidates, then rerun UploadCheck before closing the production run.",
            "manifest_path": row["path"],
            "missing": missing,
            "reusable_count": row["reusable_count"],
            "cleanup_count": row["cleanup_count"],
        }
        if row["notes"]:
            finding["notes"] = row["notes"]
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
            "check": "asset_triage_reuse_manifest",
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
            "check": "asset_triage_reuse_manifest",
            "media": args.media,
            "manifest": args.manifest,
            "required_triage_entries": len(rows),
            "findings": findings,
            "pass": len(findings) == 0,
        }
        if not rows:
            result.update({"pass": None, "skipped": True, "reason": "manifest does not request asset triage"})

    out = json.dumps(result, indent=2)
    if args.json:
        open(args.json, "w", encoding="utf8").write(out)
    print(out)
    sys.exit(0 if result.get("pass") is not False else 1)


if __name__ == "__main__":
    main()
