#!/usr/bin/env python3
"""
VIDEO QC GATE — runs all checks and emits one ship/block verdict.
Checks: canvas_fill + loop_freeze + repeat_fatigue + speaker_visual_binding + static_head_dominance + literal_subject_match + first_three_seconds + end_screen_tease + rehook_cadence + contact_sheet_evidence + opening_footer_text_presence + text_crop_jitter + spoken_leaks + pronunciation_watchlist + script_faithfulness + sentence_boundary + dialogue_in_music_short + dead_air + cheap_broll + text_contrast + text_safe_area + garble (deterministic-ish), twins + narration_match + omni_watch
(vision). Deterministic checks are authoritative; vision checks supplement. Skipped checks (missing
key) are reported but do not fail the gate.
Usage:
  run_gate.py VIDEO [--checks canvas_fill,loop_freeze,repeat_fatigue,speaker_visual_binding,static_head_dominance,literal_subject_match,first_three_seconds,end_screen_tease,rehook_cadence,contact_sheet_evidence,opening_footer_text_presence,text_crop_jitter,spoken_leaks,pronunciation_watchlist,script_faithfulness,sentence_boundary,dialogue_in_music_short,dead_air,cheap_broll,text_contrast,text_safe_area,garble,twins,narration_match,omni_watch]
              [--lang eng] [--out DIR] [--manifest storybook.json] [--transcript transcript.txt] [--watchlist watchlist.json] [--expected-script script.txt] [--fast]
Exit 0 only if every RUN check PASSES.
"""
import sys, os, json, subprocess, argparse, time

HERE=os.path.dirname(os.path.abspath(__file__))
ALL=["canvas_fill","loop_freeze","repeat_fatigue","speaker_visual_binding","static_head_dominance","literal_subject_match","first_three_seconds","end_screen_tease","rehook_cadence","contact_sheet_evidence","opening_footer_text_presence","text_crop_jitter","spoken_leaks","pronunciation_watchlist","script_faithfulness","sentence_boundary","dialogue_in_music_short","dead_air","cheap_broll","text_contrast","text_safe_area","garble","twins","narration_match","omni_watch","shorts_format"]
DEFAULT=["canvas_fill","loop_freeze","repeat_fatigue","speaker_visual_binding","static_head_dominance","literal_subject_match","first_three_seconds","end_screen_tease","rehook_cadence","contact_sheet_evidence","spoken_leaks","pronunciation_watchlist","script_faithfulness","sentence_boundary","dead_air","cheap_broll","text_contrast","text_safe_area","garble","twins","narration_match","omni_watch"]
SCRIPT={c:f"check_{c}.py" for c in ALL}; SCRIPT["omni_watch"]="omni_watch.py"

def run(check,video,lang,outdir,fast,manifest=None,transcript=None,watchlist=None,expected_script=None):
    j=os.path.join(outdir,f"{check}.json")
    cmd=["python3",os.path.join(HERE,SCRIPT[check]),video,"--json",j]
    if check=="repeat_fatigue" and manifest: cmd+=["--manifest",manifest]
    if check=="speaker_visual_binding" and manifest: cmd+=["--manifest",manifest]
    if check=="static_head_dominance" and manifest: cmd+=["--manifest",manifest]
    if check=="literal_subject_match" and manifest: cmd+=["--manifest",manifest]
    if check=="first_three_seconds" and manifest: cmd+=["--manifest",manifest]
    if check=="end_screen_tease" and manifest: cmd+=["--manifest",manifest]
    if check=="rehook_cadence" and manifest: cmd+=["--manifest",manifest]
    if check=="contact_sheet_evidence" and manifest: cmd+=["--manifest",manifest]
    if check=="opening_footer_text_presence" and manifest: cmd+=["--manifest",manifest]
    if check=="text_crop_jitter" and manifest: cmd+=["--manifest",manifest]
    if check=="spoken_leaks" and transcript: cmd+=["--transcript",transcript]
    if check=="pronunciation_watchlist":
        if transcript: cmd+=["--transcript",transcript]
        if watchlist: cmd+=["--watchlist",watchlist]
    if check=="script_faithfulness":
        if transcript: cmd+=["--transcript",transcript]
        if expected_script: cmd+=["--expected-script",expected_script]
    if check=="sentence_boundary" and transcript: cmd+=["--transcript",transcript]
    if check=="dialogue_in_music_short" and transcript: cmd+=["--transcript",transcript]
    if check in ("garble","narration_match","omni_watch"): cmd+=["--lang",lang]
    if fast and check in ("twins","cheap_broll","text_contrast","text_safe_area","canvas_fill"): cmd+=["--fps","0.2"]
    if fast and check=="narration_match": cmd+=["--fps","0.25"]
    if fast and check=="omni_watch": cmd+=["--window","40"]
    t0=time.time(); p=subprocess.run(cmd,capture_output=True,text=True)
    try: data=json.load(open(j))
    except Exception: data={"check":check,"pass":None,"error":(p.stderr or p.stdout)[-300:]}
    data["_seconds"]=round(time.time()-t0,1); data["_returncode"]=p.returncode; return data

def provider_usage_for(check,result):
    usage=result.get("provider_usage") or result.get("usage") or []
    if isinstance(usage,dict): usage=[usage]
    if not isinstance(usage,list): return []
    out=[]
    for item in usage:
        if not isinstance(item,dict): continue
        enriched=dict(item)
        enriched.setdefault("check",check)
        out.append(enriched)
    return out

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("video"); ap.add_argument("--checks",default=",".join(DEFAULT))
    ap.add_argument("--lang",default="eng"); ap.add_argument("--out",default=None); ap.add_argument("--manifest",default=None); ap.add_argument("--transcript",default=None); ap.add_argument("--watchlist",default=None); ap.add_argument("--expected-script",default=None); ap.add_argument("--fast",action="store_true")
    a=ap.parse_args()
    if not os.path.exists(a.video): sys.exit(f"no such file: {a.video}")
    outdir=a.out or (os.path.splitext(a.video)[0]+"_qcgate"); os.makedirs(outdir,exist_ok=True)
    checks=[c.strip() for c in a.checks.split(",") if c.strip() in ALL]
    results={}
    for c in checks:
        print(f"[ gate ] running {c} ...",flush=True)
        results[c]=run(c,a.video,a.lang,outdir,a.fast,a.manifest,a.transcript,a.watchlist,a.expected_script)
        if results[c].get("pass") is None and results[c].get("_returncode", 0) not in (0, None):
            results[c]["pass"] = False
            results[c]["findings"] = [{
                "reason": results[c].get("error") or f"{c} checker exited {results[c].get('_returncode')}",
                "action": "Fix the checker/runtime dependency and rerun the gate before shipping."
            }]
        v=results[c].get("pass"); tag="PASS" if v is True else ("SKIP" if v is None else "BLOCK")
        print(f"[ gate ] {c}: {tag} ({results[c].get('_seconds')}s)",flush=True)
    blocked=[c for c,r in results.items() if r.get("pass") is False]
    skipped=[c for c,r in results.items() if r.get("pass") is None]
    provider_usage=[]
    for c,r in results.items():
        provider_usage.extend(provider_usage_for(c,r))
    summary={"video":a.video,"verdict":"SHIP-OK" if not blocked else "BLOCK","blocked":blocked,"skipped":skipped,
             "per_check":{c:{"pass":r.get("pass"),
                "findings":(r.get("findings") or r.get("divergences_over_threshold") or r.get("cheap_runs") or r.get("low_contrast_runs") or r.get("unsafe_text_runs") or r.get("flags") or [])[:8],
                "freezes":r.get("freezes"),
                "provider_usage":provider_usage_for(c,r)} for c,r in results.items()},
             "provider_usage":provider_usage}
    open(os.path.join(outdir,"VERDICT.json"),"w").write(json.dumps(summary,indent=2))
    print("\n=== VIDEO QC GATE VERDICT ===")
    print(json.dumps({"verdict":summary["verdict"],"blocked":blocked,"skipped":skipped},indent=2))
    print(f"details -> {outdir}/")
    sys.exit(0 if not blocked else 1)

if __name__=="__main__": main()
