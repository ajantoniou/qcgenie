export type GateId = "freeze" | "garble" | "caption" | "aspect" | "transcript" | "omni";
export type FlagSeverity = "pass" | "warn" | "block";
export type Verdict = "PASS" | "WATCH" | "BLOCK";

export interface QcFlag {
  gate: GateId;
  severity: FlagSeverity;
  timestamp: string;
  summary: string;
  transcriptEvidence?: string;
}

export interface BuildQcRunInput {
  title: string;
  minutes: number;
  deterministicFlags: QcFlag[];
  omniFlags: QcFlag[];
  transcript?: string;
}

export interface QcRun {
  title: string;
  minutes: number;
  verdict: Verdict;
  deterministicFlags: QcFlag[];
  omniFlags: QcFlag[];
  blockingFlagCount: number;
  warningFlagCount: number;
  omniFlagCount: number;
}

export function filterGroundedOmniFlags(flags: QcFlag[], transcript: string): QcFlag[] {
  const normalizedTranscript = normalize(transcript);

  return flags.filter((flag) => {
    if (flag.gate !== "omni") return true;
    if (!flag.transcriptEvidence) return false;
    return normalizedTranscript.includes(normalize(flag.transcriptEvidence));
  });
}

export function buildQcRun(input: BuildQcRunInput): QcRun {
  const omniFlags = filterGroundedOmniFlags(input.omniFlags, input.transcript ?? "");
  const blockingFlagCount = input.deterministicFlags.filter((flag) => flag.severity === "block").length;
  const warningFlagCount =
    input.deterministicFlags.filter((flag) => flag.severity === "warn").length +
    omniFlags.filter((flag) => flag.severity === "warn").length;

  return {
    title: input.title,
    minutes: input.minutes,
    verdict: blockingFlagCount > 0 ? "BLOCK" : warningFlagCount > 0 ? "WATCH" : "PASS",
    deterministicFlags: input.deterministicFlags,
    omniFlags,
    blockingFlagCount,
    warningFlagCount,
    omniFlagCount: omniFlags.length
  };
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}
