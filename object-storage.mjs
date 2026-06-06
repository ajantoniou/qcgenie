import { createHash, createHmac } from "node:crypto";
import { createReadStream } from "node:fs";

export function getObjectStorageConfig(env = process.env) {
  const bucket = env.UPLOADCHECK_STORAGE_BUCKET || env.UPLOADCHECK_S3_BUCKET || env.UPLOADCHECK_R2_BUCKET || "";
  const endpoint = env.UPLOADCHECK_STORAGE_ENDPOINT || env.UPLOADCHECK_S3_ENDPOINT || env.UPLOADCHECK_R2_ENDPOINT || "";
  const accessKeyId = env.UPLOADCHECK_STORAGE_ACCESS_KEY_ID || env.UPLOADCHECK_S3_ACCESS_KEY_ID || env.UPLOADCHECK_R2_ACCESS_KEY_ID || "";
  const secretAccessKey = env.UPLOADCHECK_STORAGE_SECRET_ACCESS_KEY || env.UPLOADCHECK_S3_SECRET_ACCESS_KEY || env.UPLOADCHECK_R2_SECRET_ACCESS_KEY || "";
  const region = env.UPLOADCHECK_STORAGE_REGION || env.UPLOADCHECK_S3_REGION || env.UPLOADCHECK_R2_REGION || "auto";
  const publicBaseUrl = env.UPLOADCHECK_STORAGE_PUBLIC_BASE_URL || "";
  const prefix = (env.UPLOADCHECK_STORAGE_PREFIX || "uploads").replace(/^\/+|\/+$/g, "");
  const configured = Boolean(bucket && endpoint && accessKeyId && secretAccessKey);
  return { configured, bucket, endpoint: endpoint.replace(/\/+$/, ""), accessKeyId, secretAccessKey, region, publicBaseUrl: publicBaseUrl.replace(/\/+$/, ""), prefix };
}

export function objectStorageMode(env = process.env) {
  return getObjectStorageConfig(env).configured ? "object_storage" : "object_storage_incomplete";
}

export function objectKeyForUpload(upload, filename = upload?.filename || "upload.mp4", env = process.env) {
  const safeName = String(filename || "upload.mp4").replace(/[^a-zA-Z0-9._-]+/g, "_");
  return `${getObjectStorageConfig(env).prefix}/${upload.uploadId}-${safeName}`;
}

export async function uploadFileToObjectStorage(filePath, { key, contentType, sha256, env = process.env } = {}) {
  const config = getObjectStorageConfig(env);
  if (!config.configured) throw new Error("object_storage_not_configured");
  if (!key) throw new Error("object_storage_key_required");

  const url = `${config.endpoint}/${encodeURIComponent(config.bucket)}/${key.split("/").map(encodeURIComponent).join("/")}`;
  const now = new Date();
  const amzDate = toAmzDate(now);
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256 || "UNSIGNED-PAYLOAD";
  const parsed = new URL(url);
  const headers = {
    "content-type": contentType || "application/octet-stream",
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate
  };
  const authorization = signV4({
    method: "PUT",
    url: parsed,
    headers,
    payloadHash,
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    region: config.region,
    dateStamp,
    amzDate
  });

  const response = await fetch(url, {
    method: "PUT",
    headers: { ...headers, Authorization: authorization },
    body: createReadStream(filePath),
    duplex: "half"
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`object_storage_put_failed:${response.status}:${text.slice(0, 160)}`);
  }
  return {
    storageMode: "object_storage",
    objectKey: key,
    objectUrl: config.publicBaseUrl ? `${config.publicBaseUrl}/${key}` : `s3://${config.bucket}/${key}`
  };
}

function signV4({ method, url, headers, payloadHash, accessKeyId, secretAccessKey, region, dateStamp, amzDate }) {
  const service = "s3";
  const lowerHeaders = Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), String(value)]));
  lowerHeaders.host = url.host;
  const signedHeaders = Object.keys(lowerHeaders).sort().join(";");
  const canonicalHeaders = Object.keys(lowerHeaders).sort().map((key) => `${key}:${lowerHeaders[key]}\n`).join("");
  const canonicalRequest = [
    method,
    url.pathname,
    url.searchParams.toString(),
    canonicalHeaders,
    signedHeaders,
    payloadHash
  ].join("\n");
  const scope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    scope,
    sha256Hex(canonicalRequest)
  ].join("\n");
  const signingKey = hmac(hmac(hmac(hmac(`AWS4${secretAccessKey}`, dateStamp), region), service), "aws4_request");
  const signature = createHmac("sha256", signingKey).update(stringToSign).digest("hex");
  return `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
}

function toAmzDate(date) {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

function hmac(key, value) {
  return createHmac("sha256", key).update(value).digest();
}

function sha256Hex(value) {
  return createHash("sha256").update(value).digest("hex");
}
