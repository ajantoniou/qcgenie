#!/usr/bin/env node
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const THIS_FILE = fileURLToPath(import.meta.url);

async function main() {
  const baseUrl = trimTrailingSlash(process.env.UPLOADCHECK_LIVE_OPENAPI_BASE_URL || "https://qcgenie-api.onrender.com");
  const url = `${baseUrl}/openapi.json`;

  try {
    const response = await fetch(url);
    const contentType = response.headers.get("content-type") || "";
    const text = await response.text();
    if (!response.ok) {
      fail(`UploadCheck live OpenAPI: NOT READY\n${url} returned HTTP ${response.status}`);
    }
    if (!contentType.includes("application/json")) {
      fail(`UploadCheck live OpenAPI: NOT READY\n${url} returned ${contentType || "unknown content type"} instead of application/json`);
    }

    let payload;
    try {
      payload = JSON.parse(text);
    } catch (error) {
      fail(`UploadCheck live OpenAPI: NOT READY\n${url} returned invalid JSON: ${error.message}`);
    }

    const errors = validateOpenApi(payload);
    if (errors.length) {
      fail(`UploadCheck live OpenAPI: NOT READY\n${JSON.stringify({ url, errors }, null, 2)}`);
    }

    console.log(JSON.stringify({
      ok: true,
      url,
      title: payload.info?.title,
      version: payload.info?.version,
      pathCount: Object.keys(payload.paths || {}).length,
      hasLaunchEvidence: Boolean(payload.paths?.["/v1/launch-evidence"]),
      hasQueuedDrain: Boolean(payload.paths?.["/v1/qc/jobs/drain"]),
      hasUsageMargins: Boolean(payload.paths?.["/v1/usage/margins"])
    }, null, 2));
  } catch (error) {
    fail(`UploadCheck live OpenAPI: NOT READY\n${error.message}`);
  }
}

export function validateOpenApi(spec = {}) {
  const errors = [];
  requireEqual(errors, spec.openapi, "3.1.0", "openapi");
  requireEqual(errors, spec.info?.title, "UploadCheck.app API", "info.title");
  if (!spec.components?.securitySchemes?.bearerApiKey) {
    errors.push({ key: "components.securitySchemes.bearerApiKey", reason: "missing_security_scheme", detail: "OpenAPI must expose bearer API auth." });
  }
  if (!spec.components?.schemas?.QcJob) {
    errors.push({ key: "components.schemas.QcJob", reason: "missing_schema", detail: "OpenAPI must expose QcJob schema." });
  }

  for (const path of [
    "/agent-manifest.json",
    "/pipeline-handoff.json",
    "/pipeline-recipes.json",
    "/npo-pipeline-handoff.json",
    "/cost-basis.json",
    "/v1/launch-status",
    "/v1/launch-handoff",
    "/v1/launch-doctor",
    "/v1/launch-evidence"
  ]) {
    requirePublicGet(errors, spec, path);
  }

  requirePost(errors, spec, "/v1/qc/estimate");
  requirePost(errors, spec, "/v1/qc/jobs");
  requirePost(errors, spec, "/v1/qc/jobs/drain");
  requirePost(errors, spec, "/v1/uploads");
  requireGet(errors, spec, "/v1/usage/margins");
  requireGet(errors, spec, "/v1/qc/jobs/{job_id}/artifacts/markers");

  const jobProps = spec.paths?.["/v1/qc/jobs"]?.post?.requestBody?.content?.["application/json"]?.schema?.properties || {};
  for (const prop of [
    "media_base64",
    "video_base64",
    "audio_base64",
    "manifest_url",
    "transcript_url",
    "watchlist_url",
    "expected_script_url",
    "chunk_sidecars_url",
    "process_async",
    "cost_guardrail",
    "ai_review_seconds"
  ]) {
    if (!jobProps[prop]) {
      errors.push({ key: `paths./v1/qc/jobs.post.requestBody.${prop}`, reason: "missing_job_input", detail: `OpenAPI must document ${prop}.` });
    }
  }
  for (const prop of ["manifest_url", "transcript_url", "watchlist_url", "expected_script_url", "chunk_sidecars_url"]) {
    if (!String(jobProps[prop]?.description || "").includes("process_async")) {
      errors.push({ key: `paths./v1/qc/jobs.post.requestBody.${prop}`, reason: "missing_async_sidecar_description", detail: `${prop} must explain process_async queued jobs.` });
    }
  }
  if (!Array.isArray(jobProps.cost_guardrail?.enum) || !jobProps.cost_guardrail.enum.includes("downgrade")) {
    errors.push({ key: "paths./v1/qc/jobs.post.requestBody.cost_guardrail", reason: "missing_cost_guardrail", detail: "OpenAPI must expose cost_guardrail downgrade/block/off." });
  }

  const qcJobProps = spec.components?.schemas?.QcJob?.properties || {};
  if (!qcJobProps.mediaIngress?.properties?.sha256) {
    errors.push({ key: "components.schemas.QcJob.mediaIngress.sha256", reason: "missing_media_hash", detail: "OpenAPI must document source-hash proof for media ingress." });
  }
  if (!qcJobProps.sidecarIngress?.properties?.supplied?.items?.enum?.includes("chunkSidecars")) {
    errors.push({ key: "components.schemas.QcJob.sidecarIngress", reason: "missing_sidecar_ingress", detail: "OpenAPI must document sanitized remote sidecar ingress." });
  }
  if (!qcJobProps.observability?.properties?.providerUsageEntries) {
    errors.push({ key: "components.schemas.QcJob.observability.providerUsageEntries", reason: "missing_observability", detail: "OpenAPI must document provider usage telemetry." });
  }

  const drainLimit = spec.paths?.["/v1/qc/jobs/drain"]?.post?.requestBody?.content?.["application/json"]?.schema?.properties?.limit;
  if (drainLimit?.maximum !== 25) {
    errors.push({ key: "paths./v1/qc/jobs/drain.limit.maximum", reason: "missing_drain_limit", detail: "OpenAPI must document drain limit maximum 25." });
  }
  return errors;
}

function requirePublicGet(errors, spec, path) {
  requireGet(errors, spec, path);
  const security = spec.paths?.[path]?.get?.security;
  if (!Array.isArray(security) || security.length !== 0) {
    errors.push({ key: `paths.${path}.get.security`, reason: "not_public", detail: `${path} must be public metadata.` });
  }
}

function requireGet(errors, spec, path) {
  if (!spec.paths?.[path]?.get) {
    errors.push({ key: `paths.${path}.get`, reason: "missing_get", detail: `OpenAPI must document GET ${path}.` });
  }
}

function requirePost(errors, spec, path) {
  if (!spec.paths?.[path]?.post) {
    errors.push({ key: `paths.${path}.post`, reason: "missing_post", detail: `OpenAPI must document POST ${path}.` });
  }
}

function requireEqual(errors, actual, expected, key) {
  if (actual !== expected) {
    errors.push({ key, reason: "mismatch", detail: `Expected ${JSON.stringify(expected)}; found ${JSON.stringify(actual)}.` });
  }
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function trimTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

if (process.argv[1] && resolve(process.argv[1]) === THIS_FILE) {
  await main();
}
