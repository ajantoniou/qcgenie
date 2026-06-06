#!/usr/bin/env python3
"""
CHECK — LOOPING & FREEZING (deterministic, no ML).
A) FREEZE: ffmpeg freezedetect at -50dB plus a sensitive -60dB pass (catches subtle internal holds).
   This is authoritative and correctly PASSES static-background shots that still have real motion.
B) REPEATED SHOT (opt-in --detect-repeats): perceptual dhash; requires a long near-exact sustained
   run at both ends. OFF by default (noisy on cinematic footage; the build-time clip ledger is the
   real anti-reuse control).
Exit 0 = clean, exit 1 = freeze/repeat. JSON to stdout (+ --json file).
Usage: check_loop_freeze.py VIDEO [--freeze-min 2.5] [--detect-repeats] [--repeat-gap 20] [--fps 1] [--json out.json]
"""
import sys, os, json, subprocess, tempfile, argparse, re, glob
from PIL import Image

def dur(f):
    return float(subprocess.run(["ffprobe","-v","error","-show_entries","format=duration",
        "-of","csv=p=0",f],capture_output=True,text=True).stdout.strip() or 0)

def freezedetect_db(video, fmin, noise):
    out = subprocess.run(["ffmpeg","-i",video,"-vf",f"freezedetect=n={noise}:d={fmin}",
        "-map","0:v","-f","null","-"],capture_output=True,text=True).stderr
    s = [float(x) for x in re.findall(r"freeze_start: ([\d.]+)", out)]
    d = [float(x) for x in re.findall(r"freeze_duration: ([\d.]+)", out)]
    return [{"t_start": round(a,1), "duration": round(b,1)} for a,b in zip(s,d)]

def is_text_card(video, t):
    """A held frame is an INTENDED static card (Remotion scripture/explainer) — not a freeze defect —
    if at its midpoint it looks like a graphic card: mostly dark background with concentrated bright
    text, low photographic mid-tone mass. A frozen photographic clip (e.g. a stuck Jesus close-up) has
    a broad mid-tone histogram instead. Deterministic, no ML. Returns True for text/graphic cards."""
    with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as tf: fp = tf.name
    subprocess.run(["ffmpeg","-y","-ss",str(t),"-i",video,"-frames:v","1","-vf","scale=320:180",fp],
        capture_output=True)
    try:
        img = Image.open(fp).convert("L"); px = list(img.getdata()); n = len(px) or 1
        dark = sum(1 for v in px if v < 40) / n        # letterbox / dark card bg
        bright = sum(1 for v in px if v > 200) / n     # text glyphs / titles
        mid = sum(1 for v in px if 70 <= v <= 180) / n # photographic mid-tones (skin/cloth/scene)
    finally:
        try: os.unlink(fp)
        except OSError: pass
    # Card: lots of dark bg, a sliver of bright text, little photographic mid-tone mass.
    return dark > 0.45 and bright > 0.005 and mid < 0.40

def dhash(path, size=16):
    img = Image.open(path).convert("L").resize((size+1, size), Image.BILINEAR)
    px = list(img.getdata()); bits = 0
    for row in range(size):
        base = row*(size+1)
        for col in range(size):
            bits = (bits << 1) | (1 if px[base+col] > px[base+col+1] else 0)
    return bits

def hamming(a,b): return bin(a ^ b).count("1")

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("video"); ap.add_argument("--freeze-min", type=float, default=2.5)
    ap.add_argument("--detect-repeats", action="store_true")
    ap.add_argument("--repeat-gap", type=float, default=20.0)
    ap.add_argument("--fps", type=float, default=1.0); ap.add_argument("--json", default=None)
    a = ap.parse_args()
    total = dur(a.video)
    raw_freezes = freezedetect_db(a.video, a.freeze_min, "-50dB")
    # Classify each held frame: an intended static TEXT/GRAPHIC card (Remotion scripture/explainer)
    # is NOT a defect; a frozen PHOTOGRAPHIC clip is. Probe the hold midpoint.
    freezes = []; held_cards = []
    for f in raw_freezes:
        mid_t = f["t_start"] + min(f["duration"], 2.0) / 2.0
        if is_text_card(a.video, mid_t):
            held_cards.append({**f, "type": "STATIC_CARD_HELD_OK"})
        else:
            freezes.append(f)
    freezes_sensitive = [f for f in freezedetect_db(a.video, a.freeze_min, "-60dB")
                         if not any(abs(f["t_start"]-g["t_start"])<1 for g in freezes)
                         and not any(abs(f["t_start"]-c["t_start"])<1 for c in held_cards)
                         and not is_text_card(a.video, f["t_start"] + min(f["duration"],2.0)/2.0)]
    repeats = []
    if a.detect_repeats:
        H=10; minrun=max(3,int(max(3.0,1.0/a.fps*3)*a.fps))
        tmp=tempfile.mkdtemp(prefix="qcloop_")
        subprocess.run(["ffmpeg","-y","-i",a.video,"-vf",f"fps={a.fps},scale=320:180",
            os.path.join(tmp,"f_%05d.jpg")],capture_output=True)
        fr=sorted(glob.glob(os.path.join(tmp,"f_*.jpg"))); hs=[]
        for i,fp in enumerate(fr):
            try: hs.append((i/a.fps,dhash(fp)))
            except: pass
        n=len(hs); used=set()
        for i in range(n):
            ti,hi=hs[i]
            for j in range(i+minrun,n):
                if hs[j][0]-ti<a.repeat_gap or j in used: continue
                if all(j+k<n and hamming(hs[i+k][1],hs[j+k][1])<=H for k in range(minrun)):
                    repeats.append({"t_a":round(ti,1),"t_b":round(hs[j][0],1)})
                    for k in range(minrun): used.add(j+k)
                    break
        for f in glob.glob(os.path.join(tmp,"*.jpg")): os.unlink(f)
        os.rmdir(tmp)
    result={"check":"loop_freeze","video":a.video,"duration":round(total,1),
            "freezes":freezes,"freezes_sensitive_60dB":freezes_sensitive,
            "held_cards_ok":held_cards,"repeated_shots":repeats,
            "pass":(len(freezes)==0 and len(freezes_sensitive)==0 and len(repeats)==0)}
    out=json.dumps(result,indent=2)
    if a.json: open(a.json,"w").write(out)
    print(out); sys.exit(0 if result["pass"] else 1)

if __name__=="__main__": main()
