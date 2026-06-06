import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

function listen(handler) {
  const server = createServer(handler);
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({ server, baseUrl: `http://127.0.0.1:${address.port}` });
    });
  });
}

describe("live launch evidence verifier", () => {
  it("passes when command coverage includes hosted media and Render static web proof", async () => {
    const { server, baseUrl } = await listen((_req, res) => {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({
        name: "UploadCheck.app Remote Launch Evidence",
        contractVersion: "2026-06-06.render-web-proof",
        source: "https://api.uploadcheck.app/v1/launch-doctor",
        productHuntReady: false,
        status: "blocked",
        blockers: ["checkout"],
        commandCoverage: [
          "UPLOADCHECK_LIVE_WEB_BASE_URL=https://qcgenie-web.onrender.com npm run live-web-artifacts:verify",
          "UPLOADCHECK_MEDIA_INGRESS_BASE_URL=https://api.uploadcheck.app UPLOADCHECK_API_KEY=<private_bearer> npm run media-ingress:verify"
        ]
      }));
    });

    try {
      const result = await execFileAsync("node", ["scripts/verify-live-launch-evidence.mjs"], {
        cwd: process.cwd(),
        env: { ...process.env, UPLOADCHECK_LIVE_LAUNCH_EVIDENCE_BASE_URL: baseUrl }
      });
      expect(JSON.parse(result.stdout)).toMatchObject({
        ok: true,
        contractVersion: "2026-06-06.render-web-proof",
        redactedHostedMediaIngressCommandPresent: true,
        renderWebArtifactsCommandPresent: true
      });
    } finally {
      server.close();
    }
  });

  it("blocks when command coverage omits Render static web proof", async () => {
    const { server, baseUrl } = await listen((_req, res) => {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({
        name: "UploadCheck.app Remote Launch Evidence",
        contractVersion: "2026-06-06.render-web-proof",
        source: "https://api.uploadcheck.app/v1/launch-doctor",
        commandCoverage: [
          "UPLOADCHECK_MEDIA_INGRESS_BASE_URL=https://api.uploadcheck.app UPLOADCHECK_API_KEY=<private_bearer> npm run media-ingress:verify"
        ]
      }));
    });

    try {
      await expect(execFileAsync("node", ["scripts/verify-live-launch-evidence.mjs"], {
        cwd: process.cwd(),
        env: { ...process.env, UPLOADCHECK_LIVE_LAUNCH_EVIDENCE_BASE_URL: baseUrl }
      })).rejects.toMatchObject({
        stderr: expect.stringContaining("Missing Render static web-artifacts command coverage")
      });
    } finally {
      server.close();
    }
  });

  it("blocks when the hosted launch evidence omits the current contract version", async () => {
    const { server, baseUrl } = await listen((_req, res) => {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({
        name: "UploadCheck.app Remote Launch Evidence",
        source: "https://api.uploadcheck.app/v1/launch-doctor",
        commandCoverage: [
          "UPLOADCHECK_LIVE_WEB_BASE_URL=https://qcgenie-web.onrender.com npm run live-web-artifacts:verify",
          "UPLOADCHECK_MEDIA_INGRESS_BASE_URL=https://api.uploadcheck.app UPLOADCHECK_API_KEY=<private_bearer> npm run media-ingress:verify"
        ]
      }));
    });

    try {
      await expect(execFileAsync("node", ["scripts/verify-live-launch-evidence.mjs"], {
        cwd: process.cwd(),
        env: { ...process.env, UPLOADCHECK_LIVE_LAUNCH_EVIDENCE_BASE_URL: baseUrl }
      })).rejects.toMatchObject({
        stderr: expect.stringContaining("Expected contractVersion")
      });
    } finally {
      server.close();
    }
  });
});
