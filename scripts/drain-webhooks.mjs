const apiBaseUrl = process.env.QCGENIE_API_BASE_URL || "https://qcgenie-api.onrender.com";
const apiKey = process.env.QCGENIE_API_KEY;
const limit = Number(process.env.QCGENIE_DRAIN_LIMIT || 25);

if (!apiKey) {
  throw new Error("QCGENIE_API_KEY is required to drain webhook deliveries.");
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
  throw new Error(`QC Genie webhook drain failed: HTTP ${response.status} ${JSON.stringify(payload)}`);
}

console.log(JSON.stringify({
  ok: true,
  apiBaseUrl,
  processed: payload.processed || 0,
  sent: (payload.results || []).filter((result) => result.status === "sent").length,
  pending: (payload.results || []).filter((result) => result.status === "pending").length,
  failed: (payload.results || []).filter((result) => result.status === "failed").length
}));
