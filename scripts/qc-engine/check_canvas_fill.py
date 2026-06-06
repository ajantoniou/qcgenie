#!/usr/bin/env python3
"""
CHECK — CANVAS / ASPECT FILL.
Blocks pillarbox/letterbox/gutter failures where the encoded frame is technically the right size
but visible content is pasted into a narrow column or band. This covers NTO's "letterbox tower"
failure mode and long-form portrait-on-16:9 mistakes.

Exit 0 = clean, 1 = canvas/aspect defect. JSON to stdout (+ --json).
Usage: check_canvas_fill.py VIDEO [--fps 0.5] [--max-bar-pct 5] [--json out.json]
"""
import argparse
import glob
import json
import os
import subprocess
import sys
import tempfile
from PIL import Image

BLACK_LUMA = 18
BLACK_RATIO = 0.88

def probe(path):
    dim = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0:s=x", path],
        capture_output=True,
        text=True,
    ).stdout.strip()
    dur = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path],
        capture_output=True,
        text=True,
    ).stdout.strip()
    if "x" not in dim:
        return 0, 0, 0.0
    w, h = [int(v) for v in dim.split("x")[:2]]
    return w, h, float(dur or 0)

def black_edges(image):
    gray = image.convert("L")
    w, h = gray.size
    px = gray.load()

    def col_black(x):
        return sum(1 for y in range(h) if px[x, y] <= BLACK_LUMA) / max(h, 1) >= BLACK_RATIO

    def row_black(y):
        return sum(1 for x in range(w) if px[x, y] <= BLACK_LUMA) / max(w, 1) >= BLACK_RATIO

    left = 0
    while left < w and col_black(left):
        left += 1
    right = 0
    while right < w and col_black(w - 1 - right):
        right += 1
    top = 0
    while top < h and row_black(top):
        top += 1
    bottom = 0
    while bottom < h and row_black(h - 1 - bottom):
        bottom += 1

    return {
        "left_pct": round(left / max(w, 1) * 100, 2),
        "right_pct": round(right / max(w, 1) * 100, 2),
        "top_pct": round(top / max(h, 1) * 100, 2),
        "bottom_pct": round(bottom / max(h, 1) * 100, 2),
    }

def aspect_label(width, height):
    if not width or not height:
        return "unknown"
    return "vertical" if height > width else "longform"

def expected_aspect(label):
    return 9 / 16 if label == "vertical" else 16 / 9

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("video")
    parser.add_argument("--fps", type=float, default=0.5)
    parser.add_argument("--max-bar-pct", type=float, default=5.0)
    parser.add_argument("--aspect-tolerance", type=float, default=0.04)
    parser.add_argument("--json", default=None)
    args = parser.parse_args()

    width, height, total = probe(args.video)
    label = aspect_label(width, height)
    aspect = width / height if height else 0
    expected = expected_aspect(label)
    findings = []
    if width <= 0 or height <= 0:
        findings.append({"t_start": 0, "reason": "No video stream dimensions found."})
    elif abs(aspect - expected) / expected > args.aspect_tolerance:
        findings.append({
            "t_start": 0,
            "reason": f"Frame aspect {width}x{height} does not match expected {label} aspect.",
            "width": width,
            "height": height,
        })

    tmp = tempfile.mkdtemp(prefix="qccanvas_")
    try:
        subprocess.run(
            ["ffmpeg", "-y", "-i", args.video, "-vf", f"fps={args.fps},scale=640:-1", os.path.join(tmp, "f_%05d.jpg")],
            capture_output=True,
        )
        frames = sorted(glob.glob(os.path.join(tmp, "f_*.jpg")))
        for idx, frame in enumerate(frames):
            edges = black_edges(Image.open(frame))
            max_horizontal = max(edges["left_pct"], edges["right_pct"])
            max_vertical = max(edges["top_pct"], edges["bottom_pct"])
            if max_horizontal > args.max_bar_pct or max_vertical > args.max_bar_pct:
                findings.append({
                    "t_start": round(idx / args.fps, 1),
                    "reason": "Black canvas gutter/pillarbox/letterbox detected.",
                    **edges,
                })
    finally:
        for frame in glob.glob(os.path.join(tmp, "*.jpg")):
            os.unlink(frame)
        os.rmdir(tmp)

    # Avoid reporting every sampled frame for one continuous layout defect.
    compact = compact_findings(findings)
    result = {
        "check": "canvas_fill",
        "video": args.video,
        "width": width,
        "height": height,
        "duration": round(total, 1),
        "orientation": label,
        "findings": compact,
        "pass": len(compact) == 0,
    }
    out = json.dumps(result, indent=2)
    if args.json:
        open(args.json, "w").write(out)
    print(out)
    sys.exit(0 if result["pass"] else 1)

def compact_findings(findings):
    if not findings:
        return []
    by_reason = {}
    for item in findings:
        key = item.get("reason", "canvas finding")
        if key not in by_reason:
            by_reason[key] = item
    return list(by_reason.values())

if __name__ == "__main__":
    main()
