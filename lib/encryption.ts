import crypto from "crypto";

// Symmetric encryption for secrets stored in the DB (currently just the SMTP password in
// system_settings - see lib/emailSettings.ts). Keyed off NEXTAUTH_SECRET (already required, used
// to sign auth JWTs) so no new secret needs provisioning - SHA-256 of it gives a stable 32-byte
// AES-256 key.
const getKey = () => crypto.createHash("sha256").update(String(process.env.NEXTAUTH_SECRET || "")).digest();

const IV_LENGTH = 12; // AES-GCM standard nonce size

export const encrypt = (plainText: string): string => {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("base64"), authTag.toString("base64"), encrypted.toString("base64")].join(".");
};

export const decrypt = (cipherText: string): string => {
  const [ivB64, authTagB64, dataB64] = cipherText.split(".");
  if (!ivB64 || !authTagB64 || !dataB64) throw new Error("Malformed ciphertext");

  const decipher = crypto.createDecipheriv("aes-256-gcm", getKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(authTagB64, "base64"));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]);
  return decrypted.toString("utf8");
};
