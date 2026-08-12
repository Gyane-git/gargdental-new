import fs from "fs";
import path from "path";
import crypto from "crypto";

// Ports App\Helpers\ConnectIPSToken::generateToken (ConnectIPSToken.php:20-58) exactly, including
// the literal signed-string format (field order matters - it's what the real ConnectIPS API
// re-derives and checks). Cert-reading logic ported from gargnew/lib/connectips-server.ts, which
// already solved locating/opening this same PEM file from a Next.js process. The cert lives at
// storage/app/certificates in this project - kept independent of mediaStoragePath() (public/storage)
// since that path no longer shares a parent directory with storage/app.
function certPath() {
  return (
    process.env.CONNECTIPS_CERT_PATH ||
    path.join(process.cwd(), "storage", "app", "certificates", "CREDITOR.pem")
  );
}

function signMessage(data: string): string {
  const file = certPath();
  if (!fs.existsSync(file)) {
    throw new Error(`PFX/PEM file not found at: ${file}`);
  }

  const pemContent = fs.readFileSync(file, "utf8");
  const passphrase = process.env.CONNECTIPS_CREDITOR_PASSWORD || process.env.CONNECT_IPS_CERT_PASSWORD || undefined;

  const privateKey = crypto.createPrivateKey(passphrase ? { key: pemContent, format: "pem", passphrase } : { key: pemContent, format: "pem" });

  const signature = crypto.sign("sha256", Buffer.from(data, "utf8"), privateKey);
  return signature.toString("base64");
}

// Used by the validatetxn/gettxndetail server-to-server API calls (lib/connectIpsService.ts),
// which ConnectIPS documents as signing only these 4 fields.
export function generateIpsToken(merchantId: string, appId: string, referenceId: string, txnAmt: number | string): string {
  return signMessage(`MERCHANTID=${merchantId},APPID=${appId},REFERENCEID=${referenceId},TXNAMT=${txnAmt}`);
}

// Used by the login-page redirect (app/connectips/get_token/route.ts). ConnectIPS re-derives the
// signature from every field of the auto-submitted form, in the exact order the fields were sent
// (including the literal TOKEN=TOKEN placeholder) - a narrower message here (or a different field
// order) fails signature verification on their end and immediately kicks the session, which is
// what a "session expired" page right after redirect actually means.
export function generateIpsLoginToken(payload: Record<string, unknown>): string {
  const message = Object.entries(payload)
    .map(([key, value]) => `${key}=${value ?? ""}`)
    .join(",");
  return signMessage(message);
}
