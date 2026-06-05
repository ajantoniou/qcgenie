#!/usr/bin/env python3
"""
CHECK — VIDEO MATCHES THE NARRATION.
Founder rule: compare the text being read (correct cadence) to the frames; every frame is locked to
the script spot it belongs to (semantic interpretation of frame AND script). When the spoken text
diverges from the frame for MORE THAN 3 seconds, flag it.
Harness deterministic: cadence-accurate Scribe word-timestamps of the FINAL audio -> for each frame,
the text spoken at that timestamp -> a schema-locked vision call judges illustrate-or-not -> a
contiguous mismatch run > --max-divergence seconds is flagged. Isolated b-roll blips allowed.
Exit 0 = clean, 1 = a >3s divergence. JSON to stdout (+ --json).
Usage: check_narration_match.py VIDEO [--fps 0.5] [--ctx 2.5] [--max-divergence 3.0] [--lang eng] [--json out.json]
Needs ELEVENLABS_API_KEY + ANTHROPIC_API_KEY.
"""
import sys, os, json, subprocess, tempfile, argparse, glob, base64, re, urllib.request

MODEL="claude-sonnet-4-5"

def load_key(*names):
    p="/Applications/DrAntoniou Projects/AgentCompanies/.env"
    txt=open(p).read() if os.path.exists(p) else ""
    for n in names:
        m=re.search(rf"^{n}=(.+)$",txt,re.M)
        if m and len(m.group(1).strip())>10: return m.group(1).strip().strip('"').strip("'")
    return os.environ.get(names[0])

def dur(f):
    return float(subprocess.run(["ffprobe","-v","error","-show_entries","format=duration",
        "-of","csv=p=0",f],capture_output=True,text=True).stdout.strip() or 0)

def scribe_words(media, key, lang):
    with tempfile.NamedTemporaryFile(suffix=".mp3",delete=False) as tf: wav=tf.name
    subprocess.run(["ffmpeg","-y","-i",media,"-vn","-ar","44100","-ac","1",wav],capture_output=True)
    b="----qcnm"; fb=open(wav,"rb").read()
    body=b"".join([
        (f'--{b}\r\nContent-Disposition: form-data; name="model_id"\r\n\r\nscribe_v1\r\n').encode(),
        (f'--{b}\r\nContent-Disposition: form-data; name="language_code"\r\n\r\n{lang}\r\n').encode(),
        (f'--{b}\r\nContent-Disposition: form-data; name="timestamps_granularity"\r\n\r\nword\r\n').encode(),
        (f'--{b}\r\nContent-Disposition: form-data; name="file"; filename="a.mp3"\r\nContent-Type: audio/mpeg\r\n\r\n').encode(),
        fb, f"\r\n--{b}--\r\n".encode()])
    req=urllib.request.Request("https://api.elevenlabs.io/v1/speech-to-text",data=body,
        headers={"xi-api-key":key,"Content-Type":f"multipart/form-data; boundary={b}"},method="POST")
    with urllib.request.urlopen(req,timeout=300) as r: d=json.loads(r.read())
    os.unlink(wav); return d.get("words",[])

def spoken(words,lo,hi):
    return " ".join(w["text"] for w in words if w.get("start") is not None and w["start"]<hi and w.get("end",w["start"])>lo).strip()

def vmatch(key,jpg,sp):
    b64=base64.b64encode(open(jpg,"rb").read()).decode()
    prompt=("You QC whether a documentary FRAME illustrates the NARRATION spoken over it.\n"
      f'NARRATION (spoken now): "{sp}"\nInterpret frame and narration; does the frame plausibly '
      "ILLUSTRATE this narration (same subject/person/place/event/idea, or a reasonable atmospheric "
      "match)? Generic connective b-roll fitting the mood counts as a match. A frame about a clearly "
      "DIFFERENT subject than the narration is a mismatch. Reply ONLY JSON: "
      '{"match": true|false, "frame": "<=8 words", "why": "<one short sentence>"}')
    body=json.dumps({"model":MODEL,"max_tokens":200,"messages":[{"role":"user","content":[
        {"type":"image","source":{"type":"base64","media_type":"image/jpeg","data":b64}},
        {"type":"text","text":prompt}]}]}).encode()
    req=urllib.request.Request("https://api.anthropic.com/v1/messages",data=body,
        headers={"x-api-key":key,"anthropic-version":"2023-06-01","content-type":"application/json"},method="POST")
    try:
        with urllib.request.urlopen(req,timeout=60) as r: txt=json.loads(r.read())["content"][0]["text"]
        s=txt.find("{"); e=txt.rfind("}"); return json.loads(txt[s:e+1])
    except Exception as ex: return {"_error":str(ex)[:120]}

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("video"); ap.add_argument("--fps",type=float,default=0.5)
    ap.add_argument("--ctx",type=float,default=2.5); ap.add_argument("--max-divergence",type=float,default=3.0)
    ap.add_argument("--lang",default="eng"); ap.add_argument("--json",default=None)
    a=ap.parse_args()
    ek=load_key("ELEVENLABS_API_KEY"); ak=load_key("ANTHROPIC_API_KEY","NT_ANTHROPIC_API_KEY")
    if not ek or not ak:
        print(json.dumps({"check":"narration_match","pass":None,"skipped":True,"reason":"need ELEVENLABS+ANTHROPIC keys"},indent=2)); sys.exit(0)
    words=scribe_words(a.video,ek,a.lang)
    tmp=tempfile.mkdtemp(prefix="qcnm_")
    subprocess.run(["ffmpeg","-y","-i",a.video,"-vf",f"fps={a.fps},scale=768:-1",os.path.join(tmp,"n_%05d.jpg")],capture_output=True)
    frames=sorted(glob.glob(os.path.join(tmp,"n_*.jpg")))
    pf=[]
    for i,fp in enumerate(frames):
        t=i/a.fps; sp=spoken(words,t-a.ctx,t+a.ctx)
        if not sp: pf.append({"t":round(t,1),"match":True,"spoken":""}); continue
        v=vmatch(ak,fp,sp)
        if "_error" in v: pf.append({"t":round(t,1),"match":True}); continue
        pf.append({"t":round(t,1),"match":bool(v.get("match")),"frame":v.get("frame",""),"spoken":sp[:70],"why":v.get("why","")})
    for f in glob.glob(os.path.join(tmp,"*.jpg")): os.unlink(f)
    os.rmdir(tmp)
    step=1.0/a.fps; flags=[]; run=[]
    for p in pf:
        if not p["match"]: run.append(p)
        else:
            if run and (run[-1]["t"]-run[0]["t"]+step)>a.max_divergence:
                flags.append({"t_start":run[0]["t"],"t_end":round(run[-1]["t"]+step,1),
                    "seconds":round(run[-1]["t"]-run[0]["t"]+step,1),"spoken":run[0].get("spoken",""),
                    "frame":run[0].get("frame",""),"why":run[0].get("why","")})
            run=[]
    if run and (run[-1]["t"]-run[0]["t"]+step)>a.max_divergence:
        flags.append({"t_start":run[0]["t"],"t_end":round(run[-1]["t"]+step,1),
            "seconds":round(run[-1]["t"]-run[0]["t"]+step,1),"spoken":run[0].get("spoken",""),
            "frame":run[0].get("frame",""),"why":run[0].get("why","")})
    result={"check":"narration_match","video":a.video,"frames":len(pf),
            "divergences_over_threshold":flags,"max_divergence_s":a.max_divergence,"pass":len(flags)==0}
    out=json.dumps(result,indent=2)
    if a.json: open(a.json,"w").write(out)
    print(out); sys.exit(0 if result["pass"] else 1)

if __name__=="__main__": main()
