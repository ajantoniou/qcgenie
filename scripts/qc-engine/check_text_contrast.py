#!/usr/bin/env python3
"""
CHECK — LOW-CONTRAST OVERLAY TEXT.
Founder/product rule: overlay text on image/video backgrounds must be readable. Text that blends
into footage, crosses the platform safe area, or is OCR-visible but low contrast should not ship.

This first gate is deterministic and cheap:
- sample frames with ffmpeg
- run Tesseract OCR TSV to locate visible words
- estimate WCAG-style luminance contrast between the word box and its surrounding background
- block sustained low-contrast runs

Exit 0 = clean, 1 = low-contrast text found, 0/skip if Tesseract is unavailable.
Usage: check_text_contrast.py VIDEO [--fps 0.5] [--min-contrast 3.0] [--min-run 1.0] [--json out.json]
"""
import argparse
import glob
import json
import os
import shutil
import subprocess
import sys
import tempfile
from PIL import Image, ImageDraw, ImageFont

MIN_WORD_CONF = 45
MIN_WORD_CHARS = 2

def duration(path):
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path],
        capture_output=True,
        text=True,
    ).stdout.strip()
    return float(out or 0)

def run_tesseract_tsv(image_path):
    cmd = ["tesseract", image_path, "stdout", "--psm", "6", "tsv"]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        return []
    rows = []
    lines = [line for line in proc.stdout.splitlines() if line.strip()]
    if not lines:
        return rows
    header = lines[0].split("\t")
    for line in lines[1:]:
        vals = line.split("\t")
        if len(vals) != len(header):
            continue
        row = dict(zip(header, vals))
        text = (row.get("text") or "").strip()
        try:
            conf = float(row.get("conf", "-1"))
            left = int(row.get("left", "0"))
            top = int(row.get("top", "0"))
            width = int(row.get("width", "0"))
            height = int(row.get("height", "0"))
        except ValueError:
            continue
        if conf < MIN_WORD_CONF or len(text) < MIN_WORD_CHARS or width < 4 or height < 4:
            continue
        rows.append({"text": text, "conf": conf, "box": (left, top, left + width, top + height)})
    return rows

def luminance(rgb):
    vals = []
    for c in rgb[:3]:
        x = c / 255.0
        vals.append(x / 12.92 if x <= 0.03928 else ((x + 0.055) / 1.055) ** 2.4)
    return 0.2126 * vals[0] + 0.7152 * vals[1] + 0.0722 * vals[2]

def median(values):
    if not values:
        return 0.0
    s = sorted(values)
    mid = len(s) // 2
    if len(s) % 2:
        return s[mid]
    return (s[mid - 1] + s[mid]) / 2.0

def percentile(values, pct):
    if not values:
        return 0.0
    s = sorted(values)
    idx = min(len(s) - 1, max(0, int(round((len(s) - 1) * pct))))
    return s[idx]

def contrast(a, b):
    lo, hi = sorted([a, b])
    return (hi + 0.05) / (lo + 0.05)

def word_contrast(image, box):
    w, h = image.size
    l, t, r, b = box
    pad = max(4, int((b - t) * 0.35))
    el, et, er, eb = max(0, l - pad), max(0, t - pad), min(w, r + pad), min(h, b + pad)

    word_lums = []
    bg_lums = []
    px = image.load()
    for y in range(et, eb):
        for x in range(el, er):
            lum = luminance(px[x, y])
            if l <= x < r and t <= y < b:
                word_lums.append(lum)
            else:
                bg_lums.append(lum)
    if len(word_lums) < 8 or len(bg_lums) < 8:
        return None

    bg = median(bg_lums)
    # Text is usually the high or low luminance extreme inside the word box. Try both tails and keep
    # the stronger foreground/background contrast.
    dark_fg = percentile(word_lums, 0.15)
    light_fg = percentile(word_lums, 0.85)
    return max(contrast(dark_fg, bg), contrast(light_fg, bg))

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("video")
    parser.add_argument("--fps", type=float, default=0.5)
    parser.add_argument("--min-contrast", type=float, default=3.0)
    parser.add_argument("--min-run", type=float, default=1.0)
    parser.add_argument("--max-frames", type=int, default=240)
    parser.add_argument("--json", default=None)
    args = parser.parse_args()

    if not shutil.which("tesseract"):
        result = {
            "check": "text_contrast",
            "pass": None,
            "skipped": True,
            "reason": "tesseract missing — text contrast requires OCR word boxes",
        }
        out = json.dumps(result, indent=2)
        if args.json:
            open(args.json, "w").write(out)
        print(out)
        sys.exit(0)

    total = duration(args.video)
    tmp = tempfile.mkdtemp(prefix="qctext_")
    try:
        subprocess.run(
            ["ffmpeg", "-y", "-i", args.video, "-vf", f"fps={args.fps},scale=720:-1", os.path.join(tmp, "f_%05d.jpg")],
            capture_output=True,
        )
        frames = sorted(glob.glob(os.path.join(tmp, "f_*.jpg")))[: args.max_frames]
        per_frame = []
        for idx, frame in enumerate(frames):
            timestamp = idx / args.fps
            image = Image.open(frame).convert("RGB")
            words = []
            for word in run_tesseract_tsv(frame):
                ratio = word_contrast(image, word["box"])
                if ratio is None:
                    continue
                if ratio < args.min_contrast:
                    words.append({
                        "text": word["text"],
                        "conf": round(word["conf"], 1),
                        "contrast": round(ratio, 2),
                        "box": list(word["box"]),
                    })
            per_frame.append({"t": round(timestamp, 1), "low_contrast_words": words})
    finally:
        for frame in glob.glob(os.path.join(tmp, "*.jpg")):
            os.unlink(frame)
        os.rmdir(tmp)

    step = 1.0 / args.fps
    runs = []
    cur = []
    for frame in per_frame:
        if frame["low_contrast_words"]:
            cur.append(frame)
        else:
            maybe_add_run(runs, cur, step, args.min_run)
            cur = []
    maybe_add_run(runs, cur, step, args.min_run)

    result = {
        "check": "text_contrast",
        "video": args.video,
        "duration": round(total, 1),
        "frames_checked": len(per_frame),
        "min_contrast": args.min_contrast,
        "low_contrast_runs": runs,
        "pass": len(runs) == 0,
    }
    out = json.dumps(result, indent=2)
    if args.json:
        open(args.json, "w").write(out)
    print(out)
    sys.exit(0 if result["pass"] else 1)

def maybe_add_run(runs, frames, step, min_run):
    if not frames:
        return
    seconds = frames[-1]["t"] - frames[0]["t"] + step
    if seconds < min_run:
        return
    first_words = frames[0]["low_contrast_words"][:5]
    runs.append({
        "t_start": frames[0]["t"],
        "t_end": round(frames[-1]["t"] + step, 1),
        "seconds": round(seconds, 1),
        "words": first_words,
    })

if __name__ == "__main__":
    main()
