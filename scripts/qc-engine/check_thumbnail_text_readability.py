#!/usr/bin/env python3
"""
CHECK - THUMBNAIL TEXT READABILITY.
Applies OCR text contrast and safe-area rules to thumbnail candidates. Designed for image uploads,
but video inputs are supported by extracting the first frame.

Exit 0 = clean, 1 = thumbnail text readability defect, 0/skip if Tesseract is unavailable.
Usage: check_thumbnail_text_readability.py IMAGE_OR_VIDEO [--min-contrast 3.0] [--json out.json]
"""
import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
from PIL import Image

from check_text_contrast import run_tesseract_tsv, word_contrast
from check_text_safe_area import outside, safe_box

IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tif", ".tiff"}


def is_image(path):
    return os.path.splitext(path.lower())[1] in IMAGE_EXTS


def frame_path(media, tmp):
    if is_image(media):
        return media
    out = os.path.join(tmp, "thumbnail-frame.jpg")
    subprocess.run(["ffmpeg", "-y", "-i", media, "-frames:v", "1", out], capture_output=True)
    return out if os.path.exists(out) else None


def analyze(image_path, min_contrast=3.0, platform="longform"):
    image = Image.open(image_path).convert("RGB")
    safe = safe_box(image.width, image.height, platform)
    low_contrast_words = []
    unsafe_words = []
    words_checked = 0

    for word in run_tesseract_tsv(image_path):
        words_checked += 1
        box = word["box"]
        ratio = word_contrast(image, box)
        if ratio is not None and ratio < min_contrast:
            low_contrast_words.append({
                "text": word["text"],
                "conf": round(word["conf"], 1),
                "contrast": round(ratio, 2),
                "box": list(box),
            })
        if outside(box, safe):
            unsafe_words.append({
                "text": word["text"],
                "conf": round(word["conf"], 1),
                "box": list(box),
                "safe_box": safe,
            })

    findings = []
    if low_contrast_words:
        findings.append({
            "label": "THUMBNAIL_LOW_CONTRAST_TEXT",
            "reason": "Thumbnail text is too low-contrast against the image/background.",
            "action": "Increase thumbnail text contrast, add a solid backing shape, or choose a cleaner background before upload.",
            "words": low_contrast_words[:8],
        })
    if unsafe_words:
        findings.append({
            "label": "THUMBNAIL_TEXT_UNSAFE_AREA",
            "reason": "Thumbnail text is too close to the edge or outside the safe composition area.",
            "action": "Move thumbnail text inward so it remains readable after platform cropping and previews.",
            "words": unsafe_words[:8],
        })

    return {
        "width": image.width,
        "height": image.height,
        "safe_box": safe,
        "words_checked": words_checked,
        "findings": findings,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("media")
    parser.add_argument("--min-contrast", type=float, default=3.0)
    parser.add_argument("--json", default=None)
    args = parser.parse_args()

    if not shutil.which("tesseract"):
        result = {
            "check": "thumbnail_text_readability",
            "pass": None,
            "skipped": True,
            "reason": "tesseract missing - thumbnail text readability requires OCR word boxes",
        }
        out = json.dumps(result, indent=2)
        if args.json:
            open(args.json, "w").write(out)
        print(out)
        sys.exit(0)

    tmp = tempfile.mkdtemp(prefix="qcthumb_")
    try:
        image_path = frame_path(args.media, tmp)
        if not image_path:
            result = {
                "check": "thumbnail_text_readability",
                "media": args.media,
                "findings": [{
                    "label": "THUMBNAIL_DECODE_FAILED",
                    "reason": "Could not decode a thumbnail image or first video frame.",
                    "action": "Verify the thumbnail/media file and rerun UploadCheck before upload."
                }],
                "pass": False,
            }
        else:
            analysis = analyze(image_path, args.min_contrast)
            result = {
                "check": "thumbnail_text_readability",
                "media": args.media,
                "width": analysis["width"],
                "height": analysis["height"],
                "safe_box": analysis["safe_box"],
                "words_checked": analysis["words_checked"],
                "findings": analysis["findings"],
                "pass": len(analysis["findings"]) == 0,
            }
    finally:
        for name in os.listdir(tmp):
            try:
                os.unlink(os.path.join(tmp, name))
            except OSError:
                pass
        os.rmdir(tmp)

    out = json.dumps(result, indent=2)
    if args.json:
        with open(args.json, "w", encoding="utf8") as handle:
            handle.write(out)
    print(out)
    sys.exit(0 if result["pass"] else 1)


if __name__ == "__main__":
    main()
