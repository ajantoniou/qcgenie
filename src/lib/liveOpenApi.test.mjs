import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { validateOpenApi } from "../../scripts/verify-live-openapi.mjs";

function readJson(path) {
  return JSON.parse(readFileSync(resolve(path), "utf8"));
}

describe("live OpenAPI verifier", () => {
  it("accepts the current public OpenAPI contract", () => {
    expect(validateOpenApi(readJson("public/openapi.json"))).toEqual([]);
  });

  it("rejects stale OpenAPI specs missing launch evidence and async sidecars", () => {
    const spec = readJson("public/openapi.json");
    delete spec.paths["/v1/launch-evidence"];
    delete spec.paths["/v1/qc/jobs"].post.requestBody.content["application/json"].schema.properties.chunk_sidecars_url;
    delete spec.components.schemas.QcJob.properties.sidecarIngress;

    expect(validateOpenApi(spec).map((error) => error.reason)).toEqual(expect.arrayContaining([
      "missing_get",
      "missing_job_input",
      "missing_sidecar_ingress"
    ]));
  });
});
