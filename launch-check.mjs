import { lookup } from "node:dns/promises";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const DEFAULT_API_BASE_URL = "https://api.uploadcheck.app";
const LAUNCH_TARGETS = JSON.parse(readFileSync(resolve("public/launch-targets.json"), "utf8"));
const HOSTS = LAUNCH_TARGETS.http_targets.map((target) => ({
  kind: target.kind,
  host: target.host,
  expectedRenderHost: target.expected_render_host,
  expectedAddresses: target.expected_addresses || [],
  url: target.url
}));

export async function buildLaunchCheck({
  apiBaseUrl = process.env.UPLOADCHECK_API_BASE_URL || process.env.QCGENIE_API_BASE_URL || DEFAULT_API_BASE_URL,
  fetchImpl = fetch,
  resolver = lookup,
  cnameResolver = resolveCname
} = {}) {
  const normalizedApiBaseUrl = apiBaseUrl.replace(/\/+$/, "");
  const readiness = await fetchJson(fetchImpl, `${normalizedApiBaseUrl}/v1/readiness`);
  const launchStatus = await fetchJson(fetchImpl, `${normalizedApiBaseUrl}/v1/launch-status`);
  const domains = [];

  for (const target of HOSTS) {
    const dns = await checkDns(target, resolver, cnameResolver);
    const http = await checkHttp(target, fetchImpl);
    domains.push({
      ...target,
      dns,
      http,
      ok: dns.ok && http.ok
    });
  }

  const blockers = [];
  if (!readiness.readyForProductHunt) blockers.push("readiness");
  if (!launchStatus.product_hunt_ready) blockers.push("launch-status");
  if (Boolean(launchStatus.product_hunt_ready) !== Boolean(readiness.readyForProductHunt)) blockers.push("readiness-launch-status-mismatch");
  for (const domain of domains) {
    if (!domain.ok) blockers.push(`${domain.host}:${domain.dns.ok ? "http" : "dns"}`);
  }

  return {
    ready: blockers.length === 0,
    blockers,
    readiness,
    launchStatus,
    domains
  };
}

export function formatLaunchCheck(result) {
  const lines = [];
  lines.push(`UploadCheck launch: ${result.ready ? "READY" : "NOT READY"}`);
  lines.push(`Readiness: ${result.readiness.readyForProductHunt ? "PASS" : "BLOCK"}`);
  lines.push(`Launch status: ${result.launchStatus.product_hunt_ready ? "PASS" : "BLOCK"}`);
  lines.push("");
  for (const domain of result.domains) {
    lines.push(`${domain.ok ? "PASS" : "BLOCK"} ${domain.host}`);
    lines.push(`  dns: ${domain.dns.ok ? "PASS" : "BLOCK"}${domain.dns.cname ? ` cname=${domain.dns.cname}` : ""}${domain.dns.addresses?.length ? ` addresses=${domain.dns.addresses.join(",")}` : ""}`);
    lines.push(`  http: ${domain.http.ok ? "PASS" : "BLOCK"}${domain.http.status ? ` status=${domain.http.status}` : ""}${domain.http.error ? ` error=${domain.http.error}` : ""}`);
  }
  if (result.blockers.length) {
    lines.push("");
    lines.push(`Blockers: ${result.blockers.join(", ")}`);
  }
  return lines.join("\n");
}

async function fetchJson(fetchImpl, url) {
  const response = await fetchImpl(url);
  if (!response.ok) throw new Error(`Readiness fetch failed: HTTP ${response.status}`);
  return response.json();
}

async function checkDns(target, resolver, cnameResolver = resolveCname) {
  try {
    const cname = await cnameResolver(target.host);
    const addresses = await resolver(target.host, { all: true });
    const cnameMatches = cname.some((value) => stripDot(value) === target.expectedRenderHost);
    const expectedAddresses = target.expectedAddresses || [];
    const addressOk = expectedAddresses.length
      ? addresses.some((item) => expectedAddresses.includes(item.address))
      : false;
    return {
      ok: target.host === "uploadcheck.app" ? (cnameMatches || addressOk) : cnameMatches,
      cname: cname[0] || null,
      addresses: addresses.map((item) => item.address)
    };
  } catch (error) {
    return { ok: false, cname: null, addresses: [], error: error instanceof Error ? error.message : "dns_error" };
  }
}

async function resolveCname(host) {
  try {
    const dns = await import("node:dns/promises");
    return await dns.resolveCname(host);
  } catch {
    return [];
  }
}

async function checkHttp(target, fetchImpl) {
  try {
    const response = await fetchImpl(target.url, { method: "GET", redirect: "manual" });
    const ok = target.kind === "api"
      ? response.ok
      : (response.ok || [301, 302, 307, 308].includes(response.status));
    return { ok, status: response.status };
  } catch (error) {
    return { ok: false, status: null, error: error instanceof Error ? error.message : "http_error" };
  }
}

function stripDot(value) {
  return String(value || "").replace(/\.$/, "");
}
