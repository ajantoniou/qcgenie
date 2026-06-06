#!/usr/bin/env python3
"""
CHECK - CLEAN SEGMENT SOURCE SCRUB.
Blocks source clips or storybook rows that are not safe clean-segments: silent-film intertitles,
wrong-region inserts, pyramids/Babylon/Egypt under incompatible VO, wedding/dancing/banquet footage,
modern dress, watermarks, or parent compilation clips that have not been scrubbed.

With --manifest, this is metadata-first and model-free. Without --manifest, it OCR-scans sampled
frames and blocks readable source text/intertitles. Intended for source-clip preflight before a
storybook references b-roll, not as a semantic historical judge.

Exit 0 = clean, 1 = source scrub issue found, 0/skip if no manifest and Tesseract is unavailable.
Usage: check_clean_segment_source_scrub.py MEDIA [--manifest storybook.json] [--fps 0.25] [--json out.json]
"""
import argparse
import glob
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile

from check_text_contrast import run_tesseract_tsv

IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tif", ".tiff"}
FILE_KEYS = ("visual_file", "file", "path", "clip", "src", "asset", "asset_path", "source_file")
START_KEYS = ("t_start", "start", "start_s", "time")
END_KEYS = ("t_end", "end", "end_s")
NOTE_KEYS = (
    "source_qc",
    "qc",
    "qc_status",
    "status",
    "label",
    "labels",
    "flags",
    "tags",
    "notes",
    "reason",
    "issue",
    "visual_description",
    "description",
    "source",
    "source_family",
)
CLEAN_KEYS = ("clean_segment", "source_scrubbed", "ocr_scrubbed", "approved_clean_segment")

BAD_TERMS = (
    "wrong region",
    "wrong_region",
    "wrong era",
    "wrong_era",
    "intertitle",
    "title card",
    "silent film title",
    "silent-film title",
    "watermark",
    "modern dress",
    "modern-dress",
    "pyramid",
    "pyramids",
    "sphinx",
    "egypt",
    "egyptian",
    "babylon",
    "wedding",
    "dancing",
    "dance",
    "banquet",
    "gypsy",
    "de mille",
    "demille",
)


def is_image(path):
    return os.path.splitext(path.lower())[1] in IMAGE_EXTS


def duration(path):
    if is_image(path):
        return 0.0
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path],
        capture_output=True,
        text=True,
    ).stdout.strip()
    return float(out or 0)


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
        for key in ("text", "label", "reason", "issue", "status", "name", "value"):
            if value.get(key):
                out.extend(scalar_values(value.get(key)))
        return out
    return [str(value)]


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
    return str(value or "").strip().lower() in {"1", "true", "yes", "y", "pass", "clean", "approved"}


def joined_fields(item):
    values = []
    for key in NOTE_KEYS:
        values.extend(scalar_values(item.get(key)))
    file_value = first_value(item, FILE_KEYS)
    if file_value:
        values.append(str(file_value))
    return " ".join(values)


def bad_terms_in(text):
    normalized = normalize(text)
    return [term for term in BAD_TERMS if normalize(term) in normalized]


def manifest_findings(manifest_path):
    if not manifest_path:
        return [], False
    try:
        data = json.load(open(manifest_path, encoding="utf8"))
    except Exception:
        return [], False
    findings = []
    saw_rows = False
    for row_path, item in flatten_json(data):
        visual = first_value(item, FILE_KEYS)
        text = joined_fields(item)
        terms = bad_terms_in(text)
        clean = any(truthy(item.get(key)) for key in CLEAN_KEYS)
        if visual or text:
            saw_rows = True
        if terms:
            findings.append({
                "t": parse_float(first_value(item, START_KEYS)) or 0,
                "label": "UNCLEAN_SOURCE_SEGMENT",
                "reason": f"Source row contains blocked clean-segment label(s): {', '.join(sorted(set(terms)))}.",
                "action": "Replace this source with a verified clean-segment or scrub the source before storybook use.",
                "manifest_path": row_path,
                "visual_file": visual,
                "matched_terms": sorted(set(terms)),
            })
        elif visual and not clean and looks_like_parent_compilation(visual):
            findings.append({
                "t": parse_float(first_value(item, START_KEYS)) or 0,
                "label": "UNSCRUBBED_PARENT_SOURCE",
                "reason": "Source appears to reference a parent compilation instead of a verified clean-segment.",
                "action": "Reference a scrubbed clean-segment artifact or mark the row as source_scrubbed only after OCR/region review.",
                "manifest_path": row_path,
                "visual_file": visual,
            })
    return findings[:30], saw_rows


def looks_like_parent_compilation(path):
    basename = normalize(os.path.basename(str(path)))
    if "clean segment" in basename or "cleansegment" in basename:
        return False
    return any(term in basename for term in ("king of kings", "kok", "de mille", "demille", "compilation", "full movie", "source"))


def extract_frames(media, tmp, fps, max_frames):
    if is_image(media):
        out = os.path.join(tmp, "f_00001.jpg")
        subprocess.run(["ffmpeg", "-y", "-i", media, "-frames:v", "1", out], capture_output=True)
        return [out] if os.path.exists(out) else []
    subprocess.run(
        ["ffmpeg", "-y", "-i", media, "-vf", f"fps={fps},scale=960:-1", os.path.join(tmp, "f_%05d.jpg")],
        capture_output=True,
    )
    return sorted(glob.glob(os.path.join(tmp, "f_*.jpg")))[:max_frames]


def ocr_findings(media, fps, max_frames):
    if not shutil.which("tesseract"):
        return [], 0, "tesseract missing - clean source OCR scrub skipped without manifest evidence"
    tmp = tempfile.mkdtemp(prefix="qccleanseg_")
    try:
        frames = extract_frames(media, tmp, fps, max_frames)
        findings = []
        if not frames:
            findings.append({
                "t": 0,
                "label": "SOURCE_DECODE_FAILED",
                "reason": "Could not decode any image/video frames for clean-segment source scrub.",
                "action": "Verify the source media file and rerun UploadCheck before storybook use.",
            })
        for idx, frame in enumerate(frames):
            timestamp = 0.0 if is_image(media) else idx / fps
            words = run_tesseract_tsv(frame)
            visible = [word for word in words if len(word["text"]) >= 3]
            if visible:
                findings.append({
                    "t": round(timestamp, 1),
                    "label": "SOURCE_TEXT_OR_INTERTITLE",
                    "reason": "Readable text appears inside a source clip/image that should be a clean visual segment.",
                    "action": "Scrub this source into a clean segment without intertitles/watermarks/text before storybook use.",
                    "words": [{
                        "text": word["text"],
                        "conf": round(word["conf"], 1),
                        "box": list(word["box"]),
                    } for word in visible[:8]],
                })
        return findings[:20], len(frames), None
    finally:
        for frame in glob.glob(os.path.join(tmp, "*.jpg")):
            os.unlink(frame)
        os.rmdir(tmp)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("media")
    parser.add_argument("--manifest", default=None)
    parser.add_argument("--fps", type=float, default=0.25)
    parser.add_argument("--max-frames", type=int, default=200)
    parser.add_argument("--json", default=None)
    args = parser.parse_args()

    findings, saw_manifest_rows = manifest_findings(args.manifest)
    frames_checked = 0
    skipped_reason = None
    if not saw_manifest_rows:
        ocr, frames_checked, skipped_reason = ocr_findings(args.media, args.fps, args.max_frames)
        findings.extend(ocr)

    result = {
        "check": "clean_segment_source_scrub",
        "media": args.media,
        "duration": round(duration(args.media), 1),
        "manifest_checked": bool(args.manifest),
        "frames_checked": frames_checked,
        "findings": findings[:30],
        "pass": len(findings) == 0,
    }
    if skipped_reason and not findings:
        result.update({"pass": None, "skipped": True, "reason": skipped_reason})

    out = json.dumps(result, indent=2)
    if args.json:
        open(args.json, "w", encoding="utf8").write(out)
    print(out)
    sys.exit(0 if result["pass"] in (True, None) else 1)


if __name__ == "__main__":
    main()
