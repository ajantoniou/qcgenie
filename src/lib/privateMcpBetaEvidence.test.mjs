import { execFileSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";

function runCapture(evidencePath, proofPath) {
  return execFileSync("node", ["scripts/capture-private-mcp-beta-evidence.mjs", proofPath], {
    cwd: resolve("."),
    env: { ...process.env, UPLOADCHECK_PRIVATE_MCP_BETA_EVIDENCE_PATH: evidencePath },
    encoding: "utf8"
  });
}

describe("private MCP beta evidence capture", () => {
  it("captures a sanitized client proof without marking all beta evidence complete", () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-beta-evidence-"));
    try {
      const evidencePath = join(dir, "evidence.json");
      const proofPath = join(dir, "codex-proof.json");
      copyFileSync(resolve("docs/private-mcp-beta-evidence-template.json"), evidencePath);
      writeFileSync(proofPath, JSON.stringify({
        client: "codex",
        workspace_id: "ws_beta_codex",
        install_path: "local_checkout_or_private_clone",
        api_base_url: "https://api.uploadcheck.app",
        package_or_command: "/Applications/DrAntoniou Projects/UploadCheck/mcp-server/run-uploadcheck-mcp.sh",
        tools_called: ["qc_get_cost_basis", "qc_estimate_cost", "qc_run_local_file", "qc_get_job", "qc_get_report", "qc_get_marker_csv"],
        checks: ["canvas_fill", "dead_air"],
        job_id: "job_beta_codex_001",
        report_id: "report_beta_codex_001",
        verdict: "WATCH",
        sanitized_evidence_timestamp: "2026-06-07T02:00:00.000Z",
        notes: "Sanitized Codex beta proof."
      }, null, 2));

      const output = JSON.parse(runCapture(evidencePath, proofPath));
      const captured = JSON.parse(readFileSync(evidencePath, "utf8"));

      expect(output).toMatchObject({ ok: true, capturedClient: "codex", readyForPublicSubmission: false });
      expect(captured.status).toBe("template_not_captured");
      expect(captured.client_proofs.find((proof) => proof.client === "codex")).toMatchObject({
        status: "captured",
        workspace_id: "ws_beta_codex",
        job_id: "job_beta_codex_001",
        report_id: "report_beta_codex_001",
        verdict: "WATCH"
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects proofs that leak API-key-looking strings", () => {
    const dir = mkdtempSync(join(tmpdir(), "uploadcheck-beta-evidence-secret-"));
    try {
      const evidencePath = join(dir, "evidence.json");
      const proofPath = join(dir, "codex-proof.json");
      copyFileSync(resolve("docs/private-mcp-beta-evidence-template.json"), evidencePath);
      writeFileSync(proofPath, JSON.stringify({
        client: "codex",
        workspace_id: "ws_beta_codex",
        install_path: "local_checkout_or_private_clone",
        api_base_url: "https://api.uploadcheck.app",
        package_or_command: "/Applications/DrAntoniou Projects/UploadCheck/mcp-server/run-uploadcheck-mcp.sh",
        tools_called: ["qc_get_cost_basis", "qc_run_local_file", "qc_get_report"],
        checks: ["canvas_fill"],
        job_id: "job_beta_codex_001",
        report_url: "https://api.uploadcheck.app/v1/qc/jobs/job_beta_codex_001/report",
        verdict: "PASS",
        sanitized_evidence_timestamp: "2026-06-07T02:00:00.000Z",
        notes: "accidental token uck_secret_should_not_be_here"
      }, null, 2));

      expect(() => runCapture(evidencePath, proofPath)).toThrow(/possible_secret_or_hash_leak/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
