import { prisma } from "@/lib/prisma";
import { encrypt, decrypt } from "@/lib/encryption";
import { nowForDb } from "@/lib/dbTime";

// Lets admins configure SMTP from the dashboard instead of editing .env (see
// app/admin/email-settings/page.js). Stored in system_settings - the same generic key/value
// table app/api/v1/admin/website/route.ts already uses for site settings - rather than a
// dedicated table, so no migration is needed. mail_password is encrypted at rest (lib/encryption.ts);
// every other field is plain text same as the rest of system_settings.
const KEY_PREFIX = "mail_";

const FIELD_KEYS = ["host", "port", "username", "password", "encryption", "from_name", "from_address"] as const;
type FieldKey = (typeof FIELD_KEYS)[number];

export interface EmailSettings {
  host: string;
  port: number;
  username: string;
  password: string;
  encryption: "ssl" | "tls" | "none";
  from_name: string;
  from_address: string;
}

const settingKey = (field: FieldKey) => `${KEY_PREFIX}${field}`;

export async function getEmailSettings(): Promise<EmailSettings | null> {
  const rows = await prisma.system_settings.findMany({
    where: { key: { in: FIELD_KEYS.map(settingKey) } },
  });
  if (rows.length === 0) return null;

  const map: Record<string, string> = {};
  for (const row of rows) map[row.key] = row.value ?? "";

  const host = map[settingKey("host")] || "";
  const username = map[settingKey("username")] || "";
  const encryptedPassword = map[settingKey("password")] || "";
  if (!host || !username || !encryptedPassword) return null;

  let password = "";
  try {
    password = decrypt(encryptedPassword);
  } catch {
    return null; // corrupt/undecryptable ciphertext - fall back to env rather than send with a broken password
  }

  return {
    host,
    port: Number(map[settingKey("port")] || 465),
    username,
    password,
    encryption: (map[settingKey("encryption")] as EmailSettings["encryption"]) || "ssl",
    from_name: map[settingKey("from_name")] || "",
    from_address: map[settingKey("from_address")] || username,
  };
}

// Returns the saved settings with the password masked (never send the real password, or its
// ciphertext, back to the admin UI) - callers that need the real password for sending mail must
// use getEmailSettings() instead.
export async function getEmailSettingsMasked() {
  const settings = await getEmailSettings();
  if (!settings) return null;
  return { ...settings, password: settings.password ? "********" : "" };
}

export async function saveEmailSettings(input: Partial<EmailSettings>) {
  const updates: Array<[FieldKey, string]> = [];

  if (input.host !== undefined) updates.push(["host", String(input.host).trim()]);
  if (input.port !== undefined) updates.push(["port", String(input.port)]);
  if (input.username !== undefined) updates.push(["username", String(input.username).trim()]);
  if (input.encryption !== undefined) updates.push(["encryption", String(input.encryption)]);
  if (input.from_name !== undefined) updates.push(["from_name", String(input.from_name).trim()]);
  if (input.from_address !== undefined) updates.push(["from_address", String(input.from_address).trim()]);
  // Only overwrite the stored password when a new, real one is actually submitted - the admin UI
  // sends back the "********" mask on an unrelated field edit, and that must never clobber the
  // real encrypted password with the literal mask text.
  if (input.password !== undefined && input.password !== "" && input.password !== "********") {
    updates.push(["password", encrypt(String(input.password))]);
  }

  for (const [field, value] of updates) {
    const key = settingKey(field);
    const existing = await prisma.system_settings.findFirst({ where: { key } });
    if (existing) {
      await prisma.system_settings.update({ where: { id: existing.id }, data: { value, updated_at: nowForDb() } });
    } else {
      await prisma.system_settings.create({ data: { key, value, created_at: nowForDb(), updated_at: nowForDb() } });
    }
  }

  return getEmailSettingsMasked();
}
