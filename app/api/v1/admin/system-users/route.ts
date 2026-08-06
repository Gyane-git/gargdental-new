import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import { recordAuditLog } from "@/lib/auditLog";
import { fetchAdminUsers, saveAdminUser } from "@/lib/adminUsersDb";

// Ports gargnew's app/api/v1/admin/system-users/route.js.
/**
 * @swagger
 * /api/v1/admin/system-users:
 *   get:
 *     summary: List system (admin) users (admin token)
 *     tags: [SystemUsers]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: System users fetched successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 admins:
 *                   type: array
 *                   items:
 *                     type: object
 *                     description: Admin user (id, name, fullName, email, phone, address, country, profilePhotoPath, roleId, accountType, status, createdAt, updatedAt).
 *                 count: { type: integer }
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
    const admins = await fetchAdminUsers();
    return NextResponse.json({ success: true, admins, count: admins.length });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Internal server error." },
      { status: 500 },
    );
  }
}

/**
 * @swagger
 * /api/v1/admin/system-users:
 *   post:
 *     summary: Create a system (admin) user (admin token)
 *     tags: [SystemUsers]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [full_name, email, password, role_id]
 *             properties:
 *               full_name: { type: string, description: "Alias: name." }
 *               email: { type: string }
 *               phone: { type: string }
 *               address: { type: string }
 *               country: { type: string }
 *               role_id: { type: integer, description: "system-users/groups id. Required for new users." }
 *               accountType: { type: string, description: "Alias: account_type. Falls back to the role's name." }
 *               profile_photo_path: { type: string }
 *               password: { type: string, description: Required for new users. }
 *     responses:
 *       201:
 *         description: System user created successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "System user created successfully." }
 *                 userId: { type: integer }
 *       400:
 *         description: Validation error (e.g. missing name/email/password/role_id).
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
 *       409:
 *         description: Email is already in use by another admin.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Email is already in use by another admin." }
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
    const result = await saveAdminUser({ body });

    if (!result.success) {
      return NextResponse.json({ success: false, message: result.message }, { status: result.status || 400 });
    }

    await recordAuditLog({
      adminId: authUser.id,
      action: "Create",
      module: "admins",
      modelType: "Admin",
      modelId: String(result.id),
      newData: body,
      ip: request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || null,
    });

    return NextResponse.json(
      { success: true, message: "System user created successfully.", userId: result.id },
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Internal server error." },
      { status: 500 },
    );
  }
}
