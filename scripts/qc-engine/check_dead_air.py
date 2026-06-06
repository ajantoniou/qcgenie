#!/usr/bin/env python3
"""
CHECK - DEAD AIR / UNINTENDED SILENCE.
Blocks sustained silence in media with an audio track. This is a cheap deterministic gate for
podcasts, narration videos, and Shorts where unexpected dead air is a ship-blocking defect.

Exit 0 = clean, 1 = dead air found, 0/skip when no audio stream exists.
Usage: check_dead_air.py VIDEO_OR_AUDIO [--min-silence 1.5] [--threshold -45dB] [--json out.json]
"""
import argparse
import json
import re
import subprocess
import sys


def duration(path):
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path],
        capture_output=True,
        text=True,
    ).stdout.strip()
    return float(out or 0)


def has_audio(path):
    out = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-select_streams",
            "a",
            "-show_entries",
            "stream=index",
            "-of",
            "csv=p=0",
            path,
        ],
        capture_output=True,
        text=True,
    ).stdout.strip()
    return bool(out)


def silence_ranges(path, threshold, min_silence):
    proc = subprocess.run(
        [
            "ffmpeg",
            "-i",
            path,
            "-af",
            f"silencedetect=noise={threshold}:d={min_silence}",
            "-f",
            "null",
            "-",
        ],
        capture_output=True,
        text=True,
    )
    starts = [float(v) for v in re.findall(r"silence_start:\s*([\d.]+)", proc.stderr)]
    ends = [float(v) for v in re.findall(r"silence_end:\s*([\d.]+)", proc.stderr)]
    durations = [float(v) for v in re.findall(r"silence_duration:\s*([\d.]+)", proc.stderr)]
    total = duration(path)
    findings = []
    for idx, start in enumerate(starts):
        end = ends[idx] if idx < len(ends) else total
        length = durations[idx] if idx < len(durations) else max(0.0, end - start)
        findings.append(
            {
                "t_start": round(start, 2),
                "t_end": round(end, 2),
                "duration": round(length, 2),
                "reason": f"Dead air detected for {round(length, 2)} seconds.",
                "action": "Trim the silence, add intentional room tone/music, or mark the pause as intentional.",
            }
        )
    return findings


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("media")
    parser.add_argument("--min-silence", type=float, default=1.5)
    parser.add_argument("--threshold", default="-45dB")
    parser.add_argument("--json", default=None)
    args = parser.parse_args()

    if not has_audio(args.media):
        result = {
            "check": "dead_air",
            "pass": None,
            "skipped": True,
            "reason": "no audio stream present",
        }
        print(json.dumps(result, indent=2))
        if args.json:
            open(args.json, "w").write(json.dumps(result, indent=2))
        sys.exit(0)

    findings = silence_ranges(args.media, args.threshold, args.min_silence)
    result = {
        "check": "dead_air",
        "media": args.media,
        "threshold": args.threshold,
        "min_silence": args.min_silence,
        "findings": findings,
        "pass": len(findings) == 0,
    }
    print(json.dumps(result, indent=2))
    if args.json:
        open(args.json, "w").write(json.dumps(result, indent=2))
    sys.exit(0 if result["pass"] else 1)


if __name__ == "__main__":
    main()
