#!/usr/bin/env python3
"""
GEMINI WATCH — internal video+audio oracle for deterministic capture-rate backtests.
Uploads media through Gemini Files API, then asks Gemini to inspect the actual video/audio plus an
optional transcript sidecar. This is not customer included-minute QC; it is the expert comparison layer.
Usage: gemini_watch.py VIDEO [--transcript transcript.txt|words.json] [--model gemini-2.5-flash]
                       [--json out.json] [--keep-file]
"""
import argparse, base64, json, mimetypes, os, re, sys, time, urllib.request

API_ROOT="https://generativelanguage.googleapis.com"
DEFAULT_MODEL=os.environ.get("UPLOADCHECK_GEMINI_ORACLE_MODEL","gemini-2.5-flash")

PROMPT=(
  "You are the internal expert video QC oracle for UploadCheck capture-rate backtests. "
  "Inspect the actual video and audio together, using the supplied transcript only as grounding. "
  "Return only clear defects a professional creator would want caught before publishing. "
  "Flag these types when supported by evidence: FREEZE_LOOP, REPEAT_FATIGUE, TWINS, "
  "NARRATION_MISMATCH, CHEAP_BROLL, GARBLE, LIPSYNC_AV, TEXT_READABILITY, TEXT_SAFE_AREA, "
  "DEAD_AIR, CANVAS_FILL, HALLUCINATED_TEXT, SOURCE_SCRUB. "
  "Be conservative: do not invent narration, do not penalize intentional title/source cards, "
  "and do not use vague taste comments. Reply ONLY JSON with this schema: "
  "{\"flags\":[{\"type\":\"...\",\"severity\":\"block|minor\",\"t_start\":0,"
  "\"t_end\":0,\"detail\":\"specific evidence\",\"deterministic_candidate\":\"suggested gate\"}],"
  "\"ok\":true|false}"
)

def load_key():
    for name in ("GEMINI_API_KEY","GOOGLE_API_KEY"):
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
        for name in ("GEMINI_API_KEY","GOOGLE_API_KEY"):
            m=re.search(rf"^{name}=(.+)$",txt,re.M)
            if m and len(m.group(1).strip())>8: return m.group(1).strip().strip('"').strip("'")
    return None

def request_json(url, key, body=None, method="GET", headers=None, timeout=120):
    h={"x-goog-api-key":key}
    if headers: h.update(headers)
    data=None
    if body is not None:
        data=json.dumps(body).encode()
        h.setdefault("Content-Type","application/json")
    req=urllib.request.Request(url,data=data,headers=h,method=method)
    with urllib.request.urlopen(req,timeout=timeout) as r:
        return json.loads(r.read())

def start_resumable_upload(path, key, mime):
    meta={"file":{"display_name":os.path.basename(path)}}
    h={
        "x-goog-api-key":key,
        "X-Goog-Upload-Protocol":"resumable",
        "X-Goog-Upload-Command":"start",
        "X-Goog-Upload-Header-Content-Length":str(os.path.getsize(path)),
        "X-Goog-Upload-Header-Content-Type":mime,
        "Content-Type":"application/json",
    }
    req=urllib.request.Request(f"{API_ROOT}/upload/v1beta/files",data=json.dumps(meta).encode(),headers=h,method="POST")
    with urllib.request.urlopen(req,timeout=120) as r:
        upload_url=r.headers.get("x-goog-upload-url") or r.headers.get("X-Goog-Upload-URL")
    if not upload_url: raise RuntimeError("Gemini Files API did not return an upload URL")
    return upload_url

def upload_file(path, key):
    mime=mimetypes.guess_type(path)[0] or "video/mp4"
    upload_url=start_resumable_upload(path,key,mime)
    data=open(path,"rb").read()
    h={
        "Content-Length":str(len(data)),
        "X-Goog-Upload-Offset":"0",
        "X-Goog-Upload-Command":"upload, finalize",
    }
    req=urllib.request.Request(upload_url,data=data,headers=h,method="POST")
    with urllib.request.urlopen(req,timeout=600) as r:
        info=json.loads(r.read())
    file_info=info.get("file") or info
    file_info.setdefault("mimeType",mime)
    return file_info

def wait_active(file_info, key, timeout_s=300):
    name=file_info.get("name")
    if not name: return file_info
    deadline=time.time()+timeout_s
    current=file_info
    while time.time()<deadline:
        state=(current.get("state") or "").upper()
        if state in ("ACTIVE",""): return current
        if state=="FAILED": raise RuntimeError(f"Gemini file processing failed for {name}")
        time.sleep(3)
        current=request_json(f"{API_ROOT}/v1beta/{name}",key)
    raise TimeoutError(f"Gemini file did not become ACTIVE within {timeout_s}s")

def delete_file(file_info, key):
    name=file_info.get("name")
    if not name: return
    req=urllib.request.Request(f"{API_ROOT}/v1beta/{name}",headers={"x-goog-api-key":key},method="DELETE")
    try:
        with urllib.request.urlopen(req,timeout=60): pass
    except Exception:
        pass

def transcript_text(path, max_chars=18000):
    if not path or not os.path.exists(path): return ""
    txt=open(path,errors="ignore").read()
    if path.endswith(".json"):
        try:
            data=json.loads(txt)
            words=data.get("words",data) if isinstance(data,dict) else data
            if isinstance(words,list):
                txt=" ".join(str(w.get("text","")) for w in words if isinstance(w,dict))
        except Exception:
            pass
    txt=re.sub(r"<[^>]+>"," ",txt)
    txt=re.sub(r"\d\d:\d\d:\d\d[.,]\d+\s+-->\s+\d\d:\d\d:\d\d[.,]\d+.*"," ",txt)
    txt=re.sub(r"\s+"," ",txt).strip()
    return txt[:max_chars]

def extract_json_object(txt):
    s=txt.find("{"); e=txt.rfind("}")
    if s<0 or e<s: raise ValueError("Gemini response did not contain JSON")
    parsed=json.loads(txt[s:e+1])
    if not isinstance(parsed,dict): raise ValueError("Gemini JSON was not an object")
    flags=parsed.get("flags")
    if flags is None: parsed["flags"]=[]
    elif not isinstance(flags,list): raise ValueError("Gemini JSON flags field was not a list")
    return parsed

def generate(model, key, file_info, transcript):
    file_uri=file_info.get("uri")
    mime=file_info.get("mimeType") or file_info.get("mime_type") or "video/mp4"
    if not file_uri: raise RuntimeError("Gemini file upload response did not include file.uri")
    text=PROMPT
    if transcript:
        text += "\n\nTranscript sidecar for grounding:\n" + transcript
    body={
        "contents":[{
            "parts":[
                {"file_data":{"mime_type":mime,"file_uri":file_uri}},
                {"text":text},
            ]
        }],
        "generationConfig":{
            "temperature":0,
            "response_mime_type":"application/json",
        },
    }
    data=request_json(f"{API_ROOT}/v1beta/models/{model}:generateContent",key,body=body,method="POST",timeout=600)
    chunks=[]
    for cand in data.get("candidates") or []:
        for part in ((cand.get("content") or {}).get("parts") or []):
            if "text" in part: chunks.append(part["text"])
    parsed=extract_json_object("".join(chunks))
    parsed["_provider_usage"]={"provider":"google","model":model,"operation":"gemini_video_audio_oracle",**(data.get("usageMetadata") or {})}
    return parsed

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("video")
    ap.add_argument("--transcript",default=None)
    ap.add_argument("--model",default=DEFAULT_MODEL)
    ap.add_argument("--json",default=None)
    ap.add_argument("--keep-file",action="store_true")
    args=ap.parse_args()
    key=load_key()
    if not key:
        print(json.dumps({"check":"gemini_watch","pass":None,"skipped":True,"reason":"GEMINI_API_KEY missing"},indent=2))
        sys.exit(0)
    file_info=None
    try:
        file_info=wait_active(upload_file(args.video,key),key)
        result=generate(args.model,key,file_info,transcript_text(args.transcript))
        usage=result.pop("_provider_usage",{})
        flags=result.get("flags") or []
        blocks=[f for f in flags if f.get("severity")=="block"]
        out={"check":"gemini_watch","provider":"google","model":args.model,"video":args.video,
             "file":{"name":file_info.get("name"),"uri":file_info.get("uri"),"mimeType":file_info.get("mimeType"),"state":file_info.get("state")},
             "provider_usage":[usage] if usage else [],"flags":flags,"pass":len(blocks)==0}
    except Exception as ex:
        out={"check":"gemini_watch","provider":"google","model":args.model,"video":args.video,
             "pass":False,"errors":1,"flags":[{"type":"_ERROR","severity":"block","detail":str(ex)[:300]}]}
    finally:
        if file_info and not args.keep_file: delete_file(file_info,key)
    text=json.dumps(out,indent=2)
    if args.json: open(args.json,"w").write(text)
    print(text)
    sys.exit(0 if out.get("pass") is not False else 1)

if __name__=="__main__":
    main()
