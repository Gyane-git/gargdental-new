import { prisma } from "@/lib/prisma";
import { nowForDb } from "@/lib/dbTime";
import type { compliances } from "@prisma/client";

// Ports gargnew's utils/compliance.js. Schema-agnostic (key/value table), no adaptation needed.
export function parseComplianceValue(value: unknown): unknown {
  if (value == null) return null;
  if (typeof value === "object") return value;
  if (typeof value !== "string") return value;

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export function formatComplianceRecord(row: compliances) {
  const parsed = parseComplianceValue(row.value) as Record<string, unknown> | string | null;
  const isObject = parsed && typeof parsed === "object" && !Array.isArray(parsed);

  const value = isObject
    ? (parsed as Record<string, unknown>).value ||
      (parsed as Record<string, unknown>).content ||
      (parsed as Record<string, unknown>).aboutUsContent ||
      (parsed as Record<string, unknown>).description ||
      (parsed as Record<string, unknown>).text ||
      JSON.stringify(parsed)
    : parsed || "";

  const compliancefiles = isObject
    ? (parsed as Record<string, unknown>).compliancefiles ||
      (parsed as Record<string, unknown>).certifications ||
      (parsed as Record<string, unknown>).files ||
      []
    : [];

  return {
    id: row.id,
    key: row.key,
    value,
    raw_value: row.value,
    compliancefiles,
    data: parsed,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function fetchComplianceRowByKey(key: string) {
  return prisma.compliances.findFirst({ where: { key } });
}

export async function fetchAllComplianceRows() {
  return prisma.compliances.findMany({ orderBy: { id: "desc" } });
}

export async function upsertCompliance(key: string, value: unknown) {
  const existing = await fetchComplianceRowByKey(key);
  const payload = typeof value === "string" ? value : JSON.stringify(value);

  if (existing?.id) {
    await prisma.compliances.update({ where: { id: existing.id }, data: { value: payload, updated_at: nowForDb() } });
  } else {
    await prisma.compliances.create({ data: { key, value: payload, created_at: nowForDb(), updated_at: nowForDb() } });
  }
}
