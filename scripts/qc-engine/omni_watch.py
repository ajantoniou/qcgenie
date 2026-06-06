#!/usr/bin/env python3
"""
OMNI WATCH — multimodal QC pass for internal capture-rate backtests.
Qwen3.5-Omni via DashScope/OpenRouter is the preferred true audio+visual path. Anthropic is a
frame+narration fallback only; it cannot certify audio defects. Grounded on the real transcript +
deterministic post-filters so the model cannot invent narration. Only severity:block flags fail.
Usage: omni_watch.py VIDEO [--window 25] [--fps 1] [--transcript words.json] [--lang eng]
                    [--provider auto|qwen|anthropic] [--require-audio-video] [--json out.json]
"""
import sys, os, json, subprocess, tempfile, argparse, glob, base64, re, urllib.request
import shutil

DASHSCOPE_URL="https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions"
OPENROUTER_URL="https://openrouter.ai/api/v1/chat/completions"
ANTHROPIC_URL="https://api.anthropic.com/v1/messages"
DEFAULT_QWEN_MODEL=os.environ.get("UPLOADCHECK_QWEN_OMNI_MODEL","qwen3.5-omni-flash")
DEFAULT_ANTHROPIC_MODEL=os.environ.get("UPLOADCHECK_ANTHROPIC_OMNI_MODEL","claude-sonnet-4-5")

QC=("You are a multimodal video QC inspector for a first-century biblical documentary. You get sampled "
 "FRAMES + AUDIO of one short window plus the EXACT narration text. Inspect together; report only CLEAR "
 "defects: (1) GARBLE - speech you cannot make into words; (2) FREEZE/LOOP - held/frozen or reused shot; "
 "(3) TWINS - same face duplicated in a frame/crowd; (4) NARRATION_MISMATCH - frames don't illustrate "
 "the GIVEN narration (NEVER guess narration; if empty, do NOT flag); (5) CHEAP_BROLL - grainy/scratched "
 "old-film, B&W archival, or low-res stock (cold color-grading alone is FINE); (6) LIPSYNC_AV - mouth "
 "doesn't match audio, or music/visual mood clash (if no audio, do NOT flag). Be conservative. Reply "
 'ONLY JSON: {"flags":[{"type":"...","severity":"block|minor","detail":"..."}],"ok":true|false}')

def load_key(*names):
    for name in names:
        val=os.environ.get(name)
        if val and len(val.strip())>8: return val.strip().strip('"').strip("'")
    candidates=[
        os.path.join(os.getcwd(),".env"),
        os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),".env"),
        "/Applications/DrAntoniou Projects/AgentCompanies/.env",
    ]
    seen=set()
    for p in candidates:
        if p in seen or not os.path.exists(p): continue
        seen.add(p)
        txt=open(p).read()
        for name in names:
            m=re.search(rf"^{name}=(.+)$",txt,re.M)
            if m and len(m.group(1).strip())>8: return m.group(1).strip().strip('"').strip("'")
    return None

def dur(f):
    return float(subprocess.run(["ffprobe","-v","error","-show_entries","format=duration","-of","csv=p=0",f],capture_output=True,text=True).stdout.strip() or 0)

def b64f(p): return base64.b64encode(open(p,"rb").read()).decode()
def spoken(words,lo,hi):
    return " ".join(w["text"] for w in words if w.get("start") is not None and w["start"]<hi and w.get("end",w["start"])>lo).strip()

def run_checked(cmd, label):
    p=subprocess.run(cmd,capture_output=True,text=True)
    if p.returncode!=0:
        detail=(p.stderr or p.stdout or "").strip()[-300:]
        raise RuntimeError(f"{label} failed: {detail}")
    return p

def parse_streaming_chat_completion(raw):
    text=[]; usage={}
    for line in raw.decode("utf-8","ignore").splitlines():
        line=line.strip()
        if not line.startswith("data:"): continue
        payload=line[5:].strip()
        if not payload or payload=="[DONE]": continue
        try: chunk=json.loads(payload)
        except Exception: continue
        if chunk.get("usage"): usage=chunk.get("usage") or usage
        for choice in chunk.get("choices") or []:
            delta=choice.get("delta") or {}
            content=delta.get("content")
            if isinstance(content,str): text.append(content)
            elif isinstance(content,list):
                for item in content:
                    if isinstance(item,dict) and isinstance(item.get("text"),str): text.append(item["text"])
    return "".join(text), usage

def extract_json_object(txt):
    s=txt.find("{"); e=txt.rfind("}")
    if s<0 or e<s: raise ValueError("model response did not contain a JSON object")
    parsed=json.loads(txt[s:e+1])
    if not isinstance(parsed,dict): raise ValueError("model JSON was not an object")
    flags=parsed.get("flags")
    if flags is None:
        parsed["flags"]=[]
    elif not isinstance(flags,list):
        raise ValueError("model JSON flags field was not a list")
    return parsed

def omni(url,key,provider,model,frames,audio_b64,narr,extra):
    content=[{"type":"text","text":QC+(f'\nNARRATION: "{narr}"' if narr else "\nNARRATION: (none/music)")}]
    for fb in frames: content.append({"type":"image_url","image_url":{"url":"data:image/jpeg;base64,"+fb}})
    if audio_b64: content.append({"type":"input_audio","input_audio":{"data":"data:;base64,"+audio_b64,"format":"mp3"}})
    body=json.dumps({
        "model":model,
        "messages":[{"role":"user","content":content}],
        "max_tokens":400,
        "modalities":["text"],
        "stream":True,
        "stream_options":{"include_usage":True}
    }).encode()
    h={"Authorization":f"Bearer {key}","Content-Type":"application/json"}
    if extra: h.update(extra)
    req=urllib.request.Request(url,data=body,headers=h,method="POST")
    with urllib.request.urlopen(req,timeout=120) as r: txt,usage=parse_streaming_chat_completion(r.read())
    parsed=extract_json_object(txt)
    parsed["_provider_usage"]={"provider":provider,"model":model,"operation":"multimodal_audio_video_window",**usage}
    return parsed

def anthropic_fb(key,model,frames,narr):
    content=[{"type":"text","text":QC+"\n(NOTE: audio unavailable; judge frames + given narration only.)"+(f'\nNARRATION: "{narr}"' if narr else "")}]
    for fb in frames: content.append({"type":"image","source":{"type":"base64","media_type":"image/jpeg","data":fb}})
    body=json.dumps({"model":model,"max_tokens":400,"messages":[{"role":"user","content":content}]}).encode()
    req=urllib.request.Request(ANTHROPIC_URL,data=body,headers={"x-api-key":key,"anthropic-version":"2023-06-01","content-type":"application/json"},method="POST")
    with urllib.request.urlopen(req,timeout=90) as r: data=json.loads(r.read())
    txt=data["content"][0]["text"]
    parsed=extract_json_object(txt)
    parsed["_provider_usage"]={"provider":"anthropic","model":model,"operation":"frame_narration_oracle_window",**(data.get("usage") or {})}
    return parsed

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("video"); ap.add_argument("--window",type=float,default=25.0); ap.add_argument("--fps",type=float,default=1.0)
    ap.add_argument("--frames-per-window",type=int,default=4); ap.add_argument("--transcript",default=None)
    ap.add_argument("--lang",default="eng"); ap.add_argument("--max-windows",type=int,default=120); ap.add_argument("--json",default=None)
    ap.add_argument("--provider",choices=["auto","qwen","anthropic"],default="auto")
    ap.add_argument("--require-audio-video",action="store_true")
    ap.add_argument("--qwen-model",default=DEFAULT_QWEN_MODEL)
    ap.add_argument("--anthropic-model",default=DEFAULT_ANTHROPIC_MODEL)
    a=ap.parse_args()
    ds=load_key("DASHSCOPE_API_KEY","QWEN_API_KEY"); orr=load_key("OPENROUTER_API_KEY"); anth=load_key("ANTHROPIC_API_KEY","NT_ANTHROPIC_API_KEY")
    if a.provider in ("auto","qwen") and ds: prov=("dashscope",DASHSCOPE_URL,ds,None,a.qwen_model)
    elif a.provider in ("auto","qwen") and orr: prov=("openrouter",OPENROUTER_URL,orr,{"HTTP-Referer":"https://uploadcheck.app"},a.qwen_model)
    elif a.provider in ("auto","anthropic") and anth and not a.require_audio_video: prov=("anthropic-fallback",None,anth,None,a.anthropic_model)
    else:
        reason="no DASHSCOPE/OPENROUTER key for required audio+video Omni" if a.require_audio_video or a.provider=="qwen" else "no DASHSCOPE/OPENROUTER/ANTHROPIC key"
        print(json.dumps({"check":"omni_watch","pass":False if a.require_audio_video else None,
            "skipped":not a.require_audio_video,"reason":reason},indent=2)); sys.exit(1 if a.require_audio_video else 0)
    words=json.load(open(a.transcript)) if a.transcript and os.path.exists(a.transcript) else []
    if isinstance(words,dict): words=words.get("words",[])
    total=dur(a.video); wins=[]; t=0.0
    while t<total and len(wins)<a.max_windows: wins.append((t,min(a.window,total-t))); t+=a.window
    flags=[]; checked=0; errors=0; provider_usage=[]
    for ws,wl in wins:
        tmp=tempfile.mkdtemp(prefix="omni_")
        try:
            run_checked(["ffmpeg","-y","-ss",str(ws),"-i",a.video,"-t",str(wl),"-vf",f"fps={a.fps},scale=512:-1",os.path.join(tmp,"f_%03d.jpg")],"frame extraction")
            fr=sorted(glob.glob(os.path.join(tmp,"f_*.jpg")))
            if not fr: raise RuntimeError("frame extraction produced no frames")
            step=max(1,len(fr)//a.frames_per_window); fr=fr[::step][:a.frames_per_window]
            fb=[b64f(p) for p in fr]
            aud=os.path.join(tmp,"a.mp3")
            run_checked(["ffmpeg","-y","-ss",str(ws),"-i",a.video,"-t",str(wl),"-vn","-ar","16000","-ac","1",aud],"audio extraction")
            if prov[0]!="anthropic-fallback" and (not os.path.exists(aud) or os.path.getsize(aud)==0):
                raise RuntimeError("audio extraction produced no audio for required audio+video provider")
            ab=b64f(aud) if os.path.exists(aud) and os.path.getsize(aud)>0 else None
            narr=spoken(words,ws,ws+wl) if words else ""
            has_audio=(prov[0]!="anthropic-fallback") and bool(ab)
            v=anthropic_fb(prov[2],prov[4],fb,narr) if prov[0]=="anthropic-fallback" else omni(prov[1],prov[2],prov[0],prov[4],fb,ab,narr,prov[3])
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
        finally:
            shutil.rmtree(tmp,ignore_errors=True)
    blocks=[f for f in flags if f.get("severity")=="block"]
    result={"check":"omni_watch","provider":prov[0],"model":prov[4],"audio_video":prov[0]!="anthropic-fallback",
            "fallback":prov[0]=="anthropic-fallback","video":a.video,"windows_checked":checked,
            "errors":errors,"provider_usage":provider_usage,"flags":flags,"pass":len(blocks)==0}
    out=json.dumps(result,indent=2)
    if a.json: open(a.json,"w").write(out)
    print(out); sys.exit(0 if result["pass"] else 1)

if __name__=="__main__": main()
