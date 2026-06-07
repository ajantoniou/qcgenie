#!/usr/bin/env python3
"""
CHECK — TWINS / CLONES.
Flag frames where the SAME person's face appears 2+ times (AI clone), a face is duplicated across a
crowd, or a lead is rendered as twins/triplets. Harness deterministic; per-frame judgment is a strict
schema-locked vision call (Anthropic API), not a freeform persona read.
Exit 0 = clean, 1 = twins. JSON to stdout (+ --json).
Usage: check_twins.py VIDEO_OR_IMAGE [--fps 0.25] [--max-frames 200] [--manifest storybook.json] [--json out.json]
Uses a manifest precheck and cheap local appearance-cluster pass first, then ANTHROPIC_API_KEY for ambiguous frames.
"""
import sys, os, json, subprocess, tempfile, argparse, glob, base64, re, urllib.request
try:
    from PIL import Image, ImageStat
except Exception:
    Image = None
    ImageStat = None

MODEL="claude-sonnet-4-5"
PROMPT=(
 "You are a strict image QC gate for an AI-generated historical documentary. Your job is to BLOCK "
 "clone-crowd failures, not to explain them away. Look ONLY for UNINTENDED DUPLICATE PEOPLE: the SAME "
 "person's face appearing two or more times in this single frame, one face copy-pasted across a crowd, "
 "or many extras sharing the same generated archetype. In large crowds, flag repeated long dark hair + "
 "same beard + same age + same robe silhouette + same facial structure, especially multiple Jesus-like "
 "duplicates around the lead. Do NOT rationalize repetition as ethnicity, era, wardrobe, disciples, "
 "background distance, or downscaling. If the crowd would make a viewer say 'these are the same AI man "
 "again and again' or 'this scene needs more characters,' BLOCK it. If needs_more_character_variation "
 "is true, has_twins MUST also be true. Distinct different extras are fine; generic robes alone are not "
 "a failure. Reply ONLY JSON: {\"has_twins\": true|false, "
 "\"needs_more_character_variation\": true|false, \"duplicate_count\": <int>, "
 "\"reason\": \"<one short sentence>\", \"action\": \"<one short editor instruction>\"}"
)
IMAGE_EXTS={".jpg",".jpeg",".png",".webp",".bmp",".tif",".tiff"}
MANIFEST_DUPLICATE_KEYS=(
    "duplicate_characters",
    "duplicate_people",
    "duplicate_faces",
    "same_face_characters",
    "same_face_people",
    "twin_characters",
    "twins",
    "clone_characters",
    "clone_people",
    "clone_crowd",
    "near_duplicate_characters",
    "near_duplicate_people",
    "similar_characters",
    "similar_people",
    "lookalike_characters",
    "almost_identical_characters",
)
MANIFEST_VARIATION_KEYS=(
    "needs_more_character_variation",
    "needs_distinct_characters",
    "under_varied_crowd",
    "character_variation_failure",
    "characters_too_similar",
    "crowd_too_similar",
)
MANIFEST_COUNT_KEYS=(
    "duplicate_count",
    "similar_character_count",
    "near_duplicate_count",
    "clone_count",
    "same_face_count",
)
MANIFEST_REASON_KEYS=("reason","qc_note","note","description","visual_description","issue","detail")
MANIFEST_ACTION_KEYS=("action","repair_action","fix","editor_action")
MANIFEST_START_KEYS=("t_start","start","start_s","time")
MANIFEST_END_KEYS=("t_end","end","end_s")

def load_key():
    if os.environ.get("UPLOADCHECK_TEST_NO_ANTHROPIC_KEY"):
        return None
    for v in ("ANTHROPIC_API_KEY","NT_ANTHROPIC_API_KEY","CLAUDE_API_KEY"):
        key=os.environ.get(v)
        if key and len(key.strip())>10:
            return key.strip()
    here=os.path.dirname(os.path.abspath(__file__))
    candidates=[
        os.path.join(os.getcwd(),".env"),
        os.path.abspath(os.path.join(here,"..","..",".env")),
        "/Applications/DrAntoniou Projects/AgentCompanies/.env"
    ]
    seen=set()
    for p in candidates:
        if p in seen or not os.path.exists(p):
            continue
        seen.add(p)
        t=open(p).read()
        for v in ("ANTHROPIC_API_KEY","NT_ANTHROPIC_API_KEY","CLAUDE_API_KEY"):
            m=re.search(rf"^{v}=(.+)$",t,re.M)
            if m and len(m.group(1).strip())>10: return m.group(1).strip().strip('"').strip("'")
    return None

def truthy(value):
    if isinstance(value, bool):
        return value
    if value is None:
        return False
    if isinstance(value, (int, float)):
        return value > 0
    return str(value).strip().lower() in {"1","true","yes","y","fail","failed","block","blocked","present","duplicate","similar","too_similar","needs_more_variation"}

def scalar_items(value):
    if value in (None, ""):
        return []
    if isinstance(value, list):
        out=[]
        for item in value:
            out.extend(scalar_items(item))
        return out
    if isinstance(value, dict):
        for key in ("name","text","character","person","label","value","reason"):
            if value.get(key):
                return [str(value.get(key))]
        return [json.dumps(value, sort_keys=True)]
    text=str(value).strip()
    if not text:
        return []
    return [part.strip() for part in re.split(r"[,;|]+", text) if part.strip()]

def first_value(item, keys):
    for key in keys:
        value=item.get(key)
        if value not in (None, ""):
            return value
    return None

def parse_float(value):
    try:
        return float(value)
    except Exception:
        return None

def flatten_json(value, path="root"):
    if isinstance(value, dict):
        yield path, value
        for key, child in value.items():
            yield from flatten_json(child, f"{path}.{key}")
    elif isinstance(value, list):
        for idx, child in enumerate(value):
            yield from flatten_json(child, f"{path}[{idx}]")

def manifest_has_duplicate_signal(item):
    for key in MANIFEST_DUPLICATE_KEYS + MANIFEST_VARIATION_KEYS:
        if key in item and truthy(item.get(key)):
            return True
    return False

def manifest_duplicate_count(item):
    for key in MANIFEST_COUNT_KEYS:
        value=item.get(key)
        if value in (None, ""):
            continue
        try:
            return int(float(value))
        except Exception:
            count=len(scalar_items(value))
            if count:
                return count
    for key in MANIFEST_DUPLICATE_KEYS:
        count=len(scalar_items(item.get(key)))
        if count:
            return count
    return None

def manifest_twins_findings(path):
    if not path:
        return []
    data=json.load(open(path, "r", encoding="utf8"))
    findings=[]
    for row_path,item in flatten_json(data):
        if not manifest_has_duplicate_signal(item):
            continue
        count=manifest_duplicate_count(item)
        reason=first_value(item, MANIFEST_REASON_KEYS)
        action=first_value(item, MANIFEST_ACTION_KEYS)
        finding={
            "needs_more_character_variation": True,
            "reason": str(reason or "Manifest marks duplicate, near-duplicate, or too-similar characters in this scene."),
            "action": str(action or "Regenerate or edit the scene with more distinct characters."),
            "method": "manifest_character_similarity",
            "manifest_path": row_path
        }
        if count is not None:
            finding["duplicate_count"]=count
        start=parse_float(first_value(item, MANIFEST_START_KEYS))
        end=parse_float(first_value(item, MANIFEST_END_KEYS))
        if start is not None:
            finding["t"]=round(start,2)
            finding["t_start"]=round(start,2)
        if end is not None:
            finding["t_end"]=round(end,2)
        findings.append(finding)
    return findings[:30]

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

def frame_variants(media,tmp,prefix,w,h,t):
    frames=[]
    full=os.path.join(tmp,f"{prefix}_full.jpg")
    if write_image_frame(media,full,"scale='min(1536,iw)':-1"):
        frames.append((full,t))
    # Wide AI crowds fail when all extras are compressed into one small frame.
    # Add overlapping crops and half-frame tiles so repeated faces stay inspectable.
    if w >= 900 and h >= 450:
        crop_w=max(1, min(w, int(w*0.55)))
        starts=[0, max(0, int((w-crop_w)/2)), max(0, w-crop_w)]
        seen=set()
        for n,x in enumerate(starts, start=1):
            if x in seen: continue
            seen.add(x)
            out=os.path.join(tmp,f"{prefix}_crop_{n}.jpg")
            vf=f"crop={crop_w}:{h}:{x}:0,scale='min(1400,iw)':-1"
            if write_image_frame(media,out,vf):
                frames.append((out,t))
        tile_w=max(1, int(w*0.5))
        tile_h=max(1, int(h*0.58))
        tiles=[(0,0),(max(0,w-tile_w),0),(0,max(0,h-tile_h)),(max(0,w-tile_w),max(0,h-tile_h))]
        for n,(x,y) in enumerate(tiles, start=1):
            out=os.path.join(tmp,f"{prefix}_tile_{n}.jpg")
            vf=f"crop={tile_w}:{tile_h}:{x}:{y},scale='min(1400,iw)':-1"
            if write_image_frame(media,out,vf):
                frames.append((out,t))
    return frames

def extract_frames(media,tmp,fps):
    if is_image(media):
        w,h=dims(media)
        return frame_variants(media,tmp,"t_00001",w,h,0)
    base=os.path.join(tmp,"base_%05d.jpg")
    subprocess.run(["ffmpeg","-y","-i",media,"-vf",f"fps={fps},scale='min(1536,iw)':-1",base],capture_output=True)
    frames=[]
    for idx,fp in enumerate(sorted(glob.glob(os.path.join(tmp,"base_*.jpg"))), start=1):
        w,h=dims(fp)
        frames.extend(frame_variants(fp,tmp,f"t_{idx:05d}",w,h,round((idx-1)/fps,1)))
    return frames

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

def luminance(rgb):
    r,g,b=rgb[:3]
    return 0.2126*r + 0.7152*g + 0.0722*b

def saturation(rgb):
    r,g,b=[x/255 for x in rgb[:3]]
    mx=max(r,g,b); mn=min(r,g,b)
    return 0 if mx == 0 else (mx-mn)/mx

def dhash(crop):
    small=crop.convert("L").resize((9,8))
    data = small.get_flattened_data() if hasattr(small, "get_flattened_data") else small.getdata()
    px=list(data)
    bits=0
    for y in range(8):
        for x in range(8):
            bits=(bits << 1) | (1 if px[y*9+x] > px[y*9+x+1] else 0)
    return bits

def hamming(a,b):
    return (a^b).bit_count()

def avg_rgb(crop):
    stat=ImageStat.Stat(crop.convert("RGB"))
    return tuple(stat.mean[:3])

def rgb_distance(a,b):
    return sum((a[i]-b[i])**2 for i in range(3))**0.5

def dark_components(image):
    w,h=image.size
    pix=image.convert("RGB").load()
    mask=set()
    for y in range(0, int(h*0.88)):
        for x in range(w):
            rgb=pix[x,y]
            lum=luminance(rgb)
            # Hair/beard-like components in the NTO failure class are dark, saturated enough to avoid
            # flat robe/background shadows, and small enough to become head chips after expansion.
            if lum < 78 and saturation(rgb) > 0.18:
                mask.add((x,y))
    seen=set(); comps=[]
    for p in list(mask):
        if p in seen: continue
        stack=[p]; seen.add(p); xs=[]; ys=[]
        while stack:
            x,y=stack.pop(); xs.append(x); ys.append(y)
            for nx,ny in ((x+1,y),(x-1,y),(x,y+1),(x,y-1)):
                if (nx,ny) in mask and (nx,ny) not in seen:
                    seen.add((nx,ny)); stack.append((nx,ny))
        area=len(xs)
        if area < 18: continue
        x0,x1=min(xs),max(xs); y0,y1=min(ys),max(ys)
        bw=x1-x0+1; bh=y1-y0+1
        if 4 <= bw <= 72 and 5 <= bh <= 90:
            comps.append({"box":(x0,y0,x1,y1),"area":area,"center":((x0+x1)/2,(y0+y1)/2)})
    return comps

def component_chip(image, comp):
    w,h=image.size
    x0,y0,x1,y1=comp["box"]
    bw=x1-x0+1; bh=y1-y0+1
    cx=(x0+x1)/2; cy=(y0+y1)/2
    chip_w=max(34, int(max(bw*3.2, bh*2.1)))
    chip_h=max(42, int(max(bh*3.4, bw*3.0)))
    left=max(0, int(cx-chip_w/2))
    top=max(0, int(cy-chip_h*0.38))
    right=min(w, left+chip_w)
    bottom=min(h, top+chip_h)
    if right-left < 24 or bottom-top < 28:
        return None
    return image.crop((left,top,right,bottom)).resize((64,80))

def appearance_chips(jpg):
    if Image is None or ImageStat is None:
        return []
    try:
        img=Image.open(jpg).convert("RGB")
    except Exception:
        return []
    max_w=720
    if img.size[0] > max_w:
        nh=max(1, int(img.size[1] * (max_w / img.size[0])))
        img=img.resize((max_w, nh))
    chips=[]
    for comp in dark_components(img):
        chip=component_chip(img, comp)
        if chip is None: continue
        chips.append({
            "hash": dhash(chip),
            "rgb": avg_rgb(chip),
            "center": comp["center"],
            "area": comp["area"]
        })
    return chips

def deterministic_clone_crowd_finding(jpg, t):
    chips=appearance_chips(jpg)
    if len(chips) < 8:
        return None
    cluster_specs=[
        {
            "method": "local_appearance_cluster",
            "hash_threshold": 11,
            "rgb_threshold": 34,
            "min_cluster": 5,
            "reason": "highly similar head-and-shoulder chips",
        },
        {
            "method": "local_crowd_archetype_cluster",
            "hash_threshold": 18,
            "rgb_threshold": 52,
            "min_cluster": 6,
            "reason": "similar AI-crowd facial archetype chips",
        },
    ]
    for spec in cluster_specs:
        clusters=[]
        used=set()
        for i,a in enumerate(chips):
            if i in used: continue
            cluster=[i]
            for j,b in enumerate(chips[i+1:], start=i+1):
                if j in used: continue
                if (hamming(a["hash"], b["hash"]) <= spec["hash_threshold"] and
                    rgb_distance(a["rgb"], b["rgb"]) <= spec["rgb_threshold"]):
                    cluster.append(j)
            if len(cluster) >= spec["min_cluster"]:
                for idx in cluster: used.add(idx)
                clusters.append(cluster)
        if not clusters:
            continue
        largest=max(clusters, key=len)
        duplicate_count=len(largest)
        if duplicate_count < spec["min_cluster"]:
            continue
        return {
            "t": t,
            "duplicate_count": duplicate_count,
            "needs_more_character_variation": True,
            "reason": f"Local appearance clustering found {duplicate_count} {spec['reason']} in one crowd frame.",
            "action": "Regenerate or edit the scene with more distinct characters.",
            "method": spec["method"]
        }
    return None

def normalize_twins_finding(v, t):
    return {
        "t": t,
        "duplicate_count": v.get("duplicate_count"),
        "needs_more_character_variation": True,
        "reason": v.get("reason",""),
        "action": v.get("action") or "Regenerate or edit the scene with more distinct characters."
    }

def is_twins_failure(v):
    return bool(v.get("has_twins") or v.get("needs_more_character_variation"))

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("media"); ap.add_argument("--fps",type=float,default=0.25)
    ap.add_argument("--max-frames",type=int,default=200); ap.add_argument("--manifest",default=None); ap.add_argument("--json",default=None)
    a=ap.parse_args()
    if a.manifest:
        manifest_findings=manifest_twins_findings(a.manifest)
        if manifest_findings:
            result={"check":"twins","media":a.media,"media_type":"image" if is_image(a.media) else "video",
                    "manifest":a.manifest,"frames_checked":0,"deterministic_frames_checked":0,"vision_errors":0,
                    "findings":manifest_findings,"pass":False}
            out=json.dumps(result,indent=2)
            if a.json: open(a.json,"w").write(out)
            print(out); sys.exit(1)
    tmp=tempfile.mkdtemp(prefix="qctw_")
    frames=extract_frames(a.media,tmp,a.fps)[:a.max_frames]
    if not frames:
        result={"check":"twins","media":a.media,"media_type":"image" if is_image(a.media) else "video","frames_checked":0,"vision_errors":0,
                "findings":[{"t":0,"reason":"Could not decode any image/video frames for twins check.","action":"Verify the media file is a real image/video and rerun UploadCheck before shipping."}],"pass":False}
        out=json.dumps(result,indent=2)
        if a.json: open(a.json,"w").write(out)
        print(out); sys.exit(1)
    findings=[]; deterministic_checked=0
    for fp,t in frames:
        local=deterministic_clone_crowd_finding(fp,t)
        deterministic_checked+=1
        if local:
            findings.append(local)
            break
    key=load_key()
    if findings:
        for f in glob.glob(os.path.join(tmp,"*.jpg")): os.unlink(f)
        os.rmdir(tmp)
        result={"check":"twins","media":a.media,"media_type":"image" if is_image(a.media) else "video",
                "frames_checked":0,"deterministic_frames_checked":deterministic_checked,"vision_errors":0,
                "findings":findings,"pass":False}
        out=json.dumps(result,indent=2)
        if a.json: open(a.json,"w").write(out)
        print(out); sys.exit(1)
    if not key:
        result={"check":"twins","media":a.media,"media_type":"image" if is_image(a.media) else "video","frames_checked":0,
                "deterministic_frames_checked":deterministic_checked,"vision_errors":0,
                "findings":[{
                    "t":0,
                    "reason":"ANTHROPIC_API_KEY missing after deterministic twins precheck; cannot certify no cloned or under-varied crowd faces.",
                    "action":"Configure ANTHROPIC_API_KEY or remove the twins check from this run through an explicit cost/coverage decision, then rerun UploadCheck before shipping.",
                    "method":"vision_key_required"
                }],
                "skipped":False,"reason":"ANTHROPIC_API_KEY missing","pass":False}
        out=json.dumps(result,indent=2)
        if a.json: open(a.json,"w").write(out)
        print(out); sys.exit(1)
    checked=0; errors=0; provider_usage=[]
    for fp,t in frames:
        v=vision(key,fp)
        if "_error" in v: errors+=1; continue
        usage=v.pop("_provider_usage",None)
        if usage: provider_usage.append(usage)
        checked+=1
        if is_twins_failure(v):
            findings.append(normalize_twins_finding(v, t))
    for f in glob.glob(os.path.join(tmp,"*.jpg")): os.unlink(f)
    os.rmdir(tmp)
    if checked == 0 and errors:
        findings.append({"t":0,"reason":"Twins vision model failed on every sampled frame.","action":"Fix the vision-model/runtime error and rerun UploadCheck before shipping."})
    result={"check":"twins","media":a.media,"media_type":"image" if is_image(a.media) else "video",
            "frames_checked":checked,"deterministic_frames_checked":deterministic_checked,"vision_errors":errors,
            "provider_usage":provider_usage,
            "findings":findings,"pass":False if (checked == 0 and errors) else len(findings)==0}
    out=json.dumps(result,indent=2)
    if a.json: open(a.json,"w").write(out)
    print(out); sys.exit(0 if result["pass"] else 1)

if __name__=="__main__": main()
