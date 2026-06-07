const apiBaseUrl = process.env.UPLOADCHECK_API_BASE_URL || "https://api.uploadcheck.app";
const apiKey = process.env.UPLOADCHECK_API_KEY;
const limit = Number(process.env.UPLOADCHECK_DRAIN_LIMIT || 25);

if (!apiKey) {
  throw new Error("UPLOADCHECK_API_KEY is required to drain webhook deliveries.");
}

const response = await fetch(`${apiBaseUrl}/v1/webhooks/deliveries/drain`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    authorization: `Bearer ${apiKey}`
  },
  body: JSON.stringify({ limit })
});

const text = await response.text();
let payload;
try {
  payload = text ? JSON.parse(text) : {};
} catch {
  payload = { raw: text };
}

if (!response.ok) {
  throw new Error(`UploadCheck.app webhook drain failed: HTTP ${response.status} ${JSON.stringify(payload)}`);
}

console.log(JSON.stringify({
  ok: true,
  apiBaseUrl,
  processed: payload.processed || 0,
  sent: (payload.results || []).filter((result) => result.status === "sent").length,
  pending: (payload.results || []).filter((result) => result.status === "pending").length,
  failed: (payload.results || []).filter((result) => result.status === "failed").length
}));
