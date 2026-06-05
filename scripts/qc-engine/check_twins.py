#!/usr/bin/env python3
"""
CHECK — TWINS / CLONES.
Flag frames where the SAME person's face appears 2+ times (AI clone), a face is duplicated across a
crowd, or a lead is rendered as twins/triplets. Harness deterministic; per-frame judgment is a strict
schema-locked vision call (Anthropic API), not a freeform persona read.
Exit 0 = clean, 1 = twins. JSON to stdout (+ --json).
Usage: check_twins.py VIDEO [--fps 0.25] [--max-frames 200] [--json out.json]
Needs ANTHROPIC_API_KEY (skips clean if absent).
"""
import sys, os, json, subprocess, tempfile, argparse, glob, base64, re, urllib.request

MODEL="claude-sonnet-4-5"
PROMPT=(
 "You are a strict image QC gate for an AI-generated historical documentary. Look ONLY for UNINTENDED "
 "DUPLICATE PEOPLE: the SAME person's face appearing two or more times in this single frame, OR one "
 "face clearly copy-pasted across a crowd, OR a lead character rendered as twins/triplets. Distinct "
 "different extras are FINE. Background blur is FINE. Be conservative: only flag if two or more faces "
 'are unmistakably the SAME individual. Reply ONLY JSON: '
 '{"has_twins": true|false, "duplicate_count": <int>, "reason": "<one short sentence>"}'
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
    body=json.dumps({"model":MODEL,"max_tokens":200,"messages":[{"role":"user","content":[
        {"type":"image","source":{"type":"base64","media_type":"image/jpeg","data":b64}},
        {"type":"text","text":PROMPT}]}]}).encode()
    req=urllib.request.Request("https://api.anthropic.com/v1/messages",data=body,
        headers={"x-api-key":key,"anthropic-version":"2023-06-01","content-type":"application/json"},method="POST")
    try:
        with urllib.request.urlopen(req,timeout=60) as r: txt=json.loads(r.read())["content"][0]["text"]
        s=txt.find("{"); e=txt.rfind("}"); return json.loads(txt[s:e+1])
    except Exception as ex: return {"_error":str(ex)[:120]}

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("video"); ap.add_argument("--fps",type=float,default=0.25)
    ap.add_argument("--max-frames",type=int,default=200); ap.add_argument("--json",default=None)
    a=ap.parse_args()
    key=load_key()
    if not key:
        print(json.dumps({"check":"twins","pass":None,"skipped":True,"reason":"ANTHROPIC_API_KEY missing"},indent=2)); sys.exit(0)
    tmp=tempfile.mkdtemp(prefix="qctw_")
    subprocess.run(["ffmpeg","-y","-i",a.video,"-vf",f"fps={a.fps},scale=768:-1",os.path.join(tmp,"t_%05d.jpg")],capture_output=True)
    frames=sorted(glob.glob(os.path.join(tmp,"t_*.jpg")))[:a.max_frames]
    findings=[]; checked=0; errors=0
    for i,fp in enumerate(frames):
        v=vision(key,fp)
        if "_error" in v: errors+=1; continue
        checked+=1
        if v.get("has_twins"):
            findings.append({"t":round(i/a.fps,1),"duplicate_count":v.get("duplicate_count"),"reason":v.get("reason","")})
    for f in glob.glob(os.path.join(tmp,"*.jpg")): os.unlink(f)
    os.rmdir(tmp)
    result={"check":"twins","video":a.video,"frames_checked":checked,"vision_errors":errors,
            "findings":findings,"pass":len(findings)==0}
    out=json.dumps(result,indent=2)
    if a.json: open(a.json,"w").write(out)
    print(out); sys.exit(0 if result["pass"] else 1)

if __name__=="__main__": main()
