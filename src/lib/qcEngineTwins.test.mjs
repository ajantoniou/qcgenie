import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("check_twins.py", () => {
  it("loads ANTHROPIC_API_KEY from the current working .env", () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-twins-env-"));
    const repoRoot = resolve(".");
    try {
      writeFileSync(join(dir, ".env"), "ANTHROPIC_API_KEY=sk-ant-test-current-working-env-1234567890\n");
      const script = `
import importlib.util
spec = importlib.util.spec_from_file_location("check_twins", "${repoRoot}/scripts/qc-engine/check_twins.py")
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
print(mod.load_key())
`;
      const env = { ...process.env };
      delete env.ANTHROPIC_API_KEY;
      delete env.NT_ANTHROPIC_API_KEY;
      delete env.CLAUDE_API_KEY;
      const result = spawnSync("python3", ["-c", script], {
        cwd: dir,
        encoding: "utf8",
        env
      });

      expect(result.status).toBe(0);
      expect(result.stdout.trim()).toBe("sk-ant-test-current-working-env-1234567890");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("normalizes duplicate-person findings to require more distinct characters", () => {
    const script = `
import importlib.util
spec = importlib.util.spec_from_file_location("check_twins", "scripts/qc-engine/check_twins.py")
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
print(mod.json.dumps(mod.normalize_twins_finding({
  "has_twins": True,
  "needs_more_character_variation": False,
  "duplicate_count": 4,
  "reason": "The same person's face appears four times.",
  "action": "Remove the duplicate grid layout."
}, 12.5)))
`;
    const result = spawnSync("python3", ["-c", script], { cwd: resolve("."), encoding: "utf8" });
    const payload = JSON.parse(result.stdout);

    expect(result.status).toBe(0);
    expect(payload).toMatchObject({
      t: 12.5,
      duplicate_count: 4,
      needs_more_character_variation: true,
      reason: "The same person's face appears four times.",
      action: "Remove the duplicate grid layout."
    });
  });

  it("adds a distinct-characters repair action when the model omits one", () => {
    const script = `
import importlib.util
spec = importlib.util.spec_from_file_location("check_twins", "scripts/qc-engine/check_twins.py")
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
print(mod.json.dumps(mod.normalize_twins_finding({
  "has_twins": True,
  "duplicate_count": 8,
  "reason": "The crowd repeats the same face and robe silhouette."
}, 0)))
`;
    const result = spawnSync("python3", ["-c", script], { cwd: resolve("."), encoding: "utf8" });
    const payload = JSON.parse(result.stdout);

    expect(result.status).toBe(0);
    expect(payload).toMatchObject({
      duplicate_count: 8,
      needs_more_character_variation: true,
      action: "Regenerate or edit the scene with more distinct characters."
    });
  });

  it("treats needs_more_character_variation as a blocking twins failure", () => {
    const script = `
import importlib.util
spec = importlib.util.spec_from_file_location("check_twins", "scripts/qc-engine/check_twins.py")
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
print(mod.json.dumps({
  "needs_only": mod.is_twins_failure({"has_twins": False, "needs_more_character_variation": True}),
  "clean": mod.is_twins_failure({"has_twins": False, "needs_more_character_variation": False})
}))
`;
    const result = spawnSync("python3", ["-c", script], { cwd: resolve("."), encoding: "utf8" });
    const payload = JSON.parse(result.stdout);

    expect(result.status).toBe(0);
    expect(payload).toEqual({
      needs_only: true,
      clean: false
    });
  });

  it("uses a no-rationalization clone-crowd prompt", () => {
    const script = `
import importlib.util
spec = importlib.util.spec_from_file_location("check_twins", "scripts/qc-engine/check_twins.py")
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
print(mod.PROMPT)
`;
    const result = spawnSync("python3", ["-c", script], { cwd: resolve("."), encoding: "utf8" });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Do NOT rationalize repetition");
    expect(result.stdout).toContain("If needs_more_character_variation is true, has_twins MUST also be true");
    expect(result.stdout).toContain("same AI man");
  });

  it("extracts overlapping crop and tile variants for wide crowd images", () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-twins-variants-"));
    const mediaPath = join(dir, "wide-crowd.jpg");

    try {
      const ffmpeg = spawnSync("ffmpeg", [
        "-y",
        "-f",
        "lavfi",
        "-i",
        "color=c=tan:s=1280x720",
        "-frames:v",
        "1",
        mediaPath
      ], { cwd: resolve("."), encoding: "utf8" });
      expect(ffmpeg.status).toBe(0);

      const script = `
import importlib.util, tempfile, json, shutil
spec = importlib.util.spec_from_file_location("check_twins", "scripts/qc-engine/check_twins.py")
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
tmp=tempfile.mkdtemp(prefix="twins_variants_")
frames=mod.extract_frames(${JSON.stringify(mediaPath)}, tmp, 0.25)
print(json.dumps({"count": len(frames), "names": [p.split("/")[-1] for p,t in frames], "times": [t for p,t in frames]}))
shutil.rmtree(tmp)
`;
      const result = spawnSync("python3", ["-c", script], { cwd: resolve("."), encoding: "utf8" });
      const payload = JSON.parse(result.stdout);

      expect(result.status).toBe(0);
      expect(payload.count).toBeGreaterThanOrEqual(8);
      expect(payload.names.some((name) => name.includes("_crop_"))).toBe(true);
      expect(payload.names.some((name) => name.includes("_tile_"))).toBe(true);
      expect(new Set(payload.times)).toEqual(new Set([0]));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("blocks when an image path cannot be decoded into a real frame", () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-twins-"));
    const mediaPath = join(dir, "crowd.jpg");
    const jsonPath = join(dir, "twins.json");

    try {
      writeFileSync(mediaPath, "fake-jpeg");
      const result = spawnSync("python3", [
        resolve("scripts/qc-engine/check_twins.py"),
        mediaPath,
        "--json",
        jsonPath
      ], { cwd: resolve("."), encoding: "utf8" });
      const payload = JSON.parse(readFileSync(jsonPath, "utf8"));

      expect(result.status).toBe(1);
      expect(payload).toMatchObject({
        check: "twins",
        pass: false,
        frames_checked: 0
      });
      expect(payload.findings[0].reason).toContain("Could not decode any image/video frames");
      expect(payload.findings[0].action).toContain("rerun UploadCheck");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("blocks clone-crowd scenes with local appearance clustering before vision", () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-twins-local-"));
    const mediaPath = join(dir, "clone-crowd.jpg");
    const jsonPath = join(dir, "twins.json");

    try {
      const makeImage = `
from PIL import Image, ImageDraw
img=Image.new("RGB",(1280,720),(202,176,128))
draw=ImageDraw.Draw(img)
positions=[(120,140),(245,155),(370,132),(520,165),(660,135),(805,160),(945,138),(1085,152),(175,355),(330,380),(505,360),(710,385),(890,365),(1040,378)]
for x,y in positions:
    draw.ellipse((x-34,y-42,x+34,y+38), fill=(32,25,20))
    draw.ellipse((x-24,y-18,x+24,y+42), fill=(157,103,72))
    draw.ellipse((x-16,y+16,x+16,y+56), fill=(42,31,26))
    draw.polygon([(x-72,y+58),(x+72,y+58),(x+102,y+205),(x-102,y+205)], fill=(137,106,73))
    draw.line((x-10,y+1,x+10,y+1), fill=(57,39,32), width=3)
    draw.line((x-7,y+28,x+7,y+28), fill=(67,42,34), width=3)
draw.ellipse((590,300,690,485), fill=(230,220,195))
draw.polygon([(640,455),(535,665),(760,665)], fill=(232,224,200))
img.save(${JSON.stringify(mediaPath)})
`;
      const imageResult = spawnSync("python3", ["-c", makeImage], { cwd: resolve("."), encoding: "utf8" });
      expect(imageResult.status).toBe(0);

      const result = spawnSync("python3", [
        resolve("scripts/qc-engine/check_twins.py"),
        mediaPath,
        "--json",
        jsonPath
      ], {
        cwd: resolve("."),
        encoding: "utf8",
        env: { ...process.env, ANTHROPIC_API_KEY: "" }
      });
      const payload = JSON.parse(readFileSync(jsonPath, "utf8"));

      expect(result.status).toBe(1);
      expect(payload).toMatchObject({
        check: "twins",
        pass: false,
        frames_checked: 0
      });
      expect(payload.deterministic_frames_checked).toBeGreaterThan(0);
      expect(payload.findings[0]).toMatchObject({
        needs_more_character_variation: true,
        method: "local_appearance_cluster",
        action: "Regenerate or edit the scene with more distinct characters."
      });
      expect(payload.findings[0].duplicate_count).toBeGreaterThanOrEqual(5);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("does not locally block pure text cards as clone crowds", () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-twins-text-card-"));
    const mediaPath = join(dir, "text-card.jpg");

    try {
      const makeImage = `
from PIL import Image, ImageDraw
img=Image.new("RGB",(640,360),(242,232,210))
draw=ImageDraw.Draw(img)
for y in [70,125,180,235]:
    draw.rectangle((80,y,560,y+22), fill=(38,31,25))
    draw.rectangle((110,y+34,490,y+50), fill=(54,45,36))
img.save(${JSON.stringify(mediaPath)})
`;
      const imageResult = spawnSync("python3", ["-c", makeImage], { cwd: resolve("."), encoding: "utf8" });
      expect(imageResult.status).toBe(0);

      const script = `
import importlib.util, tempfile, json, shutil
spec = importlib.util.spec_from_file_location("check_twins", "scripts/qc-engine/check_twins.py")
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
tmp=tempfile.mkdtemp(prefix="twins_text_card_")
try:
    frames=mod.extract_frames(${JSON.stringify(mediaPath)}, tmp, 0.25)
    findings=[mod.deterministic_clone_crowd_finding(fp,t) for fp,t in frames]
    print(json.dumps({"frames": len(frames), "findings": [f for f in findings if f]}))
finally:
    shutil.rmtree(tmp)
`;
      const result = spawnSync("python3", ["-c", script], { cwd: resolve("."), encoding: "utf8" });
      const payload = JSON.parse(result.stdout);

      expect(result.status).toBe(0);
      expect(payload.frames).toBeGreaterThan(0);
      expect(payload.findings).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("blocks manifest-marked twins or almost-identical characters before vision", () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-twins-manifest-"));
    const mediaPath = join(dir, "candidate.mp4");
    const manifestPath = join(dir, "manifest.json");
    const jsonPath = join(dir, "twins.json");

    try {
      writeFileSync(mediaPath, "fake");
      writeFileSync(manifestPath, JSON.stringify({
        scenes: [
          {
            t_start: 42,
            t_end: 48,
            narration: "The crowd gathers around the speaker.",
            similar_characters: ["left disciple", "right disciple", "rear disciple"],
            characters_too_similar: true,
            duplicate_count: 3,
            qc_note: "Three background men have almost identical faces, beards, hair, and robe silhouettes."
          }
        ]
      }));

      const result = spawnSync("python3", [
        resolve("scripts/qc-engine/check_twins.py"),
        mediaPath,
        "--manifest",
        manifestPath,
        "--json",
        jsonPath
      ], {
        cwd: resolve("."),
        encoding: "utf8",
        env: { ...process.env, UPLOADCHECK_TEST_NO_ANTHROPIC_KEY: "1" }
      });
      const payload = JSON.parse(readFileSync(jsonPath, "utf8"));

      expect(result.status).toBe(1);
      expect(payload).toMatchObject({
        check: "twins",
        pass: false,
        frames_checked: 0
      });
      expect(payload.findings[0]).toMatchObject({
        t: 42,
        t_start: 42,
        t_end: 48,
        duplicate_count: 3,
        needs_more_character_variation: true,
        method: "manifest_character_similarity",
        reason: "Three background men have almost identical faces, beards, hair, and robe silhouettes.",
        action: "Regenerate or edit the scene with more distinct characters."
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("passes twins manifest findings through run_gate.py", () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-twins-gate-manifest-"));
    const mediaPath = join(dir, "candidate.mp4");
    const manifestPath = join(dir, "manifest.json");
    const outDir = join(dir, "gate");

    try {
      writeFileSync(mediaPath, "fake");
      writeFileSync(manifestPath, JSON.stringify({
        shots: [
          {
            start_s: 9,
            end_s: 13,
            almost_identical_characters: "two women in the foreground",
            needs_more_character_variation: true
          }
        ]
      }));

      const result = spawnSync("python3", [
        resolve("scripts/qc-engine/run_gate.py"),
        mediaPath,
        "--checks",
        "twins",
        "--manifest",
        manifestPath,
        "--out",
        outDir
      ], {
        cwd: resolve("."),
        encoding: "utf8",
        env: { ...process.env, UPLOADCHECK_TEST_NO_ANTHROPIC_KEY: "1" }
      });
      const payload = JSON.parse(readFileSync(join(outDir, "VERDICT.json"), "utf8"));

      expect(result.status).toBe(1);
      expect(payload).toMatchObject({
        verdict: "BLOCK",
        blocked: ["twins"]
      });
      expect(payload.per_check.twins.findings[0]).toMatchObject({
        method: "manifest_character_similarity",
        needs_more_character_variation: true
      });
      expect(payload.per_check.twins.findings[0].reason).toContain("duplicate");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("blocks instead of skipping when the twins vision key is missing", () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-twins-no-key-"));
    const mediaPath = join(dir, "single-person.jpg");
    const jsonPath = join(dir, "twins.json");

    try {
      const ffmpeg = spawnSync("ffmpeg", [
        "-y",
        "-f",
        "lavfi",
        "-i",
        "color=c=gray:s=640x360",
        "-frames:v",
        "1",
        mediaPath
      ], { cwd: resolve("."), encoding: "utf8" });
      expect(ffmpeg.status).toBe(0);

      const result = spawnSync("python3", [
        resolve("scripts/qc-engine/check_twins.py"),
        mediaPath,
        "--json",
        jsonPath
      ], {
        cwd: resolve("."),
        encoding: "utf8",
        env: { ...process.env, UPLOADCHECK_TEST_NO_ANTHROPIC_KEY: "1" }
      });
      const payload = JSON.parse(readFileSync(jsonPath, "utf8"));

      expect(result.status).toBe(1);
      expect(payload).toMatchObject({
        check: "twins",
        pass: false,
        skipped: false,
        reason: "ANTHROPIC_API_KEY missing"
      });
      expect(payload.findings[0]).toMatchObject({
        method: "vision_key_required"
      });
      expect(payload.findings[0].reason).toContain("cannot certify no cloned or under-varied crowd faces");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("blocks through run_gate.py when the requested twins firewall cannot run vision", () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-twins-gate-no-key-"));
    const mediaPath = join(dir, "single-person.jpg");
    const outDir = join(dir, "gate");

    try {
      const ffmpeg = spawnSync("ffmpeg", [
        "-y",
        "-f",
        "lavfi",
        "-i",
        "color=c=gray:s=640x360",
        "-frames:v",
        "1",
        mediaPath
      ], { cwd: resolve("."), encoding: "utf8" });
      expect(ffmpeg.status).toBe(0);

      const result = spawnSync("python3", [
        resolve("scripts/qc-engine/run_gate.py"),
        mediaPath,
        "--checks",
        "twins",
        "--out",
        outDir
      ], {
        cwd: resolve("."),
        encoding: "utf8",
        env: { ...process.env, UPLOADCHECK_TEST_NO_ANTHROPIC_KEY: "1" }
      });
      const payload = JSON.parse(readFileSync(join(outDir, "VERDICT.json"), "utf8"));

      expect(result.status).toBe(1);
      expect(payload).toMatchObject({
        verdict: "BLOCK",
        blocked: ["twins"],
        skipped: []
      });
      expect(payload.per_check.twins.pass).toBe(false);
      expect(payload.per_check.twins.findings[0].reason).toContain("ANTHROPIC_API_KEY missing");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("locally blocks the NTO founder clone-crowd regression frame", () => {
    const fixture = "/Applications/DrAntoniou Projects/AgentCompanies/companies/NTO/content/videos/ep02-tampering-with-the-four-gospels/render-v25/_qc-clean/_scratch/inframe/clone_0615s.png";

    if (!existsSync(fixture)) {
      return;
    }

    const script = `
import importlib.util, tempfile, json, shutil
spec = importlib.util.spec_from_file_location("check_twins", "scripts/qc-engine/check_twins.py")
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
tmp=tempfile.mkdtemp(prefix="twins_nto_regression_")
try:
    frames=mod.extract_frames(${JSON.stringify(fixture)}, tmp, 0.25)
    findings=[]
    for fp,t in frames:
        local=mod.deterministic_clone_crowd_finding(fp,t)
        if local:
            findings.append(local)
            break
    print(json.dumps({"frames": len(frames), "findings": findings}))
finally:
    shutil.rmtree(tmp)
`;
    const result = spawnSync("python3", ["-c", script], { cwd: resolve("."), encoding: "utf8" });
    const payload = JSON.parse(result.stdout);

    expect(result.status).toBe(0);
    expect(payload.frames).toBeGreaterThan(0);
    expect(payload.findings[0]).toMatchObject({
      needs_more_character_variation: true,
      method: "local_crowd_archetype_cluster",
      action: "Regenerate or edit the scene with more distinct characters."
    });
    expect(payload.findings[0].duplicate_count).toBeGreaterThanOrEqual(6);
  });
});
