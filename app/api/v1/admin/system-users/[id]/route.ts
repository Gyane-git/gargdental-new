import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import { recordAuditLog } from "@/lib/auditLog";
import { deleteAdminUser, fetchAdminUserById, saveAdminUser } from "@/lib/adminUsersDb";

// Ports gargnew's app/api/v1/admin/system-users/[id]/route.js.
/**
 * @swagger
 * /api/v1/admin/system-users/{id}:
 *   get:
 *     summary: Get a single system (admin) user by id (admin token)
 *     tags: [SystemUsers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: User fetched successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 user:
 *                   type: object
 *                   description: Admin user (id, name, fullName, email, phone, address, country, profilePhotoPath, roleId, accountType, status, createdAt, updatedAt).
 *       401:
 *         description: Missing or invalid admin token.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthenticatedResponse'
 *       404:
 *         description: User not found.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "User not found." }
 *       500:
 *         description: Unexpected server error.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ServerErrorResponse'
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authUser = await requireAdminAuth(request);
  if (!authUser) {
    return NextResponse.json({ error: "Unauthenticated", message: "Valid authentication token required" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const user = await fetchAdminUserById(Number(id));
    if (!user) {
      return NextResponse.json({ success: false, message: "User not found." }, { status: 404 });
    }
    return NextResponse.json({ success: true, user });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Internal server error." },
      { status: 500 },
    );
  }
}

/**
 * @swagger
 * /api/v1/admin/system-users/{id}:
 *   put:
 *     summary: Update a system (admin) user (admin token)
 *     tags: [SystemUsers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               full_name: { type: string, description: "Alias: name. Required." }
 *               email: { type: string, description: Required. }
 *               phone: { type: string }
 *               address: { type: string }
 *               country: { type: string }
 *               role_id: { type: integer, description: "system-users/groups id." }
 *               accountType: { type: string, description: "Alias: account_type. Falls back to the role's name." }
 *               profile_photo_path: { type: string }
 *               password: { type: string, description: If provided, replaces the current password hash. }
 *     responses:
 *       200:
 *         description: System user updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "System user updated successfully." }
 *       400:
 *         description: Validation error (e.g. missing name/email).
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
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authUser = await requireAdminAuth(request);
  if (!authUser) {
    return NextResponse.json({ error: "Unauthenticated", message: "Valid authentication token required" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await request.json();
    const result = await saveAdminUser({ id: Number(id), body });

    if (!result.success) {
      return NextResponse.json({ success: false, message: result.message }, { status: result.status || 400 });
    }

    await recordAuditLog({
      adminId: authUser.id,
      action: "Update",
      module: "admins",
      modelType: "Admin",
      modelId: id,
      newData: body,
      ip: request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || null,
    });

    return NextResponse.json({ success: true, message: "System user updated successfully." });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Internal server error." },
      { status: 500 },
    );
  }
}

/**
 * @swagger
 * /api/v1/admin/system-users/{id}:
 *   delete:
 *     summary: Delete a system (admin) user (admin token)
 *     tags: [SystemUsers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: System user deleted successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "System user deleted successfully." }
 *       401:
 *         description: Missing or invalid admin token.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthenticatedResponse'
 *       404:
 *         description: User not found.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "User not found." }
 *       500:
 *         description: Unexpected server error.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ServerErrorResponse'
 */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authUser = await requireAdminAuth(request);
  if (!authUser) {
    return NextResponse.json({ error: "Unauthenticated", message: "Valid authentication token required" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const deleted = await deleteAdminUser(Number(id));
    if (!deleted) {
      return NextResponse.json({ success: false, message: "User not found." }, { status: 404 });
    }

    await recordAuditLog({
      adminId: authUser.id,
      action: "Delete",
      module: "admins",
      modelType: "Admin",
      modelId: id,
      ip: request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || null,
    });

    return NextResponse.json({ success: true, message: "System user deleted successfully." });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Internal server error." },
      { status: 500 },
    );
  }
}
