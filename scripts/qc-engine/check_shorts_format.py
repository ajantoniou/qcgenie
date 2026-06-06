#!/usr/bin/env python3
"""
CHECK — SHORTS FORMAT.
NTO-derived Shorts hard-fail gate:
- exact 1080x1920 frame
- duration 50-60s by default
- no black gutters/pillarbox/letterbox
- OCR text appears in the opening and footer windows
- optional dialogue detection: if Scribe returns speech, flag it (text-card shorts should be music-only)

Exit 0 = clean, 1 = Shorts format defect. JSON to stdout (+ --json).
Usage: check_shorts_format.py VIDEO [--json out.json]
"""
import argparse
import glob
import json
import os
import shutil
import subprocess
import sys
import tempfile
import urllib.request
import urllib.error
from PIL import Image

from check_canvas_fill import black_edges, probe
from check_text_contrast import run_tesseract_tsv
from check_text_safe_area import safe_box, outside, scale_box

def load_elevenlabs_key():
    for path in ("/Applications/DrAntoniou Projects/AgentCompanies/.env", os.path.join(os.path.dirname(__file__), ".env"), ".env"):
        if os.path.exists(path):
            for line in open(path):
                line = line.strip()
                if line.startswith("ELEVENLABS_API_KEY=") and len(line.split("=", 1)[1]) > 10:
                    return line.split("=", 1)[1].strip().strip('"').strip("'")
    return os.environ.get("ELEVENLABS_API_KEY")

def scribe_text(media, key, lang):
    with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tf:
        audio = tf.name
    subprocess.run(["ffmpeg", "-y", "-i", media, "-vn", "-ar", "44100", "-ac", "1", audio], capture_output=True)
    boundary = "----qcshort"
    data = open(audio, "rb").read()
    body = b"".join([
        (f'--{boundary}\r\nContent-Disposition: form-data; name="model_id"\r\n\r\nscribe_v1\r\n').encode(),
        (f'--{boundary}\r\nContent-Disposition: form-data; name="language_code"\r\n\r\n{lang}\r\n').encode(),
        (f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="a.mp3"\r\nContent-Type: audio/mpeg\r\n\r\n').encode(),
        data,
        f"\r\n--{boundary}--\r\n".encode(),
    ])
    os.unlink(audio)
    req = urllib.request.Request(
        "https://api.elevenlabs.io/v1/speech-to-text",
        data=body,
        headers={"xi-api-key": key, "Content-Type": f"multipart/form-data; boundary={boundary}"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=180) as res:
            return (json.loads(res.read()).get("text") or "").strip()
    except urllib.error.HTTPError as ex:
        return f"_ERROR_HTTP_{ex.code}"

def has_ocr_text(video, start, duration, min_words):
    if not shutil.which("tesseract"):
        return None
    with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as frame:
        frame_path = frame.name
    try:
        subprocess.run(["ffmpeg", "-y", "-ss", str(start), "-i", video, "-frames:v", "1", "-vf", "scale=720:-1", frame_path], capture_output=True)
        words = run_tesseract_tsv(frame_path)
        return len(words) >= min_words
    finally:
        try:
            os.unlink(frame_path)
        except OSError:
            pass

def gutter_findings(video, max_bar_pct):
    tmp = tempfile.mkdtemp(prefix="qcshorts_")
    findings = []
    try:
        subprocess.run(["ffmpeg", "-y", "-i", video, "-vf", "fps=0.5,scale=640:-1", os.path.join(tmp, "f_%05d.jpg")], capture_output=True)
        for idx, frame in enumerate(sorted(glob.glob(os.path.join(tmp, "f_*.jpg")))):
            edges = black_edges(Image.open(frame))
            if max(edges.values()) > max_bar_pct:
                findings.append({"t_start": idx * 2, "reason": "Black gutters detected in Short.", **edges})
                break
    finally:
        for frame in glob.glob(os.path.join(tmp, "*.jpg")):
            os.unlink(frame)
        os.rmdir(tmp)
    return findings

def text_safe_area_findings(video, width, height):
    if not shutil.which("tesseract"):
        return [], ["text_safe_area"]
    native_safe = safe_box(width, height, "shorts")
    findings = []
    with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as frame:
        frame_path = frame.name
    try:
        # The highest-risk windows are opener and footer; use the same regions this gate requires.
        for timestamp in (1.0, 52.0):
            subprocess.run(["ffmpeg", "-y", "-ss", str(timestamp), "-i", video, "-frames:v", "1", "-vf", "scale=720:-1", frame_path], capture_output=True)
            image = Image.open(frame_path)
            frame_safe = safe_box(image.width, image.height, "shorts")
            unsafe_words = []
            for word in run_tesseract_tsv(frame_path):
                if outside(word["box"], frame_safe):
                    unsafe_words.append({
                        "text": word["text"],
                        "conf": round(word["conf"], 1),
                        "box": scale_box(word["box"], image.size, (width, height)),
                        "safe_box": native_safe,
                    })
            if unsafe_words:
                findings.append({
                    "t_start": timestamp,
                    "reason": "Shorts text outside safe area.",
                    "words": unsafe_words[:5],
                })
                break
    finally:
        try:
            os.unlink(frame_path)
        except OSError:
            pass
    return findings, []

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("video")
    parser.add_argument("--min-duration", type=float, default=50.0)
    parser.add_argument("--max-duration", type=float, default=60.5)
    parser.add_argument("--max-bar-pct", type=float, default=5.0)
    parser.add_argument("--lang", default="eng")
    parser.add_argument("--json", default=None)
    args = parser.parse_args()

    width, height, total = probe(args.video)
    findings = []
    skipped = []

    if width != 1080 or height != 1920:
        findings.append({"t_start": 0, "reason": f"Short frame must be exactly 1080x1920; got {width}x{height}."})
    if total < args.min_duration or total > args.max_duration:
        findings.append({"t_start": 0, "reason": f"Short duration must be {args.min_duration:g}-{args.max_duration:g}s; got {total:.1f}s."})
    findings.extend(gutter_findings(args.video, args.max_bar_pct))
    safe_findings, safe_skipped = text_safe_area_findings(args.video, width, height)
    findings.extend(safe_findings)
    skipped.extend(safe_skipped)

    opener = has_ocr_text(args.video, 1.0, 1.0, 1)
    footer = has_ocr_text(args.video, max(total - 5.0, 0), 1.0, 1)
    if opener is False:
        findings.append({"t_start": 1.0, "reason": "No opening text card detected by OCR."})
    elif opener is None:
        skipped.append("opening_text_ocr")
    if footer is False:
        findings.append({"t_start": max(total - 5.0, 0), "reason": "No footer/end text card detected by OCR."})
    elif footer is None:
        skipped.append("footer_text_ocr")

    key = load_elevenlabs_key()
    if key:
        text = scribe_text(args.video, key, args.lang)
        if text and not text.startswith("_ERROR_"):
            findings.append({"t_start": 0, "reason": "Dialogue/speech detected in text-card Short.", "transcript": text[:120]})
    else:
        skipped.append("dialogue_detection")

    result = {
        "check": "shorts_format",
        "video": args.video,
        "width": width,
        "height": height,
        "duration": round(total, 1),
        "findings": findings[:8],
        "skipped": skipped,
        "pass": len(findings) == 0,
    }
    out = json.dumps(result, indent=2)
    if args.json:
        open(args.json, "w").write(out)
    print(out)
    sys.exit(0 if result["pass"] else 1)

if __name__ == "__main__":
    main()
