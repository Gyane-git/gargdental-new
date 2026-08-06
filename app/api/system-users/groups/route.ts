import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import { recordAuditLog } from "@/lib/auditLog";
import { fetchAdminRoles, fetchAdminRoleById, saveAdminRole } from "@/lib/adminUsersDb";

// Ports gargnew's app/api/system-users/groups/route.js.
/**
 * @swagger
 * /api/system-users/groups:
 *   get:
 *     summary: List user groups/roles (admin token)
 *     tags: [SystemUsers]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Groups fetched successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 groups:
 *                   type: array
 *                   items:
 *                     type: object
 *                     description: Admin role/group (id, groupName, permissions, status, createdAt, updatedAt).
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
    const groups = await fetchAdminRoles();
    return NextResponse.json({ success: true, groups });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Internal server error." },
      { status: 500 },
    );
  }
}

/**
 * @swagger
 * /api/system-users/groups:
 *   post:
 *     summary: Create a user group/role (admin token)
 *     tags: [SystemUsers]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [groupName]
 *             properties:
 *               groupName: { type: string, description: "Aliases: group_name, name." }
 *               permissions:
 *                 description: Stored as JSON if an array is sent, otherwise as a plain string.
 *                 oneOf:
 *                   - type: array
 *                     items: { type: string }
 *                   - type: string
 *               status: { type: string, description: "\"inactive\" or 0 sets inactive; anything else (including omitted) sets active." }
 *     responses:
 *       201:
 *         description: Group created successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Group created successfully." }
 *                 group: { type: object, description: Same shape as GET's group items. }
 *       400:
 *         description: Missing group name.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string }
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
    const result = await saveAdminRole({ body });

    if (!result.success) {
      return NextResponse.json({ success: false, message: result.message }, { status: result.status || 400 });
    }

    await recordAuditLog({
      adminId: authUser.id,
      action: "Create",
      module: "admin_roles",
      modelType: "AdminRole",
      modelId: String(result.id),
      newData: body,
      ip: request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || null,
    });

    const group = await fetchAdminRoleById(result.id as number);

    return NextResponse.json({ success: true, message: "Group created successfully.", group }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Internal server error." },
      { status: 500 },
    );
  }
}
