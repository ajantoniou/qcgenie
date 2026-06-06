import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("deployment cutover docs", () => {
  it("includes hosted media-ingress verification in the post-Render launch checklist", () => {
    const text = readFileSync(resolve("docs/DEPLOYMENT-CUTOVER.md"), "utf8");

    expect(text).toContain("npm run media-ingress:verify");
    expect(text).toContain("UPLOADCHECK_MEDIA_INGRESS_BASE_URL=https://qcgenie-api.onrender.com UPLOADCHECK_API_KEY=<private_bearer> npm run media-ingress:verify");
    expect(text).toContain("The hosted media-ingress probe sends tiny inline video/audio payloads and a signed-upload audio payload");
    expect(text).toContain("not the SHA-256 hash stored on Render");
  });
});
