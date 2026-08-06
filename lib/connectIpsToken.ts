import fs from "fs";
import path from "path";
import crypto from "crypto";
import { mediaStoragePath } from "@/lib/mediaStorage";

// Ports App\Helpers\ConnectIPSToken::generateToken (ConnectIPSToken.php:20-58) exactly, including
// the literal signed-string format (field order matters - it's what the real ConnectIPS API
// re-derives and checks). Cert-reading logic ported from gargnew/lib/connectips-server.ts, which
// already solved locating/opening this same PEM file from a Next.js process. The cert lives one
// level up from storage/app/public (storage/app/certificates), same layout gargdental used.
function certPath() {
  return path.join(path.dirname(mediaStoragePath()), "certificates", "CREDITOR.pem");
}

export function generateIpsToken(merchantId: string, appId: string, referenceId: string, txnAmt: number | string): string {
  const data = `MERCHANTID=${merchantId},APPID=${appId},REFERENCEID=${referenceId},TXNAMT=${txnAmt}`;

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
