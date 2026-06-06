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
    for (const path of ["/agent-manifest.json", "/pipeline-recipes.json", "/launch-targets.json", "/cost-basis.json"]) {
      expect(spec.paths[path].get.security).toEqual([]);
      expect(spec.paths[path].get.responses["200"].content["application/json"].schema).toEqual({ type: "object" });
    }
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
});
