#!/usr/bin/env python3
"""
CHECK - REPEAT FATIGUE.
Blocks visual reuse that makes an upload look cheap:
- exact or near-exact rendered frame runs reused later in the asset
- optional storybook/edit manifest entries that reuse the same visual file
- optional manifest source-family dominance inside a rolling window

This gate is conservative by default. It is not a general "similar mood" detector; it only blocks
clear repeated visual evidence or explicit manifest reuse.

Exit 0 = clean, 1 = repeat fatigue found, 0/skip for audio-only media.
Usage: check_repeat_fatigue.py VIDEO [--manifest storybook.json] [--fps 0.25] [--json out.json]
"""
import argparse
import glob
import json
import os
import subprocess
import sys
import tempfile
import warnings
from collections import defaultdict
from PIL import Image

warnings.filterwarnings("ignore", category=DeprecationWarning)

def probe_video(path):
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
        return 0, 0, float(dur or 0)
    width, height = [int(v) for v in dim.split("x")[:2]]
    return width, height, float(dur or 0)


def dhash_image(image, size=16):
    img = image.convert("L").resize((size + 1, size), Image.BILINEAR)
    px = list(img.getdata())
    bits = 0
    for row in range(size):
        base = row * (size + 1)
        for col in range(size):
            bits = (bits << 1) | (1 if px[base + col] > px[base + col + 1] else 0)
    return bits


def average_rgb(image):
    small = image.convert("RGB").resize((1, 1), Image.BILINEAR)
    return small.getpixel((0, 0))


def hamming(a, b):
    return bin(a ^ b).count("1")


def rgb_distance(a, b):
    return sum((a[i] - b[i]) ** 2 for i in range(3)) ** 0.5


def looks_like_text_card(image):
    gray = image.convert("L")
    px = list(gray.getdata())
    n = len(px) or 1
    dark = sum(1 for v in px if v < 40) / n
    bright = sum(1 for v in px if v > 200) / n
    mid = sum(1 for v in px if 70 <= v <= 180) / n
    return dark > 0.45 and bright > 0.005 and mid < 0.40


def extract_frames(video, fps, max_frames):
    tmp = tempfile.mkdtemp(prefix="qcrepeat_")
    subprocess.run(
        ["ffmpeg", "-y", "-i", video, "-vf", f"fps={fps},scale=320:180", os.path.join(tmp, "f_%05d.jpg")],
        capture_output=True,
    )
    frames = sorted(glob.glob(os.path.join(tmp, "f_*.jpg")))[:max_frames]
    return tmp, frames


def rendered_repeats(video, fps, max_frames, repeat_gap, min_run, hash_distance, color_distance):
    tmp, frames = extract_frames(video, fps, max_frames)
    samples = []
    try:
        for idx, frame in enumerate(frames):
            try:
                image = Image.open(frame)
                if looks_like_text_card(image):
                    continue
                samples.append({"t": idx / fps, "hash": dhash_image(image), "rgb": average_rgb(image)})
            except Exception:
                continue
    finally:
        for frame in glob.glob(os.path.join(tmp, "*.jpg")):
            os.unlink(frame)
        os.rmdir(tmp)

    findings = []
    used = set()
    needed = max(2, int(round(min_run * fps)))
    for i in range(len(samples)):
        if i in used:
            continue
        for j in range(i + needed, len(samples)):
            if j in used or samples[j]["t"] - samples[i]["t"] < repeat_gap:
                continue
            ok = True
            for k in range(needed):
                if i + k >= len(samples) or j + k >= len(samples):
                    ok = False
                    break
                if hamming(samples[i + k]["hash"], samples[j + k]["hash"]) > hash_distance:
                    ok = False
                    break
                if rgb_distance(samples[i + k]["rgb"], samples[j + k]["rgb"]) > color_distance:
                    ok = False
                    break
            if ok:
                findings.append(
                    {
                        "t_start": round(samples[i]["t"], 1),
                        "t_repeat": round(samples[j]["t"], 1),
                        "duration": round(needed / fps, 1),
                        "reason": "Near-exact visual sequence reused later in the asset.",
                        "action": "Replace the repeated visual with a distinct shot, b-roll source, or generated variation.",
                    }
                )
                for k in range(needed):
                    used.add(i + k)
                    used.add(j + k)
                break
    return findings[:20]


def flatten_json(value):
    if isinstance(value, dict):
        yield value
        for child in value.values():
            yield from flatten_json(child)
    elif isinstance(value, list):
        for child in value:
            yield from flatten_json(child)


def load_manifest(path):
    if not path:
        return []
    try:
        data = json.load(open(path))
    except Exception:
        return []
    rows = []
    for item in flatten_json(data):
        visual = item.get("visual_file") or item.get("file") or item.get("path") or item.get("clip") or item.get("src")
        if not visual:
            continue
        source = item.get("source_family") or item.get("source") or item.get("library") or os.path.basename(str(visual)).split("-")[0]
        start = item.get("t_start") or item.get("start") or item.get("start_s") or item.get("time")
        duration = item.get("duration") or item.get("dur") or item.get("duration_s")
        try:
            start = float(start)
        except Exception:
            start = None
        try:
            duration = float(duration)
        except Exception:
            duration = None
        rows.append({"visual": str(visual), "source": str(source), "start": start, "duration": duration})
    return rows


def manifest_findings(rows, family_window, max_family_seconds):
    findings = []
    by_visual = defaultdict(list)
    timed = []
    for row in rows:
        by_visual[row["visual"]].append(row)
        if row["start"] is not None and row["duration"] is not None:
            timed.append(row)

    for visual, uses in by_visual.items():
        if len(uses) > 1:
            findings.append(
                {
                    "visual": visual,
                    "uses": len(uses),
                    "reason": "Same visual file reused in the edit manifest.",
                    "action": "Use the visual once only or replace later uses with distinct variations.",
                }
            )

    timed.sort(key=lambda row: row["start"])
    for idx, row in enumerate(timed):
        window_start = row["start"]
        window_end = window_start + family_window
        family_seconds = defaultdict(float)
        for other in timed[idx:]:
            if other["start"] >= window_end:
                break
            overlap = max(0.0, min(other["start"] + other["duration"], window_end) - max(other["start"], window_start))
            family_seconds[other["source"]] += overlap
        for source, seconds in family_seconds.items():
            if seconds > max_family_seconds:
                findings.append(
                    {
                        "t_start": round(window_start, 1),
                        "source_family": source,
                        "seconds": round(seconds, 1),
                        "window_seconds": family_window,
                        "reason": "One visual source family dominates the local edit window.",
                        "action": "Vary the source family or insert a distinct visual class.",
                    }
                )
    return findings[:20]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("video")
    parser.add_argument("--manifest", default=None)
    parser.add_argument("--fps", type=float, default=0.25)
    parser.add_argument("--max-frames", type=int, default=600)
    parser.add_argument("--repeat-gap", type=float, default=30.0)
    parser.add_argument("--min-run", type=float, default=3.0)
    parser.add_argument("--hash-distance", type=int, default=4)
    parser.add_argument("--color-distance", type=float, default=30.0)
    parser.add_argument("--family-window", type=float, default=120.0)
    parser.add_argument("--max-family-seconds", type=float, default=45.0)
    parser.add_argument("--json", default=None)
    args = parser.parse_args()

    width, height, total = probe_video(args.video)
    if width == 0 or height == 0:
        result = {
            "check": "repeat_fatigue",
            "pass": None,
            "skipped": True,
            "reason": "no video stream present",
        }
    else:
        findings = rendered_repeats(
            args.video,
            args.fps,
            args.max_frames,
            args.repeat_gap,
            args.min_run,
            args.hash_distance,
            args.color_distance,
        )
        rows = load_manifest(args.manifest)
        if rows:
            findings.extend(manifest_findings(rows, args.family_window, args.max_family_seconds))
        result = {
            "check": "repeat_fatigue",
            "video": args.video,
            "duration": round(total, 1),
            "frames_sampled_fps": args.fps,
            "manifest_entries": len(rows),
            "findings": findings[:20],
            "pass": len(findings) == 0,
        }

    out = json.dumps(result, indent=2)
    if args.json:
        open(args.json, "w").write(out)
    print(out)
    sys.exit(0 if result.get("pass") is not False else 1)


if __name__ == "__main__":
    main()
