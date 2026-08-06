// Ports App\Services\ConnectIPSService (ConnectIPSService.php) - HTTP calls to the real
// ConnectIPS bank API. Base URL/credentials read from the same CONNECT_IPS_*/CONNECTIPS_*
// env vars already present in .env (mapped from gargdental's config/connectips.php).
const baseUrl = () => process.env.CONNECT_IPS_BASE_URL || process.env.NEXT_PUBLIC_CONNECTIPS_BASE_URL || "https://login.connectips.com";
const appId = () => process.env.CONNECT_IPS_APP_ID || process.env.NEXT_PUBLIC_CONNECTIPS_APPID || "";
const password = () => process.env.CONNECT_IPS_PASSWORD || process.env.CONNECTIPS_AUTH_PASSWORD || "";

async function postBasicAuth(url: string, body: Record<string, unknown>) {
  const auth = Buffer.from(`${appId()}:${password()}`).toString("base64");
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Basic ${auth}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`ConnectIPS API request failed: ${await res.text()}`);
  }
  return res.json();
}

export async function validateIpsTransaction(referenceId: string, txnAmt: number, token: string) {
  const url = `${baseUrl().replace(/\/+$/, "")}/connectipswebws/api/creditor/validatetxn`;
  return postBasicAuth(url, {
    merchantId: process.env.CONNECT_IPS_MERCHANT_ID || process.env.NEXT_PUBLIC_CONNECTIPS_MERCHANTID,
    appId: appId(),
    referenceId,
    txnAmt,
    token,
  });
}

export async function ipsDetails(referenceId: string, txnAmt: number, token: string) {
  const url = `${baseUrl().replace(/\/+$/, "")}/connectipswebws/api/creditor/gettxndetail`;
  return postBasicAuth(url, {
    merchantId: process.env.CONNECT_IPS_MERCHANT_ID || process.env.NEXT_PUBLIC_CONNECTIPS_MERCHANTID,
    appId: appId(),
    referenceId,
    txnAmt,
    token,
  });
}
