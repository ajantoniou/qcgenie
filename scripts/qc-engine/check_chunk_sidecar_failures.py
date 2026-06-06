#!/usr/bin/env python3
"""
CHECK - CHUNK SIDECAR FAILURES.
Blocks when a production pipeline leaves failed render/audio sidecars such as
*.garble-report.json under a supplied sidecar directory.

Exit 0 = clean or skipped, 1 = failed sidecars present. JSON to stdout (+ --json).
Usage: check_chunk_sidecar_failures.py MEDIA [--sidecar-dir DIR] [--json out.json]
"""
import argparse
import json
import os
import sys

FAIL_STATUS = {"fail", "failed", "error", "blocked", "block"}
SIDECAR_PATTERNS = ("garble-report", "failed", "failure", "error")


def load_json(path):
    with open(path, "r", encoding="utf8") as handle:
        return json.load(handle)


def truthy(value):
    if isinstance(value, bool):
        return value
    if isinstance(value, (list, tuple, set, dict)):
        return len(value) > 0
    if isinstance(value, str):
        return value.strip().lower() not in ("", "false", "0", "none", "null", "pass", "passed", "ok")
    return bool(value)


def text_value(value):
    if value is None:
        return ""
    if isinstance(value, (str, int, float, bool)):
        return str(value)
    return json.dumps(value, ensure_ascii=True)[:220]


def first_summary(payload):
    if not isinstance(payload, dict):
        return ""
    for key in ("summary", "reason", "message", "error", "text"):
        value = payload.get(key)
        if value:
            return text_value(value)[:220]
    findings = payload.get("findings")
    if isinstance(findings, list) and findings:
        first = findings[0]
        if isinstance(first, dict):
            return first_summary(first)
        return text_value(first)[:220]
    return ""


def has_failure(path, payload):
    name = os.path.basename(path).lower()
    if not isinstance(payload, dict):
        return any(pattern in name for pattern in SIDECAR_PATTERNS)

    explicit_pass = payload.get("pass")
    if explicit_pass is True and not any(truthy(payload.get(key)) for key in ("blocked", "errors", "findings")):
        return False

    status = str(payload.get("status") or payload.get("state") or "").strip().lower()
    verdict = str(payload.get("verdict") or "").strip().lower()
    if status in FAIL_STATUS or verdict in FAIL_STATUS:
        return True
    if explicit_pass is False:
        return True
    if truthy(payload.get("garble")) or truthy(payload.get("garbled")):
        return True
    if truthy(payload.get("blocked")) or truthy(payload.get("errors")):
        return True
    if truthy(payload.get("findings")) and any(pattern in name for pattern in SIDECAR_PATTERNS):
        return True
    return any(pattern in name for pattern in SIDECAR_PATTERNS) and explicit_pass is not True


def scan(sidecar_dir):
    findings = []
    for root, _, files in os.walk(sidecar_dir):
        for filename in files:
            if not filename.lower().endswith(".json"):
                continue
            path = os.path.join(root, filename)
            rel = os.path.relpath(path, sidecar_dir)
            try:
                payload = load_json(path)
            except Exception as exc:
                if any(pattern in filename.lower() for pattern in SIDECAR_PATTERNS):
                    findings.append({
                        "label": "CHUNK_SIDECAR_FAILURE",
                        "sidecar_path": rel,
                        "reason": f"Failed chunk sidecar could not be parsed: {str(exc)[:120]}",
                        "action": "Resolve or remove the failed chunk report, rerender the affected chunk, then rerun UploadCheck before video generation/upload."
                    })
                continue
            if not has_failure(path, payload):
                continue
            finding = {
                "label": "CHUNK_SIDECAR_FAILURE",
                "sidecar_path": rel,
                "reason": first_summary(payload) or "Failed chunk sidecar remains from a rerender/audio QC loop.",
                "action": "Resolve or remove the failed chunk report, rerender the affected chunk, then rerun UploadCheck before video generation/upload."
            }
            if isinstance(payload, dict):
                for key in ("status", "state", "verdict", "pass"):
                    if key in payload:
                        finding[key] = payload[key]
                if "blocked" in payload:
                    finding["blocked"] = payload["blocked"]
            findings.append(finding)
    return findings


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("media")
    ap.add_argument("--sidecar-dir", default=None)
    ap.add_argument("--json", default=None)
    args = ap.parse_args()

    if not args.sidecar_dir:
        result = {
            "check": "chunk_sidecar_failures",
            "media": args.media,
            "sidecar_dir": None,
            "skipped": True,
            "reason": "no sidecar dir supplied",
            "findings": [],
            "pass": None
        }
    elif not os.path.isdir(args.sidecar_dir):
        result = {
            "check": "chunk_sidecar_failures",
            "media": args.media,
            "sidecar_dir": args.sidecar_dir,
            "findings": [{
                "label": "CHUNK_SIDECAR_FAILURE",
                "reason": f"Sidecar directory not found: {args.sidecar_dir}",
                "action": "Pass a valid chunk sidecar directory or remove chunk_sidecar_failures from this run."
            }],
            "pass": False
        }
    else:
        findings = scan(args.sidecar_dir)
        result = {
            "check": "chunk_sidecar_failures",
            "media": args.media,
            "sidecar_dir": args.sidecar_dir,
            "findings": findings,
            "pass": len(findings) == 0
        }

    out = json.dumps(result, indent=2)
    if args.json:
        with open(args.json, "w", encoding="utf8") as handle:
            handle.write(out)
    print(out)
    sys.exit(0 if result["pass"] is not False else 1)


if __name__ == "__main__":
    main()
