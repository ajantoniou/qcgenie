import { lookup } from "node:dns/promises";

const DEFAULT_API_BASE_URL = "https://qcgenie-api.onrender.com";
const HOSTS = [
  { kind: "web", host: "uploadcheck.app", expectedRenderHost: "qcgenie-web.onrender.com", url: "https://uploadcheck.app/" },
  { kind: "web", host: "www.uploadcheck.app", expectedRenderHost: "qcgenie-web.onrender.com", url: "https://www.uploadcheck.app/" },
  { kind: "api", host: "api.uploadcheck.app", expectedRenderHost: "qcgenie-api.onrender.com", url: "https://api.uploadcheck.app/healthz" }
];

export async function buildLaunchCheck({ apiBaseUrl = process.env.UPLOADCHECK_API_BASE_URL || process.env.QCGENIE_API_BASE_URL || DEFAULT_API_BASE_URL, fetchImpl = fetch, resolver = lookup } = {}) {
  const readiness = await fetchJson(fetchImpl, `${apiBaseUrl.replace(/\/+$/, "")}/v1/readiness`);
  const domains = [];

  for (const target of HOSTS) {
    const dns = await checkDns(target, resolver);
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
  for (const domain of domains) {
    if (!domain.ok) blockers.push(`${domain.host}:${domain.dns.ok ? "http" : "dns"}`);
  }

  return {
    ready: blockers.length === 0,
    blockers,
    readiness,
    domains
  };
}

export function formatLaunchCheck(result) {
  const lines = [];
  lines.push(`UploadCheck launch: ${result.ready ? "READY" : "NOT READY"}`);
  lines.push(`Readiness: ${result.readiness.readyForProductHunt ? "PASS" : "BLOCK"}`);
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

async function checkDns(target, resolver) {
  try {
    const cname = await resolveCname(target.host);
    const addresses = await resolver(target.host, { all: true });
    const cnameMatches = cname.some((value) => stripDot(value) === target.expectedRenderHost);
    const addressOk = addresses.length > 0;
    return {
      ok: target.host === "uploadcheck.app" ? addressOk : (cnameMatches || addressOk),
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
