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

describe("live launch doctor verifier", () => {
  it("passes when the hosted endpoint returns the launch doctor JSON shape", async () => {
    const { server, baseUrl } = await listen((_req, res) => {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({
        name: "UploadCheck.app Launch Doctor",
        launchDoctorCommands: [
          "UPLOADCHECK_MEDIA_INGRESS_BASE_URL=https://qcgenie-api.onrender.com UPLOADCHECK_API_KEY=<private_bearer> npm run media-ingress:verify"
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
        hostedMediaIngressCommandPresent: true
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
