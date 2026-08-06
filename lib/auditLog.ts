import { prisma } from "@/lib/prisma";
import { nowForDb } from "@/lib/dbTime";

// Ports gargnew's utils/auditLogs.js CONTRACT (the admin UI's expected response field names:
// admin, role, action, module, model, recordId, ip, summary, details, rawDate, date, time) but
// against the REAL audit_logs table this project's Prisma schema was introspected from
// (admin_id, action, module, model_type, model_id, old_data, new_data, ip, user_agent) - gargnew
// built its OWN ad-hoc audit_logs table at runtime (admin_name/role/record_id/metadata columns)
// against a database that apparently lacked one; our live DB already has a real,
// Laravel-migration-created audit_logs table with different column names entirely. Adapted to
// use the real schema, keeping the OUTPUT shape identical so the copied admin UI needs no changes.

interface RecordAuditLogInput {
  adminId?: number | null;
  action: string;
  module: string;
  modelType?: string | null;
  modelId?: string | null;
  oldData?: unknown;
  newData?: unknown;
  ip?: string | null;
  userAgent?: string | null;
}

export async function recordAuditLog(input: RecordAuditLogInput) {
  await prisma.audit_logs.create({
    data: {
      admin_id: input.adminId != null ? BigInt(input.adminId) : null,
      action: input.action,
      module: input.module,
      model_type: input.modelType || "",
      model_id: input.modelId != null ? BigInt(input.modelId) : null,
      old_data: input.oldData !== undefined ? JSON.stringify(input.oldData) : null,
      new_data: input.newData !== undefined ? JSON.stringify(input.newData) : null,
      ip: input.ip || null,
      user_agent: input.userAgent || null,
      created_at: nowForDb(),
      updated_at: nowForDb(),
    },
  });
}

const toDateParts = (value: Date | null) => {
  if (!value) return { rawDate: "", date: "", time: "" };
  return {
    rawDate: value.toISOString().slice(0, 10),
    date: value.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }),
    time: value.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: true }),
  };
};

export interface AuditLogFilters {
  startDate?: string;
  endDate?: string;
  module?: string;
  action?: string;
  search?: string;
}

export async function fetchAuditLogs({
  limit = 200,
  offset = 0,
  filters = {},
}: {
  limit?: number;
  offset?: number;
  filters?: AuditLogFilters;
}) {
  const where: Record<string, unknown> = {};
  if (filters.module) where.module = filters.module;
  if (filters.action) where.action = filters.action;
  if (filters.startDate || filters.endDate) {
    where.created_at = {
      ...(filters.startDate ? { gte: new Date(filters.startDate) } : {}),
      ...(filters.endDate ? { lte: new Date(`${filters.endDate}T23:59:59.999Z`) } : {}),
    };
  }
  if (filters.search) {
    where.OR = [
      { module: { contains: filters.search } },
      { action: { contains: filters.search } },
      { model_type: { contains: filters.search } },
    ];
  }

  const [rows, count] = await Promise.all([
    prisma.audit_logs.findMany({ where, orderBy: { id: "desc" }, take: limit, skip: offset }),
    prisma.audit_logs.count({ where }),
  ]);

  const adminIds = [...new Set(rows.map((r) => r.admin_id).filter((id): id is bigint => id !== null))];
  const admins = adminIds.length
    ? await prisma.admins.findMany({ where: { id: { in: adminIds.map((id) => Number(id)) } } })
    : [];
  const adminById = new Map(admins.map((a) => [a.id, a]));

  const logs = rows.map((row) => {
    const parts = toDateParts(row.created_at);
    const admin = row.admin_id ? adminById.get(Number(row.admin_id)) : null;
    let details: unknown = null;
    try {
      details = { old: row.old_data ? JSON.parse(row.old_data) : null, new: row.new_data ? JSON.parse(row.new_data) : null };
    } catch {
      details = { old: row.old_data, new: row.new_data };
    }

    return {
      id: Number(row.id),
      admin: admin?.name || "System",
      role: "",
      action: row.action,
      module: row.module,
      model: row.model_type || "",
      recordId: row.model_id ? String(row.model_id) : "",
      ip: row.ip || "",
      summary: `${row.action} ${row.model_type || row.module}${row.model_id ? ` #${row.model_id}` : ""}`,
      details,
      rawDate: parts.rawDate,
      date: parts.date,
      time: parts.time,
    };
  });

  return { logs, count };
}
