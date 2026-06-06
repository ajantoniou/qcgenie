#!/usr/bin/env node
import { createReadStream } from "node:fs";
import { buildCostBasisRequest, buildEstimateRequest, buildJobRequest, buildLaunchDoctorRequest, buildLaunchHandoffRequest, buildLaunchStatusRequest, buildPipelineHandoffRequest, buildPipelineRecipesRequest, buildUsageRequest, formatCostBasisSummary, formatJobSummary, formatLaunchDoctorSummary, formatLaunchHandoffSummary, formatLaunchStatusSummary, formatPipelineHandoffSummary, formatPipelineRecipesSummary, formatUsageSummary, parseArgs } from "./request-builder.mjs";

try {
  const { command, target, options } = parseArgs(process.argv.slice(2));
  const apiKey = options.apiKey || process.env.UPLOADCHECK_API_KEY || process.env.QCGENIE_API_KEY;

  const request = command === "estimate"
    ? buildEstimateRequest(options)
    : (command === "usage" ? buildUsageRequest(options) : (command === "launch-status" ? buildLaunchStatusRequest(options) : (command === "launch-handoff" ? buildLaunchHandoffRequest(options) : (command === "launch-doctor" ? buildLaunchDoctorRequest(options) : (command === "pipeline-handoff" ? buildPipelineHandoffRequest(options) : (command === "recipes" ? buildPipelineRecipesRequest(options) : (command === "cost-basis" ? buildCostBasisRequest(options) : buildJobRequest(target, options))))))));
  if (!request.public && !apiKey) throw new Error("Set UPLOADCHECK_API_KEY or pass --api-key.");
  const payload = request.kind === "signed_upload"
    ? await runSignedUploadJob(request, apiKey)
    : (request.method === "GET" ? await getJson(request.apiBaseUrl, request.path, apiKey) : await postJson(request.apiBaseUrl, request.path, request.payload, apiKey));

  console.log(options.json ? JSON.stringify(payload, null, 2) : formatSummary(request.kind, payload));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}

function formatSummary(kind, payload) {
  if (kind === "usage") return formatUsageSummary(payload);
  if (kind === "launch_status") return formatLaunchStatusSummary(payload);
  if (kind === "launch_handoff") return formatLaunchHandoffSummary(payload);
  if (kind === "launch_doctor") return formatLaunchDoctorSummary(payload);
  if (kind === "pipeline_handoff") return formatPipelineHandoffSummary(payload);
  if (kind === "pipeline_recipes") return formatPipelineRecipesSummary(payload);
  if (kind === "cost_basis") return formatCostBasisSummary(payload);
  return formatJobSummary(payload);
}

async function runSignedUploadJob(request, apiKey) {
  const upload = await postJson(request.apiBaseUrl, request.createUpload.path, request.createUpload.payload, apiKey);
  const putResponse = await fetch(upload.signedPutUrl, {
    method: "PUT",
    headers: {
      "content-type": request.contentType,
      "content-length": String(request.sizeBytes)
    },
    body: createReadStream(request.filePath),
    duplex: "half"
  });
  if (!putResponse.ok) {
    const text = await putResponse.text();
    throw new Error(`UploadCheck upload ${putResponse.status}: ${text}`);
  }
  const jobPayload = {
    ...request.createJob.payload,
    upload_id: upload.uploadId
  };
  return postJson(request.apiBaseUrl, request.createJob.path, jobPayload, apiKey);
}

async function postJson(apiBaseUrl, path, payload, apiKey) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(payload)
  });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(`UploadCheck API ${response.status}: ${JSON.stringify(body)}`);
  }
  return body;
}

async function getJson(apiBaseUrl, path, apiKey) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: "GET",
    headers: apiKey ? {
      authorization: `Bearer ${apiKey}`
    } : undefined
  });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(`UploadCheck API ${response.status}: ${JSON.stringify(body)}`);
  }
  return body;
}
