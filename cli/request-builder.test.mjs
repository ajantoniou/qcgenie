import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { buildCostBasisRequest, buildEstimateRequest, buildJobRequest, buildLaunchDoctorRequest, buildLaunchEvidenceRequest, buildLaunchHandoffRequest, buildLaunchStatusRequest, buildNpoPipelineHandoffRequest, buildPipelineHandoffRequest, buildPipelineRecipesRequest, buildRemoteLaunchEvidence, buildUsageRequest, formatCostBasisSummary, formatJobSummary, formatLaunchDoctorSummary, formatLaunchEvidenceSummary, formatLaunchHandoffSummary, formatLaunchStatusSummary, formatNpoPipelineHandoffSummary, formatPipelineHandoffSummary, formatPipelineRecipesSummary, formatUsageSummary, parseArgs } from "./request-builder.mjs";

const servers = [];
const execFileAsync = promisify(execFile);

afterEach(async () => {
  for (const server of servers.splice(0)) {
    await new Promise((resolve) => server.close(resolve));
  }
});

describe("UploadCheck CLI request builder", () => {
  it("builds a YouTube job request", () => {
    const request = buildJobRequest("https://youtu.be/example", {
      apiBaseUrl: "https://api.example.test/",
      checks: "garble,twins",
      idempotencyKey: "idem-1",
      planId: "creator",
      aiReviewSeconds: 30,
      costGuardrail: "downgrade"
    });

    expect(request.apiBaseUrl).toBe("https://api.example.test");
    expect(request.path).toBe("/v1/qc/jobs");
    expect(request.payload).toEqual({
      youtube_url: "https://youtu.be/example",
      checks: "garble,twins",
      idempotency_key: "idem-1",
      plan_id: "creator",
      ai_review_seconds: 30,
      cost_guardrail: "downgrade"
    });
  });

  it("keeps internal Gemini backtests out of the public CLI command surface", () => {
    expect(() => parseArgs(["gemini-backtest", "/tmp/video.mp4"])).toThrow(/Usage: uploadcheck check/);
  });

  it("builds an inline local audio request", () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-cli-"));
    const file = join(dir, "episode.wav");
    writeFileSync(file, Buffer.from("RIFFfake"));

    const request = buildJobRequest(file, { maxInlineMb: 1 });

    expect(request.payload.filename).toBe("episode.wav");
    expect(request.payload.media_content_type).toBe("audio/wav");
    expect(request.payload.media_kind).toBe("audio");
    expect(request.payload.media_base64).toBe(Buffer.from("RIFFfake").toString("base64"));
  });

  it("builds an inline local image request for visual QC gates", () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-cli-"));
    const file = join(dir, "crowd.jpg");
    writeFileSync(file, Buffer.from("fake-jpeg"));

    const request = buildJobRequest(file, {
      maxInlineMb: 1,
      checks: "twins"
    });

    expect(request.payload.filename).toBe("crowd.jpg");
    expect(request.payload.media_content_type).toBe("image/jpeg");
    expect(request.payload.media_kind).toBe("image");
    expect(request.payload.checks).toBe("twins");
  });

  it("builds a signed-upload plan for oversized local files", () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-cli-"));
    const file = join(dir, "master.mp4");
    writeFileSync(file, Buffer.alloc(2048));

    const request = buildJobRequest(file, {
      apiBaseUrl: "http://127.0.0.1:10002",
      maxInlineMb: 0.001,
      checks: "canvas_fill,text_safe_area",
      idempotencyKey: "large-1",
      planPriceCents: 29900,
      includedMinutes: 5000
    });

    expect(request.kind).toBe("signed_upload");
    expect(request.createUpload).toMatchObject({
      path: "/v1/uploads",
      payload: {
        filename: "master.mp4",
        content_type: "video/mp4",
        size_bytes: 2048
      }
    });
    expect(request.createJob.payload).toEqual({
      checks: "canvas_fill,text_safe_area",
      idempotency_key: "large-1",
      plan_price_cents: 29900,
      included_minutes: 5000
    });
  });

  it("attaches an edit manifest to inline and signed jobs", () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-cli-"));
    const file = join(dir, "master.mp4");
    const manifest = join(dir, "storybook.json");
    writeFileSync(file, Buffer.from("fake-mp4"));
    writeFileSync(manifest, JSON.stringify({ beats: [{ visual_file: "clips/a.mp4" }] }));

    const inline = buildJobRequest(file, {
      maxInlineMb: 1,
      checks: "repeat_fatigue",
      manifestPath: manifest
    });
    expect(inline.payload.manifest_json).toEqual({ beats: [{ visual_file: "clips/a.mp4" }] });
    expect(inline.payload.manifest_filename).toBe("storybook.json");

    const signed = buildJobRequest(file, {
      maxInlineMb: 0.000001,
      checks: "repeat_fatigue",
      manifestPath: manifest
    });
    expect(signed.createJob.payload.manifest_json).toEqual({ beats: [{ visual_file: "clips/a.mp4" }] });
    expect(signed.createJob.payload.manifest_filename).toBe("storybook.json");
  });

  it("attaches chunk sidecar reports to inline and signed jobs", () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-cli-"));
    const file = join(dir, "voiceover.mp3");
    const sidecars = join(dir, "_dialogue-chunks");
    writeFileSync(file, Buffer.from("fake-mp3"));
    mkdirSync(sidecars, { recursive: true });
    writeFileSync(join(sidecars, "voice-03.garble-report.json"), JSON.stringify({ pass: false, status: "failed" }));

    const inline = buildJobRequest(file, {
      maxInlineMb: 1,
      checks: "chunk_sidecar_failures",
      sidecarDir: sidecars
    });
    expect(inline.payload.chunk_sidecar_dirname).toBe("_dialogue-chunks");
    expect(inline.payload.chunk_sidecars_json[0]).toMatchObject({
      relative_path: "voice-03.garble-report.json",
      filename: "voice-03.garble-report.json",
      json: { pass: false, status: "failed" }
    });

    const signed = buildJobRequest(file, {
      maxInlineMb: 0.000001,
      checks: "chunk_sidecar_failures",
      sidecarDir: sidecars
    });
    expect(signed.createJob.payload.chunk_sidecars_json[0].json.status).toBe("failed");
  });

  it("attaches transcript text to jobs", () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-cli-"));
    const file = join(dir, "master.mp4");
    const transcript = join(dir, "transcript.txt");
    writeFileSync(file, Buffer.from("fake-mp4"));
    writeFileSync(transcript, "This line says [pause] and https://example.com by mistake.");

    const request = buildJobRequest(file, {
      maxInlineMb: 1,
      checks: "spoken_leaks",
      transcriptPath: transcript
    });

    expect(request.payload.transcript_text).toContain("[pause]");
    expect(request.payload.transcript_filename).toBe("transcript.txt");
  });

  it("attaches pronunciation watchlists to jobs", () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-cli-"));
    const file = join(dir, "master.mp4");
    const transcript = join(dir, "transcript.txt");
    const watchlist = join(dir, "watchlist.json");
    writeFileSync(file, Buffer.from("fake-mp4"));
    writeFileSync(transcript, "Marcion was rendered as Martian.");
    writeFileSync(watchlist, JSON.stringify({ terms: [{ expected: "Marcion", banned: ["Martian"] }] }));

    const request = buildJobRequest(file, {
      maxInlineMb: 1,
      checks: "pronunciation_watchlist",
      transcriptPath: transcript,
      watchlistPath: watchlist
    });

    expect(request.payload.transcript_text).toContain("Martian");
    expect(request.payload.watchlist_json).toEqual({ terms: [{ expected: "Marcion", banned: ["Martian"] }] });
    expect(request.payload.watchlist_filename).toBe("watchlist.json");
  });

  it("attaches expected scripts to inline and signed jobs", () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-cli-"));
    const file = join(dir, "master.mp4");
    const transcript = join(dir, "transcript.txt");
    const expectedScript = join(dir, "locked-script.txt");
    writeFileSync(file, Buffer.from("fake-mp4"));
    writeFileSync(transcript, "Marcion was born in Sinope.");
    writeFileSync(expectedScript, "Marcion was born in Sinope and later challenged Rome.");

    const inline = buildJobRequest(file, {
      maxInlineMb: 1,
      checks: "script_faithfulness",
      transcriptPath: transcript,
      expectedScriptPath: expectedScript
    });
    expect(inline.payload.transcript_text).toContain("Marcion");
    expect(inline.payload.expected_script_text).toContain("challenged Rome");
    expect(inline.payload.expected_script_filename).toBe("locked-script.txt");

    const signed = buildJobRequest(file, {
      maxInlineMb: 0.000001,
      checks: "script_faithfulness",
      transcriptPath: transcript,
      expectedScriptPath: expectedScript
    });
    expect(signed.createJob.payload.expected_script_text).toContain("challenged Rome");
    expect(signed.createJob.payload.expected_script_filename).toBe("locked-script.txt");
  });

  it("parses command flags", () => {
    const parsed = parseArgs([
      "check",
      "cut.mp4",
      "--api-base",
      "http://127.0.0.1:10001",
      "--checks",
      "garble",
      "--upload-mode",
      "signed",
      "--manifest",
      "storybook.json",
      "--transcript",
      "transcript.txt",
      "--watchlist",
      "watchlist.json",
      "--expected-script",
      "locked-script.txt",
      "--sidecar-dir",
      "_dialogue-chunks",
      "--plan",
      "studio",
      "--ai-review-seconds",
      "45",
      "--cost-guardrail",
      "block",
      "--json"
    ]);

    expect(parsed.target).toBe("cut.mp4");
    expect(parsed.options).toEqual({
      apiBaseUrl: "http://127.0.0.1:10001",
      checks: "garble",
      uploadMode: "signed",
      manifestPath: "storybook.json",
      transcriptPath: "transcript.txt",
      watchlistPath: "watchlist.json",
      expectedScriptPath: "locked-script.txt",
      sidecarDir: "_dialogue-chunks",
      planId: "studio",
      aiReviewSeconds: "45",
      costGuardrail: "block",
      json: true
    });
  });

  it("builds and parses a preflight estimate request", () => {
    const parsed = parseArgs([
      "estimate",
      "--api-base",
      "https://api.example.test",
      "--minutes",
      "10",
      "--checks",
      "canvas_fill,twins",
      "--plan",
      "creator",
      "--cost-guardrail",
      "downgrade",
      "--json"
    ]);
    expect(parsed.command).toBe("estimate");
    expect(parsed.target).toBeNull();

    const request = buildEstimateRequest(parsed.options);
    expect(request).toMatchObject({
      apiBaseUrl: "https://api.example.test",
      path: "/v1/qc/estimate",
      method: "POST",
      kind: "estimate"
    });
    expect(request.payload).toEqual({
      checks: "canvas_fill,twins",
      minutes: 10,
      plan_id: "creator",
      cost_guardrail: "downgrade"
    });
  });

  it("builds and parses a usage margin request", () => {
    const parsed = parseArgs([
      "usage",
      "--api-base",
      "https://api.example.test",
      "--billing-period",
      "2026-06",
      "--limit",
      "25",
      "--json"
    ]);
    const request = buildUsageRequest(parsed.options);

    expect(parsed.command).toBe("usage");
    expect(parsed.target).toBeNull();
    expect(request).toEqual({
      apiBaseUrl: "https://api.example.test",
      path: "/v1/usage/margins?billing_period=2026-06&limit=25",
      method: "GET",
      kind: "usage"
    });
  });

  it("builds and parses a public launch-status request", () => {
    const parsed = parseArgs([
      "launch-status",
      "--api-base",
      "https://api.example.test",
      "--json"
    ]);
    const request = buildLaunchStatusRequest(parsed.options);

    expect(parsed.command).toBe("launch-status");
    expect(parsed.target).toBeNull();
    expect(request).toEqual({
      apiBaseUrl: "https://api.example.test",
      path: "/v1/launch-status",
      method: "GET",
      kind: "launch_status",
      public: true
    });
  });

  it("builds and parses a public launch-handoff request", () => {
    const parsed = parseArgs([
      "launch-handoff",
      "--api-base",
      "https://api.example.test",
      "--json"
    ]);
    const request = buildLaunchHandoffRequest(parsed.options);

    expect(parsed.command).toBe("launch-handoff");
    expect(parsed.target).toBeNull();
    expect(request).toEqual({
      apiBaseUrl: "https://api.example.test",
      path: "/v1/launch-handoff",
      method: "GET",
      kind: "launch_handoff",
      public: true
    });
  });

  it("builds and parses a public launch-doctor request", () => {
    const parsed = parseArgs([
      "launch-doctor",
      "--api-base",
      "https://api.example.test",
      "--json"
    ]);
    const request = buildLaunchDoctorRequest(parsed.options);

    expect(parsed.command).toBe("launch-doctor");
    expect(parsed.target).toBeNull();
    expect(request).toEqual({
      apiBaseUrl: "https://api.example.test",
      path: "/v1/launch-doctor",
      method: "GET",
      kind: "launch_doctor",
      public: true
    });
  });

  it("builds and parses a public pipeline recipes request", () => {
    const parsed = parseArgs([
      "recipes",
      "--api-base",
      "https://api.example.test",
      "--json"
    ]);
    const request = buildPipelineRecipesRequest(parsed.options);

    expect(parsed.command).toBe("recipes");
    expect(parsed.target).toBeNull();
    expect(request).toEqual({
      apiBaseUrl: "https://api.example.test",
      path: "/pipeline-recipes.json",
      method: "GET",
      kind: "pipeline_recipes",
      public: true
    });
  });

  it("builds and parses a public pipeline handoff request", () => {
    const parsed = parseArgs([
      "pipeline-handoff",
      "--api-base",
      "https://api.example.test",
      "--json"
    ]);
    const request = buildPipelineHandoffRequest(parsed.options);

    expect(parsed.command).toBe("pipeline-handoff");
    expect(parsed.target).toBeNull();
    expect(request).toEqual({
      apiBaseUrl: "https://api.example.test",
      path: "/pipeline-handoff.json",
      method: "GET",
      kind: "pipeline_handoff",
      public: true
    });
  });

  it("builds and parses a public NPO pipeline handoff request", () => {
    const parsed = parseArgs([
      "npo-pipeline-handoff",
      "--api-base",
      "https://api.example.test",
      "--json"
    ]);
    const request = buildNpoPipelineHandoffRequest(parsed.options);

    expect(parsed.command).toBe("npo-pipeline-handoff");
    expect(parsed.target).toBeNull();
    expect(request).toEqual({
      apiBaseUrl: "https://api.example.test",
      path: "/npo-pipeline-handoff.json",
      method: "GET",
      kind: "npo_pipeline_handoff",
      public: true
    });
  });

  it("builds and parses a public cost-basis request", () => {
    const parsed = parseArgs([
      "cost-basis",
      "--api-base",
      "https://api.example.test",
      "--json"
    ]);
    const request = buildCostBasisRequest(parsed.options);

    expect(parsed.command).toBe("cost-basis");
    expect(parsed.target).toBeNull();
    expect(request).toEqual({
      apiBaseUrl: "https://api.example.test",
      path: "/cost-basis.json",
      method: "GET",
      kind: "cost_basis",
      public: true
    });
  });

  it("formats a compact job summary", () => {
    expect(formatJobSummary({
      jobId: "job_1",
      status: "completed",
      verdict: "WATCH",
      minutesMetered: 2,
      mediaIngress: {
        mode: "inline_ephemeral",
        contentType: "video/mp4",
        bytes: 12345,
        sha256: "a1".repeat(32)
      },
      costEstimate: { estimatedCogsUsd: 0.0017 }
    })).toContain("job_1: completed / WATCH | 2 min | media inline_ephemeral video/mp4 12 KB sha256 a1a1a1a1a1a1... | est. COGS $0.0017");
    expect(formatJobSummary({
      jobId: "job_2",
      status: "completed",
      verdict: "PASS",
      minutesMetered: 1,
      mediaIngress: {
        mode: "signed_upload",
        contentType: "audio/wav",
        bytes: 1048576,
        sha256: "B2".repeat(32)
      },
      costEstimate: { estimatedCogsCents: 0.0833, observedTotalCogsCents: 0.7364 }
    })).toContain("job_2: completed / PASS | 1 min | media signed_upload audio/wav 1.00 MB sha256 b2b2b2b2b2b2... | est. COGS $0.0008 | observed COGS $0.0074");
  });

  it("formats a compact usage margin summary", () => {
    expect(formatUsageSummary({
      summary: {
        minutes: 42,
        estimatedCogsCents: 3.4986,
        estimatedCostPerMinuteCents: 0.0833,
        estimatedGrossMarginPct: 95.79,
        marginSafe: true
      }
    })).toBe("UploadCheck usage: MARGIN SAFE | 42 min | est. COGS $0.0350 | cost/min 0.0833c | margin 95.79%");
  });

  it("formats observed usage margin telemetry when provider usage exists", () => {
    expect(formatUsageSummary({
      summary: {
        minutes: 1,
        estimatedCogsCents: 0.6833,
        estimatedCostPerMinuteCents: 0.6833,
        estimatedGrossMarginPct: 65.49,
        observedProviderUsageEntries: 1,
        observedCostPerMinuteCents: 0.7364,
        observedGrossMarginPct: 62.81,
        marginSafe: false
      }
    })).toBe("UploadCheck usage: MARGIN RISK | 1 min | est. COGS $0.0068 | cost/min 0.6833c | margin 65.49% | observed cost/min 0.7364c | observed margin 62.81%");
  });

  it("formats a compact launch status summary", () => {
    expect(formatLaunchStatusSummary({
      product_hunt_ready: false,
      remaining_blockers: [{ id: "checkout" }, { id: "custom_domain" }]
    })).toBe("UploadCheck launch status: NOT READY | blockers checkout, custom_domain");
    expect(formatLaunchStatusSummary({
      product_hunt_ready: true,
      remaining_blockers: []
    })).toBe("UploadCheck launch status: READY");
  });

  it("formats a compact launch handoff summary", () => {
    expect(formatLaunchHandoffSummary({
      productHuntReady: false,
      remainingBlockers: [{ id: "checkout" }, { id: "storage" }],
      requiredActions: [{ id: "render_env" }, { id: "checkout" }]
    })).toBe("UploadCheck launch handoff: NOT READY | blockers checkout, storage | required actions render_env, checkout");
    expect(formatLaunchHandoffSummary({
      productHuntReady: true,
      remainingBlockers: [],
      requiredActions: []
    })).toBe("UploadCheck launch handoff: READY");
  });

  it("formats a compact launch doctor summary from the live handoff shape", () => {
    expect(formatLaunchDoctorSummary({
      productHuntReady: false,
      remainingBlockers: [{ id: "checkout" }, { id: "storage" }],
      blockerFixPlan: { phases: [{ id: "configure-checkout" }, { id: "configure-upload-storage" }] },
      launchDoctorCommands: ["npm run launch:doctor", "npm run launch:check"]
    })).toBe("UploadCheck launch doctor: NOT READY | blockers checkout, storage | fix phases 2 | doctor commands 2");
    expect(formatLaunchDoctorSummary({
      productHuntReady: true,
      remainingBlockers: [],
      blockerFixPlan: { phases: [] }
    })).toBe("UploadCheck launch doctor: READY");
  });

  it("formats a compact pipeline recipes summary", () => {
    expect(formatPipelineRecipesSummary({
      profiles: {
        nto_long_form: {},
        npo_podcast_or_audio: {}
      },
      nto_replacement_qc: {
        implemented_gates: [{ id: "text_contrast" }, { id: "repeat_fatigue" }]
      }
    })).toBe("UploadCheck pipeline recipes: 2 profiles (nto_long_form, npo_podcast_or_audio) | 2 implemented NTO/NPO replacement gates");
  });

  it("builds and formats remote launch evidence from live launch doctor metadata", () => {
    const request = buildLaunchEvidenceRequest({ apiBaseUrl: "https://api.example.test/" });
    const evidence = buildRemoteLaunchEvidence({
      productHuntReady: false,
      remainingBlockers: [{ id: "checkout" }, { id: "storage" }],
      launchDoctorCommands: [
        "UPLOADCHECK_API_KEY=uck_secret npm run media-ingress:verify",
        "https://uploadcheck.lemonsqueezy.com/checkout/buy/123456"
      ],
      blockerFixPlan: {
        phases: [{
          id: "configure-checkout",
          title: "Configure checkout",
          blockers: ["checkout"],
          proof_commands: ["https://checkout.example/creator-secret"]
        }],
        completionRule: "Only launch when ready."
      }
    }, {
      generatedAt: "2026-06-06T00:00:00.000Z",
      source: "https://api.example.test/v1/launch-doctor"
    });

    expect(request).toMatchObject({
      apiBaseUrl: "https://api.example.test",
      path: "/v1/launch-evidence",
      method: "GET",
      kind: "launch_evidence",
      public: true
    });
    expect(evidence).toMatchObject({
      name: "UploadCheck.app Remote Launch Evidence",
      status: "blocked",
      blockers: ["checkout", "storage"]
    });
    expect(JSON.stringify(evidence)).not.toContain("uck_secret");
    expect(JSON.stringify(evidence)).not.toContain("123456");
    expect(JSON.stringify(evidence)).not.toContain("creator-secret");
    expect(formatLaunchEvidenceSummary(evidence)).toBe("UploadCheck launch evidence: NOT READY | blockers checkout, storage | fix phases 1 | commands 2");
  });

  it("parses the packaged launch-evidence command", () => {
    const parsed = parseArgs(["launch-evidence", "--json", "--api-base", "https://api.example.test"]);

    expect(parsed.command).toBe("launch-evidence");
    expect(parsed.options).toMatchObject({
      json: true,
      apiBaseUrl: "https://api.example.test"
    });
  });

  it("prints packaged launch evidence JSON without leaking live secret-like values", async () => {
    const server = createServer((req, res) => {
      if (req.url !== "/v1/launch-evidence") {
        res.writeHead(404, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "not_found", url: req.url }));
        return;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(buildRemoteLaunchEvidence({
        productHuntReady: false,
        remainingBlockers: [{ id: "checkout" }],
        launchDoctorCommands: [
          "UPLOADCHECK_API_KEY=uck_secret npm run media-ingress:verify",
          "https://uploadcheck.lemonsqueezy.com/checkout/buy/123456"
        ],
        blockerFixPlan: {
          phases: [{
            id: "configure-checkout",
            title: "Configure checkout",
            blockers: ["checkout"],
            proof_commands: ["https://checkout.example/creator-secret"]
          }]
        }
      }, {
        source: "http://127.0.0.1/v1/launch-doctor"
      })));
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    servers.push(server);

    const result = await execFileAsync("node", ["cli/index.mjs", "launch-evidence", "--json", "--api-base", `http://127.0.0.1:${server.address().port}`], {
      encoding: "utf8"
    });
    const payload = JSON.parse(result.stdout);

    expect(payload.name).toBe("UploadCheck.app Remote Launch Evidence");
    expect(payload.blockers).toEqual(["checkout"]);
    expect(JSON.stringify(payload)).not.toContain("uck_secret");
    expect(JSON.stringify(payload)).not.toContain("123456");
    expect(JSON.stringify(payload)).not.toContain("creator-secret");
  });

  it("formats a compact pipeline handoff summary", () => {
    expect(formatPipelineHandoffSummary({
      profiles: ["nto_long_form", "npo_podcast_or_audio"],
      call_sequence: [{ step: 1 }, { step: 2 }, { step: 3 }],
      media_ingress: {
        inline_ephemeral: {},
        signed_upload: {}
      }
    })).toBe("UploadCheck pipeline handoff: 3 steps | profiles nto_long_form, npo_podcast_or_audio | media ingress inline_ephemeral, signed_upload");
  });

  it("formats a compact NPO pipeline handoff summary", () => {
    expect(formatNpoPipelineHandoffSummary({
      cost_preflight: { checks: "dead_air,spoken_leaks" },
      mcp_sequence: [{ step: 1 }, { step: 2 }],
      required_sidecars: {
        transcript_path: "Transcript",
        watchlist_path: "Watchlist"
      }
    })).toBe("UploadCheck NPO pipeline handoff: 2 MCP steps | checks dead_air,spoken_leaks | sidecars transcript_path, watchlist_path");
  });

  it("formats a compact public cost-basis summary", () => {
    expect(formatCostBasisSummary({
      target_gross_margin_pct: 95,
      plans: [{
        plan_id: "stress_99_5000",
        remaining_cost_per_minute_after_deterministic_full_allowance_cents: 0.0157
      }],
      verdict: {
        stress_99_5000: "$99 for 5,000 checked minutes is too generous for full-model review. Public pricing stays deterministic QC minutes."
      }
    })).toBe("UploadCheck cost basis: target margin 95% | $99/5,000 remaining post-deterministic COGS 0.0157c/min | $99 for 5,000 checked minutes is too generous for full-model review. Public pricing stays deterministic QC minutes.");
  });
});
