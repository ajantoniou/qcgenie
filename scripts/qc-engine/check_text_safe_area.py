#!/usr/bin/env python3
"""
CHECK — TEXT SAFE AREA.
Blocks OCR-detected overlay words outside platform-safe regions. This covers Shorts action chrome
and lower UI overlap failures, plus long-form title-safe margin violations.

Exit 0 = clean, 1 = unsafe text found, 0/skip if Tesseract is unavailable.
Usage: check_text_safe_area.py VIDEO [--platform auto|shorts|longform] [--fps 0.5] [--json out.json]
"""
import argparse
import glob
import json
import os
import shutil
import subprocess
import sys
import tempfile
from PIL import Image

from check_canvas_fill import probe
from check_text_contrast import run_tesseract_tsv

def safe_box(width, height, platform):
    if platform == "auto":
        platform = "shorts" if height > width else "longform"
    if platform == "shorts":
        # Matches NTO's locked YouTube Shorts safe-area rule: left margin, right action chrome,
        # top UI, and bottom caption/title/channel chrome.
        return {
            "platform": "shorts",
            "left": int(width * 60 / 1080),
            "top": int(height * 100 / 1920),
            "right": int(width * 970 / 1080),
            "bottom": int(height * 1600 / 1920),
        }
    return {
        "platform": "longform",
        "left": int(width * 0.06),
        "top": int(height * 0.06),
        "right": int(width * 0.94),
        "bottom": int(height * 0.90),
    }

def scale_box(box, from_size, to_size):
    fw, fh = from_size
    tw, th = to_size
    sx = tw / max(fw, 1)
    sy = th / max(fh, 1)
    l, t, r, b = box
    return [int(round(l * sx)), int(round(t * sy)), int(round(r * sx)), int(round(b * sy))]

def outside(box, safe):
    l, t, r, b = box
    return l < safe["left"] or t < safe["top"] or r > safe["right"] or b > safe["bottom"]

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("video")
    parser.add_argument("--platform", choices=["auto", "shorts", "longform"], default="auto")
    parser.add_argument("--fps", type=float, default=0.5)
    parser.add_argument("--min-run", type=float, default=1.0)
    parser.add_argument("--max-frames", type=int, default=240)
    parser.add_argument("--json", default=None)
    args = parser.parse_args()

    if not shutil.which("tesseract"):
        result = {
            "check": "text_safe_area",
            "pass": None,
            "skipped": True,
            "reason": "tesseract missing — text safe-area requires OCR word boxes",
        }
        out = json.dumps(result, indent=2)
        if args.json:
            open(args.json, "w").write(out)
        print(out)
        sys.exit(0)

    width, height, total = probe(args.video)
    native_safe = safe_box(width, height, args.platform)
    tmp = tempfile.mkdtemp(prefix="qcsafe_")
    try:
        subprocess.run(
            ["ffmpeg", "-y", "-i", args.video, "-vf", f"fps={args.fps},scale=720:-1", os.path.join(tmp, "f_%05d.jpg")],
            capture_output=True,
        )
        frames = sorted(glob.glob(os.path.join(tmp, "f_*.jpg")))[: args.max_frames]
        per_frame = []
        for idx, frame in enumerate(frames):
            img = Image.open(frame)
            frame_safe = safe_box(img.width, img.height, native_safe["platform"])
            unsafe = []
            for word in run_tesseract_tsv(frame):
                box = word["box"]
                if outside(box, frame_safe):
                    unsafe.append({
                        "text": word["text"],
                        "conf": round(word["conf"], 1),
                        "box": scale_box(box, img.size, (width, height)),
                        "safe_box": native_safe,
                    })
            per_frame.append({"t": round(idx / args.fps, 1), "unsafe_words": unsafe})
    finally:
        for frame in glob.glob(os.path.join(tmp, "*.jpg")):
            os.unlink(frame)
        os.rmdir(tmp)

    runs = []
    cur = []
    step = 1.0 / args.fps
    for frame in per_frame:
        if frame["unsafe_words"]:
            cur.append(frame)
        else:
            maybe_add_run(runs, cur, step, args.min_run)
            cur = []
    maybe_add_run(runs, cur, step, args.min_run)

    result = {
        "check": "text_safe_area",
        "video": args.video,
        "width": width,
        "height": height,
        "duration": round(total, 1),
        "platform": native_safe["platform"],
        "safe_box": native_safe,
        "unsafe_text_runs": runs,
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
    runs.append({
        "t_start": frames[0]["t"],
        "t_end": round(frames[-1]["t"] + step, 1),
        "seconds": round(seconds, 1),
        "words": frames[0]["unsafe_words"][:5],
    })

if __name__ == "__main__":
    main()
