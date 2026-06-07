import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const REQUIRED_LOCAL_PROOF_COMMANDS = [
  "npm run saas-basics:verify",
  "npm run mcp-install:verify",
  "npm run private-mcp-beta:verify",
  "npm run anthropic-directory:verify",
  "npm run product-agent:verify"
];

function listen(handler) {
  const server = createServer(handler);
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({ server, baseUrl: `http://127.0.0.1:${address.port}` });
    });
  });
}

describe("live launch doctor verifier", () => {
  it("passes when the hosted endpoint returns the launch doctor JSON shape", async () => {
    const { server, baseUrl } = await listen((_req, res) => {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({
        name: "UploadCheck.app Launch Doctor",
        contractVersion: "2026-06-06.render-web-proof",
        launchDoctorCommands: [
          "UPLOADCHECK_LIVE_WEB_BASE_URL=https://qcgenie-web.onrender.com npm run live-web-artifacts:verify",
          "UPLOADCHECK_MEDIA_INGRESS_BASE_URL=https://api.uploadcheck.app UPLOADCHECK_API_KEY=<private_bearer> npm run media-ingress:verify",
          ...REQUIRED_LOCAL_PROOF_COMMANDS
        ],
        blockerFixPlan: { phases: [] },
        remainingBlockers: []
      }));
    });

    try {
      const result = await execFileAsync("node", ["scripts/verify-live-launch-doctor.mjs"], {
        cwd: process.cwd(),
        env: { ...process.env, UPLOADCHECK_LIVE_LAUNCH_DOCTOR_BASE_URL: baseUrl }
      });
      expect(JSON.parse(result.stdout)).toMatchObject({
        ok: true,
        contractVersion: "2026-06-06.render-web-proof",
        hostedMediaIngressCommandPresent: true,
        renderWebArtifactsCommandPresent: true,
        requiredLocalProofCommandsPresent: true
      });
    } finally {
      server.close();
    }
  });

  it("blocks when the hosted launch doctor omits SaaS and MCP proof commands", async () => {
    const { server, baseUrl } = await listen((_req, res) => {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({
        name: "UploadCheck.app Launch Doctor",
        contractVersion: "2026-06-06.render-web-proof",
        launchDoctorCommands: [
          "UPLOADCHECK_LIVE_WEB_BASE_URL=https://qcgenie-web.onrender.com npm run live-web-artifacts:verify",
          "UPLOADCHECK_MEDIA_INGRESS_BASE_URL=https://api.uploadcheck.app UPLOADCHECK_API_KEY=<private_bearer> npm run media-ingress:verify"
        ],
        blockerFixPlan: { phases: [] },
        remainingBlockers: []
      }));
    });

    try {
      await expect(execFileAsync("node", ["scripts/verify-live-launch-doctor.mjs"], {
        cwd: process.cwd(),
        env: { ...process.env, UPLOADCHECK_LIVE_LAUNCH_DOCTOR_BASE_URL: baseUrl }
      })).rejects.toMatchObject({
        stderr: expect.stringContaining("Missing SaaS/MCP/Directory proof commands")
      });
    } finally {
      server.close();
    }
  });

  it("blocks when the hosted launch doctor omits Render static web proof", async () => {
    const { server, baseUrl } = await listen((_req, res) => {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({
        name: "UploadCheck.app Launch Doctor",
        contractVersion: "2026-06-06.render-web-proof",
        launchDoctorCommands: [
          "UPLOADCHECK_MEDIA_INGRESS_BASE_URL=https://api.uploadcheck.app UPLOADCHECK_API_KEY=<private_bearer> npm run media-ingress:verify",
          ...REQUIRED_LOCAL_PROOF_COMMANDS
        ],
        blockerFixPlan: { phases: [] },
        remainingBlockers: []
      }));
    });

    try {
      await expect(execFileAsync("node", ["scripts/verify-live-launch-doctor.mjs"], {
        cwd: process.cwd(),
        env: { ...process.env, UPLOADCHECK_LIVE_LAUNCH_DOCTOR_BASE_URL: baseUrl }
      })).rejects.toMatchObject({
        stderr: expect.stringContaining("Missing Render static web-artifacts command")
      });
    } finally {
      server.close();
    }
  });

  it("blocks when the hosted launch doctor omits the current contract version", async () => {
    const { server, baseUrl } = await listen((_req, res) => {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({
        name: "UploadCheck.app Launch Doctor",
        launchDoctorCommands: [
          "UPLOADCHECK_LIVE_WEB_BASE_URL=https://qcgenie-web.onrender.com npm run live-web-artifacts:verify",
          "UPLOADCHECK_MEDIA_INGRESS_BASE_URL=https://api.uploadcheck.app UPLOADCHECK_API_KEY=<private_bearer> npm run media-ingress:verify",
          ...REQUIRED_LOCAL_PROOF_COMMANDS
        ],
        blockerFixPlan: { phases: [] },
        remainingBlockers: []
      }));
    });

    try {
      await expect(execFileAsync("node", ["scripts/verify-live-launch-doctor.mjs"], {
        cwd: process.cwd(),
        env: { ...process.env, UPLOADCHECK_LIVE_LAUNCH_DOCTOR_BASE_URL: baseUrl }
      })).rejects.toMatchObject({
        stderr: expect.stringContaining("Expected contractVersion")
      });
    } finally {
      server.close();
    }
  });

  it("blocks when the hosted endpoint returns the static HTML app", async () => {
    const { server, baseUrl } = await listen((_req, res) => {
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.end("<!doctype html><title>UploadCheck</title>");
    });

    try {
      await expect(execFileAsync("node", ["scripts/verify-live-launch-doctor.mjs"], {
        cwd: process.cwd(),
        env: { ...process.env, UPLOADCHECK_LIVE_LAUNCH_DOCTOR_BASE_URL: baseUrl }
      })).rejects.toMatchObject({
        stderr: expect.stringContaining("instead of application/json")
      });
    } finally {
      server.close();
    }
  });
});
