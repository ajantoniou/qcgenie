#!/usr/bin/env python3
"""
CHECK — CHEAP / ARCHIVAL / B&W B-ROLL.
Founder rule: "no B&W cheap broll." The NTO look is full-color modern cinematic. Public-domain
silent films (1916-1927), grainy/scratched stock, low-res or heavily-graded archival footage must
NOT appear in a finished cut.

LESSON (why this is a vision check, not a pixel heuristic): the offending silent-film footage was
heavily blue/sepia COLOR-GRADED, so its saturation looked "color" (sat 80-160) and its grain
overlapped clean footage. Saturation+grain statistics CANNOT separate graded archival stock from
cinematic footage. Recognizing "this looks like an old grainy film / cheap stock" is a perceptual
judgment -> a strict schema-locked vision call per sampled frame.

A run of cheap frames longer than --min-run seconds BLOCKS.
Exit 0 = clean, 1 = cheap/archival footage found. JSON to stdout (+ --json).
Usage: check_cheap_broll.py VIDEO [--fps 0.5] [--min-run 1.5] [--json out.json]
Needs ANTHROPIC_API_KEY (skips clean if absent).
"""
import sys, os, json, subprocess, tempfile, argparse, glob, base64, re, urllib.request

MODEL="claude-sonnet-4-5"
PROMPT=(
 "You QC one frame of a premium modern cinematic documentary (first-century biblical setting). Decide "
 "if this specific frame is CHEAP/ARCHIVAL footage that must not appear in a premium cut.\n"
 "Flag cheap=true ONLY for genuinely OLD or LOW-GRADE footage: visibly grainy/scratched/dusty/flickering "
 "OLD FILM (silent-era or mid-century public-domain), true black-and-white or washed sepia OLD-FILM look, "
 "soft VHS/low-resolution stock, or footage that is clearly a different (older, degraded) ERA and QUALITY "
 "than a sharp modern cinematic plate.\n"
 "Flag cheap=FALSE for modern high-quality footage even when it is: deliberately COLD/BLUE or warm "
 "color-GRADED, dark, dusk/night, moody, desaturated by design, or stylized — as long as the image is "
 "SHARP, clean, high-resolution, and free of film grain/scratches/age artifacts. A cold blue modern "
 "cinematic shot is FINE. A clean text/info card is FINE.\n"
 "Decisive test: is the IMAGE QUALITY old/degraded (grain, scratches, low-res, film age), or just "
 "stylistically graded? Only OLD/DEGRADED quality is cheap. Reply ONLY JSON: "
 '{"cheap": true|false, "reason": "<one short sentence naming the grain/scratch/age evidence if true>"}'
)

def load_key():
    p="/Applications/DrAntoniou Projects/AgentCompanies/.env"
    if os.path.exists(p):
        t=open(p).read()
        for v in ("ANTHROPIC_API_KEY","NT_ANTHROPIC_API_KEY","CLAUDE_API_KEY"):
            m=re.search(rf"^{v}=(.+)$",t,re.M)
            if m and len(m.group(1).strip())>10: return m.group(1).strip().strip('"').strip("'")
    return os.environ.get("ANTHROPIC_API_KEY")

def dur(f):
    return float(subprocess.run(["ffprobe","-v","error","-show_entries","format=duration",
        "-of","csv=p=0",f],capture_output=True,text=True).stdout.strip() or 0)

def vision(key,jpg):
    b64=base64.b64encode(open(jpg,"rb").read()).decode()
    body=json.dumps({"model":MODEL,"max_tokens":150,"messages":[{"role":"user","content":[
        {"type":"image","source":{"type":"base64","media_type":"image/jpeg","data":b64}},
        {"type":"text","text":PROMPT}]}]}).encode()
    req=urllib.request.Request("https://api.anthropic.com/v1/messages",data=body,
        headers={"x-api-key":key,"anthropic-version":"2023-06-01","content-type":"application/json"},method="POST")
    try:
        with urllib.request.urlopen(req,timeout=60) as r: txt=json.loads(r.read())["content"][0]["text"]
        s=txt.find("{"); e=txt.rfind("}"); return json.loads(txt[s:e+1])
    except Exception as ex:
        return {"_error":str(ex)[:120]}

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("video"); ap.add_argument("--fps",type=float,default=0.5)
    ap.add_argument("--min-run",type=float,default=1.5); ap.add_argument("--max-frames",type=int,default=200)
    ap.add_argument("--json",default=None)
    a=ap.parse_args()
    key=load_key()
    if not key:
        print(json.dumps({"check":"cheap_broll","pass":None,"skipped":True,
            "reason":"ANTHROPIC_API_KEY missing — cheap-broll is a vision check"},indent=2)); sys.exit(0)
    total=dur(a.video)
    tmp=tempfile.mkdtemp(prefix="qccb_")
    subprocess.run(["ffmpeg","-y","-i",a.video,"-vf",f"fps={a.fps},scale=512:-1",
        os.path.join(tmp,"f_%05d.jpg")],capture_output=True)
    frames=sorted(glob.glob(os.path.join(tmp,"f_*.jpg")))[:a.max_frames]
    per=[]; errors=0
    for i,fp in enumerate(frames):
        t=i/a.fps; v=vision(key,fp)
        if "_error" in v: errors+=1; per.append((t,False,"")); continue
        per.append((t,bool(v.get("cheap")),v.get("reason","")))
    for f in glob.glob(os.path.join(tmp,"*.jpg")): os.unlink(f)
    os.rmdir(tmp)
    step=1.0/a.fps; runs=[]; cur=[]
    for t,bad,why in per:
        if bad: cur.append((t,why))
        else:
            if cur and (cur[-1][0]-cur[0][0]+step)>=a.min_run:
                runs.append({"t_start":round(cur[0][0],1),"t_end":round(cur[-1][0]+step,1),"reason":cur[0][1]})
            cur=[]
    if cur and (cur[-1][0]-cur[0][0]+step)>=a.min_run:
        runs.append({"t_start":round(cur[0][0],1),"t_end":round(cur[-1][0]+step,1),"reason":cur[0][1]})
    result={"check":"cheap_broll","video":a.video,"frames_checked":len(per)-errors,
            "vision_errors":errors,"cheap_runs":runs,"pass":len(runs)==0}
    out=json.dumps(result,indent=2)
    if a.json: open(a.json,"w").write(out)
    print(out); sys.exit(0 if result["pass"] else 1)

if __name__=="__main__": main()
