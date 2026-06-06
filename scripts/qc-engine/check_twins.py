#!/usr/bin/env python3
"""
CHECK — TWINS / CLONES.
Flag frames where the SAME person's face appears 2+ times (AI clone), a face is duplicated across a
crowd, or a lead is rendered as twins/triplets. Harness deterministic; per-frame judgment is a strict
schema-locked vision call (Anthropic API), not a freeform persona read.
Exit 0 = clean, 1 = twins. JSON to stdout (+ --json).
Usage: check_twins.py VIDEO_OR_IMAGE [--fps 0.25] [--max-frames 200] [--json out.json]
Needs ANTHROPIC_API_KEY (skips clean if absent).
"""
import sys, os, json, subprocess, tempfile, argparse, glob, base64, re, urllib.request

MODEL="claude-sonnet-4-5"
PROMPT=(
 "You are a strict image QC gate for an AI-generated historical documentary. Look ONLY for UNINTENDED "
 "DUPLICATE PEOPLE: the SAME person's face appearing two or more times in this single frame, OR one "
 "face clearly copy-pasted across a crowd, OR a scene where many extras share the same face/hair/body "
 "so the crowd needs more character variation. For crowd scenes, also flag if many background people "
 "look like variants of the same generated character: same long dark hair, same beard, same age, same "
 "robe silhouette, same facial structure, or multiple Jesus-like duplicates around the lead. This is a "
 "BLOCK even if the faces are not pixel-identical, because the scene needs more distinct characters. "
 "Distinct different extras are FINE. Background blur is "
 "FINE. Be conservative for small casts, but in large crowds flag clear same-face or same-silhouette repetition that an editor should change the "
 'render. Reply ONLY JSON: {"has_twins": true|false, "needs_more_character_variation": true|false, '
 '"duplicate_count": <int>, "reason": "<one short sentence>", "action": "<one short editor instruction>"}'
)
IMAGE_EXTS={".jpg",".jpeg",".png",".webp",".bmp",".tif",".tiff"}

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

def dims(f):
    out=subprocess.run(["ffprobe","-v","error","-select_streams","v:0","-show_entries","stream=width,height",
        "-of","csv=s=x:p=0",f],capture_output=True,text=True).stdout.strip()
    if not out or "x" not in out: return (0,0)
    w,h=out.split("x")[:2]
    return (int(w or 0), int(h or 0))

def is_image(path):
    return os.path.splitext(path.lower())[1] in IMAGE_EXTS

def write_image_frame(media,out,vf):
    cmd=["ffmpeg","-y","-i",media,"-frames:v","1"]
    if vf: cmd+=["-vf",vf]
    cmd+=[out]
    subprocess.run(cmd,capture_output=True)
    return os.path.exists(out)

def extract_frames(media,tmp,fps):
    if is_image(media):
        w,h=dims(media)
        frames=[]
        full=os.path.join(tmp,"t_00001_full.jpg")
        if write_image_frame(media,full,"scale='min(1536,iw)':-1"):
            frames.append(full)
        # Wide AI crowds fail when all extras are compressed into one 768px frame.
        # Add overlapping crops so the vision gate can inspect repeated faces at usable size.
        if w >= 1000 and h >= 500:
            crop_w=max(1, min(w, int(w*0.55)))
            starts=[0, max(0, int((w-crop_w)/2)), max(0, w-crop_w)]
            seen=set()
            for n,x in enumerate(starts, start=2):
                if x in seen: continue
                seen.add(x)
                out=os.path.join(tmp,f"t_{n:05d}_crop.jpg")
                vf=f"crop={crop_w}:{h}:{x}:0,scale='min(1280,iw)':-1"
                if write_image_frame(media,out,vf):
                    frames.append(out)
        return frames
    subprocess.run(["ffmpeg","-y","-i",media,"-vf",f"fps={fps},scale=768:-1",os.path.join(tmp,"t_%05d.jpg")],capture_output=True)
    return sorted(glob.glob(os.path.join(tmp,"t_*.jpg")))

def vision(key,jpg):
    b64=base64.b64encode(open(jpg,"rb").read()).decode()
    body=json.dumps({"model":MODEL,"max_tokens":200,"messages":[{"role":"user","content":[
        {"type":"image","source":{"type":"base64","media_type":"image/jpeg","data":b64}},
        {"type":"text","text":PROMPT}]}]}).encode()
    req=urllib.request.Request("https://api.anthropic.com/v1/messages",data=body,
        headers={"x-api-key":key,"anthropic-version":"2023-06-01","content-type":"application/json"},method="POST")
    try:
        with urllib.request.urlopen(req,timeout=60) as r: data=json.loads(r.read())
        txt=data["content"][0]["text"]; s=txt.find("{"); e=txt.rfind("}")
        parsed=json.loads(txt[s:e+1])
        parsed["_provider_usage"]={"provider":"anthropic","model":MODEL,"operation":"vision_frame",**(data.get("usage") or {})}
        return parsed
    except Exception as ex: return {"_error":str(ex)[:120]}

def normalize_twins_finding(v, t):
    return {
        "t": t,
        "duplicate_count": v.get("duplicate_count"),
        "needs_more_character_variation": True,
        "reason": v.get("reason",""),
        "action": v.get("action") or "Regenerate or edit the scene with more character variation."
    }

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("media"); ap.add_argument("--fps",type=float,default=0.25)
    ap.add_argument("--max-frames",type=int,default=200); ap.add_argument("--json",default=None)
    a=ap.parse_args()
    tmp=tempfile.mkdtemp(prefix="qctw_")
    frames=extract_frames(a.media,tmp,a.fps)[:a.max_frames]
    if not frames:
        result={"check":"twins","media":a.media,"media_type":"image" if is_image(a.media) else "video","frames_checked":0,"vision_errors":0,
                "findings":[{"t":0,"reason":"Could not decode any image/video frames for twins check.","action":"Verify the media file is a real image/video and rerun UploadCheck before shipping."}],"pass":False}
        out=json.dumps(result,indent=2)
        if a.json: open(a.json,"w").write(out)
        print(out); sys.exit(1)
    key=load_key()
    if not key:
        result={"check":"twins","media":a.media,"media_type":"image" if is_image(a.media) else "video","frames_checked":0,"vision_errors":0,
                "skipped":True,"reason":"ANTHROPIC_API_KEY missing","pass":None}
        out=json.dumps(result,indent=2)
        if a.json: open(a.json,"w").write(out)
        print(out); sys.exit(0)
    findings=[]; checked=0; errors=0; provider_usage=[]
    for i,fp in enumerate(frames):
        v=vision(key,fp)
        if "_error" in v: errors+=1; continue
        usage=v.pop("_provider_usage",None)
        if usage: provider_usage.append(usage)
        checked+=1
        if v.get("has_twins"):
            findings.append(normalize_twins_finding(v, 0 if is_image(a.media) else round(i/a.fps,1)))
    for f in glob.glob(os.path.join(tmp,"*.jpg")): os.unlink(f)
    os.rmdir(tmp)
    if checked == 0 and errors:
        findings.append({"t":0,"reason":"Twins vision model failed on every sampled frame.","action":"Fix the vision-model/runtime error and rerun UploadCheck before shipping."})
    result={"check":"twins","media":a.media,"media_type":"image" if is_image(a.media) else "video","frames_checked":checked,"vision_errors":errors,
            "provider_usage":provider_usage,
            "findings":findings,"pass":False if (checked == 0 and errors) else len(findings)==0}
    out=json.dumps(result,indent=2)
    if a.json: open(a.json,"w").write(out)
    print(out); sys.exit(0 if result["pass"] else 1)

if __name__=="__main__": main()
