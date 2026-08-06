import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import { fetchAuditLogs, recordAuditLog } from "@/lib/auditLog";

// Ports gargnew's app/api/v1/admin/audit-logs/route.js, adapted to the real audit_logs schema
// (see lib/auditLog.ts's top comment).
/**
 * @swagger
 * /api/v1/admin/audit-logs:
 *   get:
 *     summary: List audit log entries with optional filters and pagination (admin token)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         required: false
 *         description: Max rows to return, clamped to 2000. Defaults to 500.
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *         required: false
 *         description: Rows to skip. Defaults to 0.
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         required: false
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         required: false
 *       - in: query
 *         name: module
 *         schema:
 *           type: string
 *         required: false
 *       - in: query
 *         name: action
 *         schema:
 *           type: string
 *         required: false
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         required: false
 *         description: Matches against module, action or model type.
 *     responses:
 *       200:
 *         description: Audit logs fetched successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 logs:
 *                   type: array
 *                   items:
 *                     type: object
 *                     description: Audit log entry (admin, role, action, module, model, recordId, ip, summary, details, rawDate, date, time).
 *                 count: { type: integer, description: Total matching rows (ignoring limit/offset). }
 *                 limit: { type: integer }
 *                 offset: { type: integer }
 *       401:
 *         description: Missing or invalid admin token.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthenticatedResponse'
 *       500:
 *         description: Unexpected server error.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ServerErrorResponse'
 */
export async function GET(request: NextRequest) {
  const authUser = await requireAdminAuth(request);
  if (!authUser) {
    return NextResponse.json({ error: "Unauthenticated", message: "Valid authentication token required" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(Number(searchParams.get("limit") || 500) || 500, 2000);
    const offset = Math.max(Number(searchParams.get("offset") || 0) || 0, 0);

    const filters = {
      startDate: searchParams.get("startDate") || "",
      endDate: searchParams.get("endDate") || "",
      module: searchParams.get("module") || "",
      action: searchParams.get("action") || "",
      search: searchParams.get("search") || "",
    };

    const result = await fetchAuditLogs({ limit, offset, filters });

    return NextResponse.json({
      success: true,
      logs: result.logs,
      count: result.count,
      limit,
      offset,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Internal server error." },
      { status: 500 },
    );
  }
}

/**
 * @swagger
 * /api/v1/admin/audit-logs:
 *   post:
 *     summary: Record an audit log entry (admin token)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               action: { type: string, example: "Update", description: "Defaults to \"Update\" if omitted." }
 *               module: { type: string, example: "system", description: "Defaults to \"system\" if omitted." }
 *               model: { type: string, description: "Alias for model_type." }
 *               model_type: { type: string }
 *               record_id: { type: string, description: "Alias for model_id." }
 *               model_id: { type: string }
 *               metadata: { type: object, description: "Stored as new_data. Falls back to the whole request body if omitted." }
 *     responses:
 *       201:
 *         description: Audit log saved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Audit log saved successfully." }
 *       401:
 *         description: Missing or invalid admin token.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthenticatedResponse'
 *       500:
 *         description: Unexpected server error.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ServerErrorResponse'
 */
export async function POST(request: NextRequest) {
  const authUser = await requireAdminAuth(request);
  if (!authUser) {
    return NextResponse.json({ error: "Unauthenticated", message: "Valid authentication token required" }, { status: 401 });
  }

  try {
    const body = await request.json();
    await recordAuditLog({
      adminId: authUser.id,
      action: body.action || "Update",
      module: body.module || "system",
      modelType: body.model || body.model_type || null,
      modelId: body.record_id || body.model_id || null,
      newData: body.metadata || body,
      ip: request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || null,
    });

    return NextResponse.json({ success: true, message: "Audit log saved successfully." }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Internal server error." },
      { status: 500 },
    );
  }
}
