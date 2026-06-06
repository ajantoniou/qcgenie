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
});
