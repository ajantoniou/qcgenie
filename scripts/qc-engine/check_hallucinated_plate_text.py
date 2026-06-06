#!/usr/bin/env python3
"""
CHECK - HALLUCINATED PLATE TEXT.
Blocks unintended readable text inside AI/generated or library plates when the row is not an approved
Remotion/source/text card. This is a cheap OCR gate for NTO-style "silent-film intertitle",
watermark, bad sign, and garbled generated-text failures.

Exit 0 = clean, 1 = unintended plate text found, 0/skip if Tesseract is unavailable.
Usage: check_hallucinated_plate_text.py MEDIA [--manifest storybook.json] [--fps 0.25] [--json out.json]
"""
import argparse
import glob
import json
import os
import shutil
import subprocess
import sys
import tempfile

from check_text_contrast import run_tesseract_tsv

IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tif", ".tiff"}
APPROVED_TEXT_TERMS = (
    "remotion",
    "source card",
    "source-card",
    "text card",
    "title card",
    "chapter card",
    "verse card",
    "quote card",
    "citation card",
    "approved text",
    "approved_text",
)
CLASS_KEYS = ("visual_class", "visual_type", "type", "shot_type", "asset_type", "clip_type", "lane", "card_type")
TEXT_APPROVAL_KEYS = ("approved_text", "text_approved", "allow_text", "intended_text", "intentional_text")
FILE_KEYS = ("visual_file", "file", "path", "clip", "src", "asset", "asset_path")
START_KEYS = ("t_start", "start", "start_s", "time")
END_KEYS = ("t_end", "end", "end_s")
DURATION_KEYS = ("duration", "dur", "duration_s", "seconds", "length_s")


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


def flatten_json(value):
    if isinstance(value, dict):
        yield value
        for child in value.values():
            yield from flatten_json(child)
    elif isinstance(value, list):
        for child in value:
            yield from flatten_json(child)


def parse_float(value):
    try:
        return float(value)
    except Exception:
        return None


def truthy(value):
    if isinstance(value, bool):
        return value
    return str(value or "").strip().lower() in {"1", "true", "yes", "y", "approved", "allow", "allowed"}


def first_value(item, keys):
    for key in keys:
        value = item.get(key)
        if value not in (None, ""):
            return value
    return None


def item_text(item):
    parts = []
    for key in CLASS_KEYS + TEXT_APPROVAL_KEYS:
        value = item.get(key)
        if value not in (None, ""):
            parts.append(str(value))
    return " ".join(parts).lower()


def duration_for(item, start):
    dur = parse_float(first_value(item, DURATION_KEYS))
    if dur is not None:
        return dur
    end = parse_float(first_value(item, END_KEYS))
    if start is not None and end is not None and end >= start:
        return end - start
    return None


def load_approved_windows(manifest_path):
    if not manifest_path:
        return [], False
    try:
        data = json.load(open(manifest_path, encoding="utf8"))
    except Exception:
        return [], False
    windows = []
    global_approved_image = False
    for item in flatten_json(data):
        text = item_text(item)
        approved = any(term in text for term in APPROVED_TEXT_TERMS) or any(truthy(item.get(key)) for key in TEXT_APPROVAL_KEYS)
        if not approved:
            continue
        start = parse_float(first_value(item, START_KEYS))
        dur = duration_for(item, start)
        visual = first_value(item, FILE_KEYS)
        if start is None and visual:
            global_approved_image = True
        elif start is not None:
            windows.append({"start": start, "end": start + (dur or 999999.0), "reason": "approved_text_plate"})
    return windows, global_approved_image


def approved_at(timestamp, windows):
    return any(win["start"] <= timestamp < win["end"] for win in windows)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("media")
    parser.add_argument("--manifest", default=None)
    parser.add_argument("--fps", type=float, default=0.25)
    parser.add_argument("--max-frames", type=int, default=200)
    parser.add_argument("--json", default=None)
    args = parser.parse_args()

    if not shutil.which("tesseract"):
        result = {
            "check": "hallucinated_plate_text",
            "pass": None,
            "skipped": True,
            "reason": "tesseract missing - hallucinated plate text requires OCR word boxes",
        }
        out = json.dumps(result, indent=2)
        if args.json:
            open(args.json, "w").write(out)
        print(out)
        sys.exit(0)

    windows, approved_image = load_approved_windows(args.manifest)
    tmp = tempfile.mkdtemp(prefix="qchtext_")
    try:
        frames = extract_frames(args.media, tmp, args.fps, args.max_frames)
        findings = []
        if not frames:
            findings.append({
                "t": 0,
                "label": "PLATE_TEXT_DECODE_FAILED",
                "reason": "Could not decode any image/video frames for hallucinated plate text check.",
                "action": "Verify the media file is a real image/video and rerun UploadCheck before shipping.",
            })
        for idx, frame in enumerate(frames):
            timestamp = 0.0 if is_image(args.media) else idx / args.fps
            if approved_image or approved_at(timestamp, windows):
                continue
            words = run_tesseract_tsv(frame)
            visible = [{
                "text": word["text"],
                "conf": round(word["conf"], 1),
                "box": list(word["box"]),
            } for word in words[:10]]
            if visible:
                findings.append({
                    "t": round(timestamp, 1),
                    "label": "UNAPPROVED_PLATE_TEXT",
                    "reason": "Readable text appears inside a generated/library plate that is not marked as an approved text/source card.",
                    "action": "Replace the plate, crop/remove the unintended text, or mark the manifest row as an approved text/source card when intentional.",
                    "words": visible[:8],
                })
    finally:
        for frame in glob.glob(os.path.join(tmp, "*.jpg")):
            os.unlink(frame)
        os.rmdir(tmp)

    result = {
        "check": "hallucinated_plate_text",
        "media": args.media,
        "duration": round(duration(args.media), 1),
        "frames_checked": len(frames) if "frames" in locals() else 0,
        "approved_windows": windows[:20],
        "findings": findings[:20],
        "pass": len(findings) == 0,
    }
    out = json.dumps(result, indent=2)
    if args.json:
        open(args.json, "w", encoding="utf8").write(out)
    print(out)
    sys.exit(0 if result["pass"] else 1)


if __name__ == "__main__":
    main()
