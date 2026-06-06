import { describe, expect, it } from "vitest";
import { buildLaunchCheck, formatLaunchCheck } from "../../launch-check.mjs";

describe("launch check", () => {
  it("marks launch ready when readiness, DNS, and HTTP pass", async () => {
    const result = await buildLaunchCheck({
      apiBaseUrl: "https://api.example.test",
      fetchImpl: async (url) => ({
        ok: true,
        status: String(url).includes("/v1/readiness") ? 200 : 200,
        json: async () => ({ readyForProductHunt: true })
      }),
      resolver: async () => [{ address: "216.24.57.1", family: 4 }]
    });

    expect(result.ready).toBe(true);
    expect(result.blockers).toEqual([]);
    expect(formatLaunchCheck(result)).toContain("UploadCheck launch: READY");
  });

  it("lists readiness and domain blockers", async () => {
    const result = await buildLaunchCheck({
      apiBaseUrl: "https://api.example.test",
      fetchImpl: async (url) => {
        if (String(url).includes("/v1/readiness")) {
          return { ok: true, status: 200, json: async () => ({ readyForProductHunt: false }) };
        }
        return { ok: false, status: 404, json: async () => ({}) };
      },
      resolver: async (host) => {
        if (host === "api.uploadcheck.app") throw new Error("ENOTFOUND");
        return [{ address: "216.24.57.1", family: 4 }];
      }
    });

    expect(result.ready).toBe(false);
    expect(result.blockers).toContain("readiness");
    expect(result.blockers).toContain("api.uploadcheck.app:dns");
    expect(formatLaunchCheck(result)).toContain("Blockers:");
  });
});
