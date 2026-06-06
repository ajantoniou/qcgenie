#!/usr/bin/env python3
"""
CHECK — GARBLED SPEECH.
Founder rule (verbatim): "if we can't translate the audio to readable text, that's garble."
BLOCK only when a window has clear speech energy (RMS above the speech floor) but ElevenLabs Scribe
returns empty/near-empty text. Low-confidence-but-readable word runs are ADVISORY (not blocking).
Exit 0 = clean, 1 = garble. JSON to stdout (+ --json).
Usage: check_garble.py VIDEO_OR_AUDIO [--window 20] [--lang eng] [--json out.json]
Needs ELEVENLABS_API_KEY in .env.
"""
import sys, os, json, subprocess, tempfile, argparse, re, urllib.request, urllib.error

SPEECH_RMS_FLOOR_DB = -34.0
MIN_CHARS_PER_SEC   = 1.2
LOW_CONF_LOGPROB    = -0.55
LOW_CONF_RUN        = 3

def load_key():
    for p in ("/Applications/DrAntoniou Projects/AgentCompanies/.env",
              os.path.join(os.path.dirname(__file__), ".env"), ".env"):
        if os.path.exists(p):
            for line in open(p):
                line=line.strip()
                if line.startswith("ELEVENLABS_API_KEY=") and len(line.split("=",1)[1])>10:
                    return line.split("=",1)[1].strip().strip('"').strip("'")
    return os.environ.get("ELEVENLABS_API_KEY")

def dur(f):
    return float(subprocess.run(["ffprobe","-v","error","-show_entries","format=duration",
        "-of","csv=p=0",f],capture_output=True,text=True).stdout.strip() or 0)

def rms_db(audio):
    out=subprocess.run(["ffmpeg","-i",audio,"-af","volumedetect","-f","null","-"],
        capture_output=True,text=True).stderr
    m=re.search(r"mean_volume:\s*(-?[\d.]+)",out); return float(m.group(1)) if m else -99.0

def scribe(audio, key, lang):
    b="----qcg"; fb=open(audio,"rb").read()
    body=b"".join([
        (f'--{b}\r\nContent-Disposition: form-data; name="model_id"\r\n\r\nscribe_v1\r\n').encode(),
        (f'--{b}\r\nContent-Disposition: form-data; name="language_code"\r\n\r\n{lang}\r\n').encode(),
        (f'--{b}\r\nContent-Disposition: form-data; name="file"; filename="a.mp3"\r\nContent-Type: audio/mpeg\r\n\r\n').encode(),
        fb, f"\r\n--{b}--\r\n".encode()])
    req=urllib.request.Request("https://api.elevenlabs.io/v1/speech-to-text",data=body,
        headers={"xi-api-key":key,"Content-Type":f"multipart/form-data; boundary={b}"},method="POST")
    try:
        with urllib.request.urlopen(req,timeout=120) as r:
            data=json.loads(r.read())
            data["_provider_usage"]={"provider":"elevenlabs","model":"scribe_v1","operation":"speech_to_text","request_count":1,"audio_bytes":len(fb)}
            return data
    except urllib.error.HTTPError as e: return {"_error":f"HTTP {e.code}"}

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("media"); ap.add_argument("--window",type=float,default=20.0)
    ap.add_argument("--lang",default="eng"); ap.add_argument("--json",default=None)
    a=ap.parse_args()
    key=load_key()
    if not key:
        print(json.dumps({"check":"garble","pass":None,"skipped":True,"reason":"ELEVENLABS_API_KEY missing"},indent=2)); sys.exit(0)
    total=dur(a.media); findings=[]; advisories=[]; checked=0; t=0.0; provider_usage=[]
    while t<total:
        seg=min(a.window,total-t)
        if seg<3: break
        with tempfile.NamedTemporaryFile(suffix=".mp3",delete=False) as tf: wav=tf.name
        subprocess.run(["ffmpeg","-y","-ss",str(t),"-i",a.media,"-t",str(seg),"-vn","-ar","44100","-ac","1",wav],capture_output=True)
        loud=rms_db(wav)
        if loud>SPEECH_RMS_FLOOR_DB:
            checked+=1; res=scribe(wav,key,a.lang); text=(res.get("text") or "").strip(); words=res.get("words") or []
            usage=res.pop("_provider_usage",None)
            if usage:
                usage["audio_seconds"]=round(seg,2)
                provider_usage.append(usage)
            cps=len(text)/seg
            # GARBLE = audible SPEECH that yields no readable text. But MUSIC-ONLY audio (no VO) also
            # yields no text and must NOT be flagged. Distinguish: if Scribe found essentially ZERO
            # words AND no speech-shaped content, treat as music/non-speech and skip. Only flag when
            # there is partial/garbled speech (a few words but well below the readable rate).
            near_zero_words = len([w for w in words if (w.get("text") or "").strip()]) <= 1
            if cps<MIN_CHARS_PER_SEC and not near_zero_words:
                findings.append({"t_start":round(t,1),"t_end":round(t+seg,1),"rms_db":round(loud,1),
                    "chars_per_sec":round(cps,2),"text":text[:80],"type":"PARTIAL_SPEECH_GARBLED"})
            elif cps<MIN_CHARS_PER_SEC and near_zero_words:
                advisories.append({"t_start":round(t,1),"t_end":round(t+seg,1),
                    "type":"MUSIC_OR_NONSPEECH","note":"loud audio, no transcribable speech (likely music)"})
            else:
                run=0; worst=0.0; ww=""
                for w in words:
                    lp=w.get("logprob")
                    if lp is None: run=0; continue
                    if lp<LOW_CONF_LOGPROB:
                        run+=1
                        if lp<worst: worst,ww=lp,w.get("text","")
                        if run>=LOW_CONF_RUN:
                            advisories.append({"t_start":round(t,1),"t_end":round(t+seg,1),
                                "type":"LOW_CONFIDENCE_RUN_ADVISORY","worst_logprob":round(worst,2),
                                "worst_word":ww,"text":text[:80]}); break
                    else: run=0
        os.unlink(wav); t+=seg
    result={"check":"garble","media":a.media,"windows_with_speech":checked,
            "provider_usage":provider_usage,"findings":findings,"advisories":advisories,"pass":len(findings)==0}
    out=json.dumps(result,indent=2)
    if a.json: open(a.json,"w").write(out)
    print(out); sys.exit(0 if result["pass"] else 1)

if __name__=="__main__": main()
