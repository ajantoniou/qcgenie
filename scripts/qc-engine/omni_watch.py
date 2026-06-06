#!/usr/bin/env python3
"""
OMNI WATCH — multimodal QC pass (sees + hears + reads at once).
Qwen3-Omni via DashScope (OpenAI-compatible) when DASHSCOPE_API_KEY is present; else falls back to an
Anthropic frame-only pass so the gate still runs. Grounded on the real transcript + deterministic
post-filters (never let the model invent the narration -> the "Salem Witch Trials" hallucination guard).
Only severity:block flags fail the gate.
Usage: omni_watch.py VIDEO [--window 25] [--fps 1] [--transcript words.json] [--lang eng] [--json out.json]
"""
import sys, os, json, subprocess, tempfile, argparse, glob, base64, re, urllib.request

DASHSCOPE_URL="https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions"
OPENROUTER_URL="https://openrouter.ai/api/v1/chat/completions"
ANTHROPIC_URL="https://api.anthropic.com/v1/messages"

QC=("You are a multimodal video QC inspector for a first-century biblical documentary. You get sampled "
 "FRAMES + AUDIO of one short window plus the EXACT narration text. Inspect together; report only CLEAR "
 "defects: (1) GARBLE - speech you cannot make into words; (2) FREEZE/LOOP - held/frozen or reused shot; "
 "(3) TWINS - same face duplicated in a frame/crowd; (4) NARRATION_MISMATCH - frames don't illustrate "
 "the GIVEN narration (NEVER guess narration; if empty, do NOT flag); (5) CHEAP_BROLL - grainy/scratched "
 "old-film, B&W archival, or low-res stock (cold color-grading alone is FINE); (6) LIPSYNC_AV - mouth "
 "doesn't match audio, or music/visual mood clash (if no audio, do NOT flag). Be conservative. Reply "
 'ONLY JSON: {"flags":[{"type":"...","severity":"block|minor","detail":"..."}],"ok":true|false}')

def load_key(*n):
    p="/Applications/DrAntoniou Projects/AgentCompanies/.env"; t=open(p).read() if os.path.exists(p) else ""
    for x in n:
        m=re.search(rf"^{x}=(.+)$",t,re.M)
        if m and len(m.group(1).strip())>8: return m.group(1).strip().strip('"').strip("'")
    return None

def dur(f):
    return float(subprocess.run(["ffprobe","-v","error","-show_entries","format=duration","-of","csv=p=0",f],capture_output=True,text=True).stdout.strip() or 0)

def b64f(p): return base64.b64encode(open(p,"rb").read()).decode()
def spoken(words,lo,hi):
    return " ".join(w["text"] for w in words if w.get("start") is not None and w["start"]<hi and w.get("end",w["start"])>lo).strip()

def omni(url,key,provider,frames,audio_b64,narr,extra):
    content=[{"type":"text","text":QC+(f'\nNARRATION: "{narr}"' if narr else "\nNARRATION: (none/music)")}]
    for fb in frames: content.append({"type":"image_url","image_url":{"url":"data:image/jpeg;base64,"+fb}})
    if audio_b64: content.append({"type":"input_audio","input_audio":{"data":audio_b64,"format":"mp3"}})
    body=json.dumps({"model":"qwen3.5-omni-flash","messages":[{"role":"user","content":content}],"max_tokens":400}).encode()
    h={"Authorization":f"Bearer {key}","Content-Type":"application/json"}
    if extra: h.update(extra)
    req=urllib.request.Request(url,data=body,headers=h,method="POST")
    with urllib.request.urlopen(req,timeout=120) as r: data=json.loads(r.read())
    txt=data["choices"][0]["message"]["content"]
    s=txt.find("{"); e=txt.rfind("}")
    parsed=json.loads(txt[s:e+1])
    parsed["_provider_usage"]={"provider":provider,"model":"qwen3.5-omni-flash","operation":"multimodal_window",**(data.get("usage") or {})}
    return parsed

def anthropic_fb(key,frames,narr):
    content=[{"type":"text","text":QC+"\n(NOTE: audio unavailable; judge frames + given narration only.)"+(f'\nNARRATION: "{narr}"' if narr else "")}]
    for fb in frames: content.append({"type":"image","source":{"type":"base64","media_type":"image/jpeg","data":fb}})
    body=json.dumps({"model":"claude-sonnet-4-5","max_tokens":400,"messages":[{"role":"user","content":content}]}).encode()
    req=urllib.request.Request(ANTHROPIC_URL,data=body,headers={"x-api-key":key,"anthropic-version":"2023-06-01","content-type":"application/json"},method="POST")
    with urllib.request.urlopen(req,timeout=90) as r: data=json.loads(r.read())
    txt=data["content"][0]["text"]
    s=txt.find("{"); e=txt.rfind("}")
    parsed=json.loads(txt[s:e+1])
    parsed["_provider_usage"]={"provider":"anthropic","model":"claude-sonnet-4-5","operation":"omni_fallback_frame_window",**(data.get("usage") or {})}
    return parsed

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("video"); ap.add_argument("--window",type=float,default=25.0); ap.add_argument("--fps",type=float,default=1.0)
    ap.add_argument("--frames-per-window",type=int,default=4); ap.add_argument("--transcript",default=None)
    ap.add_argument("--lang",default="eng"); ap.add_argument("--max-windows",type=int,default=120); ap.add_argument("--json",default=None)
    a=ap.parse_args()
    ds=load_key("DASHSCOPE_API_KEY","QWEN_API_KEY"); orr=load_key("OPENROUTER_API_KEY"); anth=load_key("ANTHROPIC_API_KEY","NT_ANTHROPIC_API_KEY")
    if ds: prov=("dashscope",DASHSCOPE_URL,ds,None)
    elif orr: prov=("openrouter",OPENROUTER_URL,orr,{"HTTP-Referer":"https://uploadcheck.app"})
    elif anth: prov=("anthropic-fallback",None,anth,None)
    else:
        print(json.dumps({"check":"omni_watch","pass":None,"skipped":True,"reason":"no DASHSCOPE/OPENROUTER/ANTHROPIC key"},indent=2)); sys.exit(0)
    words=json.load(open(a.transcript)) if a.transcript and os.path.exists(a.transcript) else []
    if isinstance(words,dict): words=words.get("words",[])
    total=dur(a.video); wins=[]; t=0.0
    while t<total and len(wins)<a.max_windows: wins.append((t,min(a.window,total-t))); t+=a.window
    flags=[]; checked=0; errors=0; provider_usage=[]
    for ws,wl in wins:
        tmp=tempfile.mkdtemp(prefix="omni_")
        subprocess.run(["ffmpeg","-y","-ss",str(ws),"-i",a.video,"-t",str(wl),"-vf",f"fps={a.fps},scale=512:-1",os.path.join(tmp,"f_%03d.jpg")],capture_output=True)
        fr=sorted(glob.glob(os.path.join(tmp,"f_*.jpg"))); step=max(1,len(fr)//a.frames_per_window); fr=fr[::step][:a.frames_per_window]
        fb=[b64f(p) for p in fr]
        aud=os.path.join(tmp,"a.mp3"); subprocess.run(["ffmpeg","-y","-ss",str(ws),"-i",a.video,"-t",str(wl),"-vn","-ar","16000","-ac","1",aud],capture_output=True)
        ab=b64f(aud) if os.path.exists(aud) else None
        narr=spoken(words,ws,ws+wl) if words else ""
        has_audio=(prov[0]!="anthropic-fallback") and bool(ab)
        try:
            v=anthropic_fb(prov[2],fb,narr) if prov[0]=="anthropic-fallback" else omni(prov[1],prov[2],prov[0],fb,ab,narr,prov[3])
            usage=v.pop("_provider_usage",None)
            if usage:
                usage["window_seconds"]=round(wl,2)
                usage["frame_count"]=len(fb)
                usage["audio_included"]=bool(has_audio)
                provider_usage.append(usage)
            checked+=1
            for fl in v.get("flags",[]):
                ty=fl.get("type","")
                if ty=="NARRATION_MISMATCH" and not narr: continue
                if ty in ("GARBLE","LIPSYNC_AV") and not has_audio: continue
                fl["t_start"]=round(ws,1); fl["t_end"]=round(ws+wl,1); flags.append(fl)
        except Exception as ex:
            errors+=1; flags.append({"t_start":round(ws,1),"type":"_ERROR","detail":str(ex)[:120]})
        for f in glob.glob(os.path.join(tmp,"*")): os.unlink(f)
        os.rmdir(tmp)
    blocks=[f for f in flags if f.get("severity")=="block"]
    result={"check":"omni_watch","provider":prov[0],"video":a.video,"windows_checked":checked,
            "errors":errors,"provider_usage":provider_usage,"flags":flags,"pass":len(blocks)==0}
    out=json.dumps(result,indent=2)
    if a.json: open(a.json,"w").write(out)
    print(out); sys.exit(0 if result["pass"] else 1)

if __name__=="__main__": main()
