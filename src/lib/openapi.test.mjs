import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function loadSpecText() {
  return readFileSync(resolve("public/openapi.json"), "utf8");
}

function loadSpec() {
  return JSON.parse(loadSpecText());
}

describe("public OpenAPI spec", () => {
  it("keeps security schemes and schemas in one surviving components object", () => {
    const text = loadSpecText();
    const duplicateComponents = text.match(/^  "components":/gm) || [];
    const spec = loadSpec();

    expect(duplicateComponents).toHaveLength(1);
    expect(spec.components.securitySchemes.bearerApiKey).toMatchObject({
      type: "http",
      scheme: "bearer"
    });
    expect(spec.components.schemas.Upload).toBeTruthy();
    expect(spec.components.schemas.UploadStored).toBeTruthy();
    expect(spec.components.schemas.WebhookDelivery).toBeTruthy();
  });

  it("documents UploadCheck webhook delivery response shapes and headers", () => {
    const spec = loadSpec();
    const schemas = spec.components.schemas;

    expect(schemas.WebhookDelivery.properties.signatureHeader.const).toBe("X-UploadCheck-Signature");
    expect(schemas.WebhookDelivery.properties.legacySignatureHeader.const).toBe("X-QCGenie-Signature");

    expect(spec.paths["/v1/webhooks"].post.responses["201"].content["application/json"].schema).toEqual({
      $ref: "#/components/schemas/WebhookEndpoint"
    });
    expect(spec.paths["/v1/webhooks/{webhook_id}/delivery-preview"].get.responses["200"].content["application/json"].schema).toEqual({
      $ref: "#/components/schemas/WebhookDelivery"
    });
    expect(spec.paths["/v1/webhooks/deliveries"].get.responses["200"].content["application/json"].schema).toEqual({
      $ref: "#/components/schemas/WebhookDeliveryList"
    });
    expect(schemas.WebhookDeliveryList.properties.deliveries.items).toEqual({
      $ref: "#/components/schemas/WebhookDelivery"
    });
    expect(spec.paths["/v1/webhooks/deliveries/{delivery_id}/retry"].post.responses["200"].content["application/json"].schema).toEqual({
      $ref: "#/components/schemas/WebhookDelivery"
    });
    expect(spec.paths["/v1/webhooks/deliveries/drain"].post.responses["200"].content["application/json"].schema).toEqual({
      $ref: "#/components/schemas/WebhookDrainResult"
    });
  });

  it("documents public machine-readable metadata endpoints", () => {
    const spec = loadSpec();
    for (const path of ["/agent-manifest.json", "/pipeline-recipes.json", "/launch-targets.json", "/launch-status.json", "/cost-basis.json", "/sample-reports/index.json"]) {
      expect(spec.paths[path].get.security).toEqual([]);
      expect(spec.paths[path].get.responses["200"].content["application/json"].schema).toEqual({ type: "object" });
    }
    expect(spec.paths["/v1/launch-status"].get.security).toEqual([]);
    expect(spec.paths["/v1/launch-status"].get.responses["200"].content["application/json"].schema).toEqual({ type: "object" });
    expect(spec.paths["/llms.txt"].get.security).toEqual([]);
    expect(spec.paths["/llms.txt"].get.responses["200"].content["text/plain"].schema).toEqual({ type: "string" });
  });

  it("documents ephemeral inline-media ingress on QC jobs", () => {
    const spec = loadSpec();
    expect(spec.components.schemas.QcJob.properties.mediaIngress).toMatchObject({
      type: ["object", "null"],
      description: expect.stringContaining("Inline media is processed ephemerally")
    });
    expect(spec.components.schemas.QcJob.properties.mediaIngress.properties.mode.enum).toContain("inline_ephemeral");
    expect(spec.components.schemas.QcJob.properties.mediaIngress.properties.sha256.description).toContain("checked media bytes");
    expect(spec.components.schemas.QcJob.properties.mediaIngress.properties.storageMode.enum).toContain("render_temp_storage");
    expect(spec.components.schemas.QcJob.properties.sourceRedacted.description).toContain("local server path");
  });

  it("documents job observability fields on QC jobs", () => {
    const spec = loadSpec();
    const props = spec.components.schemas.QcJob.properties;

    expect(props.startedAt.format).toBe("date-time");
    expect(props.completedAt.format).toBe("date-time");
    expect(props.processingDurationMs.description).toContain("Wall-clock processing time");
    expect(props.failureReason.description).toContain("fallback reason");
    expect(props.observability.description).toContain("Timing");
    expect(props.observability.properties.stages.items.properties.elapsedMs.type).toBe("integer");
    expect(props.observability.properties.providerUsageEntries.type).toBe("integer");
  });

  it("documents job abuse-limit inputs and fail-fast responses", () => {
    const spec = loadSpec();
    const jobPost = spec.paths["/v1/qc/jobs"].post;
    const uploadPost = spec.paths["/v1/uploads"].post;

    expect(jobPost.requestBody.content["application/json"].schema.properties.duration_seconds.description).toContain("abuse-limit");
    expect(jobPost.requestBody.content["application/json"].schema.properties.process_async.description).toContain("queued");
    expect(jobPost.requestBody.content["application/json"].schema.properties.size_bytes.description).toContain("abuse-limit");
    expect(jobPost.responses["413"].description).toContain("abuse limit");
    expect(jobPost.responses["429"].description).toContain("concurrency");
    expect(uploadPost.responses["413"].description).toContain("maximum size");
  });

  it("documents queued worker drain execution", () => {
    const spec = loadSpec();

    expect(spec.paths["/v1/qc/jobs/drain"].post.summary).toContain("Drain queued");
    expect(spec.paths["/v1/qc/jobs/drain"].post.requestBody.content["application/json"].schema.properties.limit.maximum).toBe(25);
    expect(spec.paths["/v1/qc/jobs/drain"].post.responses["200"].description).toContain("Queued jobs processed");
  });
});
